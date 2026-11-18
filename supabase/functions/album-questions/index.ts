import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import Anthropic from 'npm:@anthropic-ai/sdk@1.8.0'
import { spreadAcross } from '../_shared/storyPhotos.ts'
import {
  QUESTION_PHOTO_LIMIT,
  QUESTIONS_PER_REQUEST,
  QUESTIONS_SCHEMA,
  readQuestions,
  withoutWords,
} from '../_shared/questions.ts'
import {
  CORS,
  NO_KEY,
  PHOTO_FIELDS,
  type PhotoRow,
  UUID,
  caller,
  json,
  notesFor,
  photoBlocks,
  recordUse,
  usedThisMonth,
} from '../_shared/studio.ts'

/**
 * Asks the owner about photographs nobody has written about yet.
 *
 * Looks only at photographs with no caption and no note, and not already
 * waiting on a question, spread across the album. Returns a few specific
 * questions, each saved as an open suggestion for the owner to answer or set
 * aside. Never contacts anyone: a question may say who might know, and the
 * owner decides whether to ask them. Runs with JWT verification on.
 */

/** Requests each owner may make in a calendar month, on the platform's key. */
const FREE_QUESTION_REQUESTS_PER_MONTH = 5

const MODEL = 'claude-sonnet-5-5'
const OPERATION = 'album_questions'

const SYSTEM = `You help someone remember the stories behind their photo album, by asking them good questions.

You will see some of the album's photographs, numbered, none of which has anything written about it yet, and whatever the owner has written elsewhere in the album.

Ask at most ${QUESTIONS_PER_REQUEST} questions, each about one numbered photograph, choosing the photographs where an answer would add the most. Ask what a photograph cannot show by itself: who someone is, what was happening, what came just before or after, why it mattered, what was said. Make each question specific to what is visible, short, warm, and answerable in a sentence by someone who was there. Never guess a name, place or date in the question.

For each question give a reason: if the owner's own words name someone who would know the answer, say who in a few words ("Your sister might know: it's her garden."); otherwise say in a few words why the answer is worth keeping. Never suggest contacting anyone on the owner's behalf. Notes marked private are for your understanding; do not quote them.

Reply with JSON only, in this shape: {"questions": [{"photo": 1, "question": "...", "reason": "..."}]}.`

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json({ error: NO_KEY }, 503)

  let input: { albumId?: unknown }
  try {
    input = await request.json()
  } catch {
    return json({ error: 'The request could not be read.' }, 400)
  }
  const albumId = typeof input.albumId === 'string' && UUID.test(input.albumId) ? input.albumId : null
  if (!albumId) return json({ error: 'No album was named.' }, 400)

  const who = await caller(request)
  if (!who) return json({ error: 'Please sign in again.' }, 401)

  const album = await who.asOwner.from('albums').select('id, title, description').eq('id', albumId).maybeSingle()
  if (album.error) return json({ error: album.error.message }, 500)
  if (!album.data) return json({ error: 'not found' }, 404)

  const used = await usedThisMonth(who, OPERATION)
  if (used >= FREE_QUESTION_REQUESTS_PER_MONTH) {
    return json(
      {
        error: `You have asked for questions ${FREE_QUESTION_REQUESTS_PER_MONTH} times this month, which is all there is until next month.`,
        used,
        limit: FREE_QUESTION_REQUESTS_PER_MONTH,
      },
      429,
    )
  }

  const photos = await who.asOwner
    .from('photos')
    .select(PHOTO_FIELDS)
    .eq('album_id', albumId)
    .order('sort_order', { ascending: true })
  if (photos.error) return json({ error: photos.error.message }, 500)
  const all = (photos.data ?? []) as PhotoRow[]

  const notes = await notesFor(who, all.map((photo) => photo.id))
  const waiting = await who.asOwner
    .from('ai_suggestions')
    .select('photo_id')
    .eq('album_id', albumId)
    .eq('status', 'open')
  if (waiting.error) return json({ error: waiting.error.message }, 500)
  const alreadyAsked = new Set((waiting.data ?? []).map((row) => row.photo_id as string))

  const candidates = spreadAcross(
    withoutWords(all, new Set(notes.keys())).filter((photo) => !alreadyAsked.has(photo.id)),
    QUESTION_PHOTO_LIMIT,
  )
  // Nothing to ask about is an answer, not a failure, and costs nothing.
  if (candidates.length === 0) {
    return json({ questions: [], used, limit: FREE_QUESTION_REQUESTS_PER_MONTH })
  }

  // What she has written elsewhere in the album: the only ground for "who might know".
  const written = all
    .flatMap((photo) => [photo.caption ?? '', ...(notes.get(photo.id) ?? [])])
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 4000)

  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    {
      type: 'text',
      text: [
        `Album: ${album.data.title}`,
        album.data.description ? `Description: ${album.data.description}` : null,
        written ? `What the owner has written elsewhere in this album:\n${written}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    },
    ...(await photoBlocks(who, candidates, new Map())),
  ]

  const claude = new Anthropic({ apiKey })

  // The schema makes the shape certain; the instruction above makes it likely
  // without one. If this request's combination of settings is ever refused,
  // the same request goes once more without the schema rather than failing.
  const ask = (withSchema: boolean) =>
    claude.beta.messages.create({
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      model: MODEL,
      max_tokens: 4000,
      output_config: withSchema
        ? { effort: 'low', format: { type: 'json_schema', schema: QUESTIONS_SCHEMA } }
        : { effort: 'low' },
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content }],
    } as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming)

  let response: Anthropic.Beta.BetaMessage
  try {
    try {
      response = await ask(true)
    } catch (error) {
      if (!(error instanceof Anthropic.BadRequestError)) throw error
      console.warn('album-questions: schema refused, asking without it:', error.message)
      response = await ask(false)
    }
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return json({ error: 'The studio is busy. Try again in a minute.' }, 503)
    }
    if (error instanceof Anthropic.APIError) {
      return json({ error: `No questions could be asked (${error.status}).` }, 502)
    }
    throw error
  }

  await recordUse(who, OPERATION)

  if (response.stop_reason === 'refusal') {
    return json({ error: 'The studio declined to ask about these photos.' }, 422)
  }

  const text = response.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('')
  const questions = readQuestions(text, candidates.length)
  if (questions.length === 0) return json({ error: 'No questions came back. Try again.' }, 502)

  const saved = await who.service
    .from('ai_suggestions')
    .insert(
      questions.map((one) => ({
        owner_id: who.ownerId,
        album_id: albumId,
        photo_id: candidates[one.photo - 1].id,
        suggestion_type: 'missing_context',
        body: one.question,
        reason: one.reason,
        model: response.model,
      })),
    )
    .select('id, photo_id, body, reason')
  if (saved.error) return json({ error: saved.error.message }, 500)

  return json({ questions: saved.data, used: used + 1, limit: FREE_QUESTION_REQUESTS_PER_MONTH })
})
