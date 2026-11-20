import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import Anthropic from 'npm:@anthropic-ai/sdk@1.8.0'
import { STORY_PHOTO_LIMIT, spreadAcross } from '../_shared/storyPhotos.ts'
import {
  CORS,
  NO_KEY,
  PHOTO_FIELDS,
  type PhotoRow,
  UUID,
  caller,
  costLog,
  imagesIn,
  json,
  notesFor,
  photoBlocks,
  recordUse,
  tokensIn,
  usedThisMonth,
} from '../_shared/studio.ts'

/**
 * Drafts an album's story from its photographs and its owner's words.
 *
 * The owner asks; this looks at the photographs and everything the owner has
 * written about them, and returns a draft. Nothing is published here: the draft
 * is saved as a draft, and only the owner's own "use this story" puts text on
 * the album. Runs with JWT verification on; see `_shared/studio.ts` for how the
 * caller and their photographs are read.
 */

/** Drafts each owner may ask for in a calendar month, on the platform's key. */
const FREE_STORY_DRAFTS_PER_MONTH = 5

/** The longest note the owner can send with a request. */
const MAX_NOTES = 2000

/**
 * Claude Sonnet 5.5, at half Opus 5.5's price: the owner's call, 2026-11-18. The
 * first real draft, from 20 photographs, cost about 5 US cents. One line to change.
 */
const MODEL = 'claude-sonnet-5-5'
const OPERATION = 'album_story'

/**
 * What the model is asked to do. Kept stable, so it can be cached and so a
 * change to it is a deliberate change to every draft.
 */
const SYSTEM = `You help someone write the short story that opens a personal photo album.

You will see the album's photographs in order, with whatever the owner has written about them: the album's title and description, captions, private notes, and a few lines of instructions for this draft.

Write the story in the owner's voice, warmly and plainly, as they might tell it to family. Ground every sentence in what the photographs show or what the owner wrote. Never invent names, places, dates or events that are not there; if something is unclear, leave it out rather than guess. Notes marked private are for your understanding; do not quote them, and do not reveal anything the owner chose to keep hidden.

Aim for two to five short paragraphs, under 350 words unless the owner asks otherwise. No title, no headings, no lists, no hashtags. Return only the story.`

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json({ error: NO_KEY }, 503)

  let input: { albumId?: unknown; photoIds?: unknown; notes?: unknown }
  try {
    input = await request.json()
  } catch {
    return json({ error: 'The request could not be read.' }, 400)
  }

  const albumId = typeof input.albumId === 'string' && UUID.test(input.albumId) ? input.albumId : null
  if (!albumId) return json({ error: 'No album was named.' }, 400)

  const notes = typeof input.notes === 'string' ? input.notes.trim().slice(0, MAX_NOTES) : ''
  // The photographs the owner chose, if she chose. Ids only narrow what RLS
  // already lets her read, so one that is not hers simply matches nothing.
  const chosen = Array.isArray(input.photoIds)
    ? input.photoIds
        .filter((id): id is string => typeof id === 'string' && UUID.test(id))
        .slice(0, STORY_PHOTO_LIMIT)
    : []

  const who = await caller(request)
  if (!who) return json({ error: 'Please sign in again.' }, 401)

  const album = await who.asOwner.from('albums').select('id, title, description').eq('id', albumId).maybeSingle()
  if (album.error) return json({ error: album.error.message }, 500)
  if (!album.data) return json({ error: 'not found' }, 404)

  const used = await usedThisMonth(who, OPERATION)
  if (used >= FREE_STORY_DRAFTS_PER_MONTH) {
    return json(
      {
        error: `You have used all ${FREE_STORY_DRAFTS_PER_MONTH} story drafts for this month.`,
        used,
        limit: FREE_STORY_DRAFTS_PER_MONTH,
      },
      429,
    )
  }

  let photosQuery = who.asOwner
    .from('photos')
    .select(PHOTO_FIELDS)
    .eq('album_id', albumId)
    .order('sort_order', { ascending: true })
  if (chosen.length > 0) photosQuery = photosQuery.in('id', chosen)

  const photos = await photosQuery
  if (photos.error) return json({ error: photos.error.message }, 500)
  // Her choice as she made it; otherwise spread across the whole album, the
  // same default the album page offers her.
  const rows = spreadAcross((photos.data ?? []) as PhotoRow[])
  if (rows.length === 0) return json({ error: 'Add some photographs to the album first.' }, 400)

  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    {
      type: 'text',
      text: [
        `Album: ${album.data.title}`,
        album.data.description ? `Description: ${album.data.description}` : null,
        notes ? `The owner's instructions for this draft: ${notes}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    },
    ...(await photoBlocks(who, rows, await notesFor(who, rows.map((row) => row.id)))),
  ]

  const claude = new Anthropic({ apiKey })
  const logCall = costLog(who, { feature: OPERATION, model: MODEL, albumId, items: imagesIn(content) })

  let response: Anthropic.Beta.BetaMessage
  try {
    // With server-side fallback: if the model declines, Anthropic retries the
    // same request on a fallback model inside this one call, so an ordinary
    // family album is not lost to an over-cautious refusal.
    response = await claude.beta.messages.create({
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      model: MODEL,
      max_tokens: 8000,
      output_config: { effort: 'medium' },
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content }],
    } as Anthropic.Beta.MessageCreateParamsNonStreaming)
  } catch (error) {
    await logCall('failed', null)
    if (error instanceof Anthropic.RateLimitError) {
      return json({ error: 'The story writer is busy. Try again in a minute.' }, 503)
    }
    if (error instanceof Anthropic.APIError) {
      return json({ error: `The story could not be drafted (${error.status}).` }, 502)
    }
    throw error
  }

  await recordUse(who, OPERATION)

  if (response.stop_reason === 'refusal') {
    await logCall('declined', response)
    return json({ error: 'The story writer declined to draft this album.' }, 422)
  }

  const body = response.content
    .flatMap((block) => (block.type === 'text' ? [block.text] : []))
    .join('\n\n')
    .trim()
  if (!body) {
    await logCall('failed', response)
    return json({ error: 'The story writer returned nothing. Try again.' }, 502)
  }

  const saved = await who.service
    .from('ai_drafts')
    .insert({
      owner_id: who.ownerId,
      album_id: albumId,
      draft_type: OPERATION,
      prompt: notes || null,
      input_refs: rows.map((row) => row.id),
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

  return json({ draft: saved.data, used: used + 1, limit: FREE_STORY_DRAFTS_PER_MONTH })
})
