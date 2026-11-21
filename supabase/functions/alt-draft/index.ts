import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import Anthropic from 'npm:@anthropic-ai/sdk@1.8.0'
import { ALT_DRAFTS_PER_MONTH, ALT_MAX_LENGTH, altContext } from '../_shared/altContext.ts'
import {
  CORS,
  NO_KEY,
  UUID,
  base64,
  caller,
  costLog,
  json,
  recordUse,
  tokensIn,
  usedThisMonth,
} from '../_shared/studio.ts'

/**
 * Drafts alt text for one photograph.
 *
 * Phase 11's first slice, built on Phase 5's story studio and shaped like
 * `story-draft`: the owner asks, this looks at the photograph and returns a
 * draft, and nothing is published here. The draft is saved as a draft; only
 * the owner's own Save in the photo editor puts words in `photos.alt`, so text
 * she wrote herself can never be overwritten by a suggestion.
 *
 * Runs with JWT verification on, through the same plumbing as the other AI
 * functions (`_shared/studio.ts`): row-level security decides what she may
 * describe. It does not use `photoBlocks`, which tells the model private
 * captions and notes: only text a visitor can already read is sent with the
 * picture here. See `_shared/altContext.ts` for why.
 */

/** The same model as stories: it already reads these albums, at about a quarter of a cent a photo. */
const MODEL = 'claude-sonnet-5-5'
const OPERATION = 'alt'

/**
 * Following WebAIM's and the W3C's alt text guidance: what is in the picture
 * and why it matters, concisely, without "image of". Wrong alt text is worse
 * than none, because the people who rely on it cannot see that it is wrong, so
 * the model is told to leave things out rather than guess.
 */
const SYSTEM = `You write alt text: the description a screen reader speaks in place of a photograph, for someone who cannot see it.

You will see one photograph from a personal album, with any text that visitors to the album can already read.

Describe what matters in the photograph in one or two plain sentences, usually under 150 characters. Lead with the subject and what is happening. Do not begin with "image of", "photo of" or "picture of".

Use a person's name only if the text you are given names them; otherwise describe people, never identify them. Do not guess anyone's age, ethnicity, relationship or feelings beyond what is plainly visible. If the photograph contains text that matters, such as a sign or a cake's inscription, include it. If a caption will also be heard, add to it rather than repeat it. If something is unclear, leave it out rather than guess.

Write in the language the album's text is written in, or English if there is none. Return only the alt text.`

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json({ error: NO_KEY }, 503)

  let input: { photoId?: unknown }
  try {
    input = await request.json()
  } catch {
    return json({ error: 'The request could not be read.' }, 400)
  }

  const photoId = typeof input.photoId === 'string' && UUID.test(input.photoId) ? input.photoId : null
  if (!photoId) return json({ error: 'No photograph was named.' }, 400)

  const who = await caller(request)
  if (!who) return json({ error: 'Please sign in again.' }, 401)

  // As the owner: RLS answers "is this yours". Another owner's id matches nothing.
  const photo = await who.asOwner
    .from('photos')
    .select('id, album_id, storage_path, display_path, caption, caption_visibility')
    .eq('id', photoId)
    .maybeSingle()
  if (photo.error) return json({ error: photo.error.message }, 500)
  if (!photo.data) return json({ error: 'not found' }, 404)

  const album = await who.asOwner
    .from('albums')
    .select('title, description')
    .eq('id', photo.data.album_id)
    .maybeSingle()
  if (album.error || !album.data) return json({ error: album.error?.message ?? 'not found' }, 500)

  const used = await usedThisMonth(who, OPERATION)
  if (used >= ALT_DRAFTS_PER_MONTH) {
    return json(
      {
        error: `You have used all ${ALT_DRAFTS_PER_MONTH} suggested descriptions for this month.`,
        used,
        limit: ALT_DRAFTS_PER_MONTH,
      },
      429,
    )
  }

  const stories = await who.asOwner
    .from('photo_stories')
    .select('body, visibility')
    .eq('photo_id', photoId)
  if (stories.error) return json({ error: stories.error.message }, 500)

  const stored = await who.service.storage
    .from('photos')
    .download(photo.data.display_path ?? photo.data.storage_path)
  if (stored.error || !stored.data) {
    return json({ error: 'The photograph could not be read. Try again.' }, 502)
  }

  const context = altContext({
    album: album.data,
    photo: { caption: photo.data.caption, captionVisibility: photo.data.caption_visibility },
    stories: (stories.data ?? []) as { body: string; visibility: string }[],
  })

  const claude = new Anthropic({ apiKey })
  // One photograph per request, by design.
  const logCall = costLog(who, { feature: OPERATION, model: MODEL, albumId: photo.data.album_id, items: 1 })

  let response: Anthropic.Beta.BetaMessage
  try {
    // With server-side fallback, as for stories: an ordinary family photograph
    // should not go undescribed because of an over-cautious refusal.
    response = await claude.beta.messages.create({
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      model: MODEL,
      max_tokens: 1000,
      output_config: { effort: 'low' },
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: context },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: base64(new Uint8Array(await stored.data.arrayBuffer())),
              },
            },
          ],
        },
      ],
    } as Anthropic.Beta.MessageCreateParamsNonStreaming)
  } catch (error) {
    await logCall('failed', null)
    if (error instanceof Anthropic.RateLimitError) {
      return json({ error: 'The describer is busy. Try again in a minute.' }, 503)
    }
    if (error instanceof Anthropic.APIError) {
      return json({ error: `The photograph could not be described (${error.status}).` }, 502)
    }
    throw error
  }

  // Every completed call is counted, whatever came back: each one was paid for.
  await recordUse(who, OPERATION)

  if (response.stop_reason === 'refusal') {
    await logCall('declined', response)
    return json({ error: 'The describer declined to describe this photograph.' }, 422)
  }

  const body = response.content
    .flatMap((block) => (block.type === 'text' ? [block.text] : []))
    .join(' ')
    .trim()
    .slice(0, ALT_MAX_LENGTH)
  if (!body) {
    await logCall('failed', response)
    return json({ error: 'The describer returned nothing. Try again.' }, 502)
  }

  const saved = await who.service
    .from('ai_drafts')
    .insert({
      owner_id: who.ownerId,
      album_id: photo.data.album_id,
      photo_id: photoId,
      draft_type: OPERATION,
      input_refs: [photoId],
      body,
      model: response.model,
      input_tokens: tokensIn(response.usage),
      output_tokens: response.usage.output_tokens,
    })
    .select('id, body')
    .single()
  if (saved.error) {
    await logCall('failed', response)
    return json({ error: saved.error.message }, 500)
  }
  await logCall('ok', response, saved.data.id)

  return json({ draft: saved.data, used: used + 1, limit: ALT_DRAFTS_PER_MONTH })
})
