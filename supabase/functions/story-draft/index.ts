import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk@1.8.0'

/**
 * Drafts an album's story from its photographs and its owner's words.
 *
 * Phase 5's first slice. The owner asks; this looks at the photographs and
 * everything the owner has written about them, and returns a draft. Nothing is
 * published here: the draft is saved as a draft, and only the owner's own
 * "use this story" puts text on the album.
 *
 * Runs with JWT verification on. Who is asking is the signed-in owner, and the
 * album and its photographs are read through a client carrying their token, so
 * row-level security decides what they may draft from — never an id taken on
 * trust. The service role is used only for what the owner cannot do directly:
 * reading image bytes, saving the draft, and counting the use.
 *
 * The AI key lives here as a function secret, `ANTHROPIC_API_KEY`, and never in
 * a browser.
 */

/** Drafts each owner may ask for in a calendar month, on the platform's key. */
const FREE_STORY_DRAFTS_PER_MONTH = 5

/** The most photographs one draft looks at. About 1,000 tokens each at 1080px. */
const MAX_PHOTOS = 20

/** The longest note the owner can send with a request. */
const MAX_NOTES = 2000

const MODEL = 'claude-opus-5-5'
const OPERATION = 'album_story'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/**
 * What the model is asked to do. Kept stable, so it can be cached and so a
 * change to it is a deliberate change to every draft.
 */
const SYSTEM = `You help someone write the short story that opens a personal photo album.

You will see the album's photographs in order, with whatever the owner has written about them: the album's title and description, captions, private notes, and a few lines of instructions for this draft.

Write the story in the owner's voice, warmly and plainly, as they might tell it to family. Ground every sentence in what the photographs show or what the owner wrote. Never invent names, places, dates or events that are not there; if something is unclear, leave it out rather than guess. Notes marked private are for your understanding; do not quote them, and do not reveal anything the owner chose to keep hidden.

Aim for two to five short paragraphs, under 350 words unless the owner asks otherwise. No title, no headings, no lists, no hashtags. Return only the story.`

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

type PhotoRow = {
  id: string
  storage_path: string
  display_path: string | null
  caption: string | null
  caption_visibility: string
  alt: string | null
  taken_at: string | null
  sort_order: number
}

function base64(bytes: Uint8Array): string {
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(text)
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const authorization = request.headers.get('Authorization') ?? ''
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')

  // Said plainly, because the owner can act on it: the key is a function secret
  // they add in the Supabase dashboard.
  if (!apiKey) return json({ error: 'Story drafting is not set up yet: no AI key on the server.' }, 503)

  let input: { albumId?: unknown; photoIds?: unknown; notes?: unknown }
  try {
    input = await request.json()
  } catch {
    return json({ error: 'The request could not be read.' }, 400)
  }

  const albumId = typeof input.albumId === 'string' && UUID.test(input.albumId) ? input.albumId : null
  if (!albumId) return json({ error: 'No album was named.' }, 400)

  const notes = typeof input.notes === 'string' ? input.notes.trim().slice(0, MAX_NOTES) : ''
  const chosen = Array.isArray(input.photoIds)
    ? input.photoIds.filter((id): id is string => typeof id === 'string' && UUID.test(id))
    : []

  // As the owner: RLS answers "is this yours" for the album and its photographs.
  const asOwner = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  })
  const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { persistSession: false },
  })

  const { data: claims } = await asOwner.auth.getUser()
  const ownerId = claims.user?.id
  if (!ownerId) return json({ error: 'Please sign in again.' }, 401)

  const album = await asOwner
    .from('albums')
    .select('id, title, description')
    .eq('id', albumId)
    .maybeSingle()
  if (album.error) return json({ error: album.error.message }, 500)
  if (!album.data) return json({ error: 'not found' }, 404)

  const period = new Date().toISOString().slice(0, 8) + '01'
  const usage = await service
    .from('ai_usage')
    .select('count')
    .eq('owner_id', ownerId)
    .eq('period', period)
    .eq('operation', OPERATION)
    .eq('byok', false)
    .maybeSingle()
  const used = usage.data?.count ?? 0
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

  let photosQuery = asOwner
    .from('photos')
    .select('id, storage_path, display_path, caption, caption_visibility, alt, taken_at, sort_order')
    .eq('album_id', albumId)
    .order('sort_order', { ascending: true })
  if (chosen.length > 0) photosQuery = photosQuery.in('id', chosen)

  const photos = await photosQuery
  if (photos.error) return json({ error: photos.error.message }, 500)
  const rows = ((photos.data ?? []) as PhotoRow[]).slice(0, MAX_PHOTOS)
  if (rows.length === 0) return json({ error: 'Add some photographs to the album first.' }, 400)

  const stories = await asOwner
    .from('photo_stories')
    .select('photo_id, body, visibility')
    .in('photo_id', rows.map((row) => row.id))
  const notesByPhoto = new Map<string, string[]>()
  for (const story of (stories.data ?? []) as { photo_id: string; body: string; visibility: string }[]) {
    const line = story.visibility === 'visible' ? story.body : `(private) ${story.body}`
    notesByPhoto.set(story.photo_id, [...(notesByPhoto.get(story.photo_id) ?? []), line])
  }

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
  ]

  for (const [index, row] of rows.entries()) {
    const stored = await service.storage.from('photos').download(row.display_path ?? row.storage_path)
    if (stored.error || !stored.data) continue

    const said = [
      row.taken_at ? `taken ${row.taken_at.replace('T', ' ').slice(0, 16)}` : null,
      row.caption
        ? row.caption_visibility === 'visible'
          ? `caption: ${row.caption}`
          : `private caption: ${row.caption}`
        : null,
      row.alt ? `description: ${row.alt}` : null,
      ...(notesByPhoto.get(row.id) ?? []).map((line) => `note: ${line}`),
    ].filter(Boolean)

    content.push({ type: 'text', text: `Photograph ${index + 1}${said.length ? ` — ${said.join('; ')}` : ''}` })
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/jpeg',
        data: base64(new Uint8Array(await stored.data.arrayBuffer())),
      },
    })
  }

  const claude = new Anthropic({ apiKey })

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
    if (error instanceof Anthropic.RateLimitError) {
      return json({ error: 'The story writer is busy. Try again in a minute.' }, 503)
    }
    if (error instanceof Anthropic.APIError) {
      return json({ error: `The story could not be drafted (${error.status}).` }, 502)
    }
    throw error
  }

  // Every completed call is counted, whatever came back: each one was paid for.
  await service.rpc('record_ai_use', { p_owner: ownerId, p_operation: OPERATION })

  if (response.stop_reason === 'refusal') {
    return json({ error: 'The story writer declined to draft this album.' }, 422)
  }

  const body = response.content
    .flatMap((block) => (block.type === 'text' ? [block.text] : []))
    .join('\n\n')
    .trim()
  if (!body) return json({ error: 'The story writer returned nothing. Try again.' }, 502)

  const saved = await service
    .from('ai_drafts')
    .insert({
      owner_id: ownerId,
      album_id: albumId,
      draft_type: OPERATION,
      prompt: notes || null,
      input_refs: rows.map((row) => row.id),
      body,
      model: response.model,
      input_tokens:
        response.usage.input_tokens +
        (response.usage.cache_read_input_tokens ?? 0) +
        (response.usage.cache_creation_input_tokens ?? 0),
      output_tokens: response.usage.output_tokens,
    })
    .select('id, body')
    .single()
  if (saved.error) return json({ error: saved.error.message }, 500)

  return json({
    draft: saved.data,
    used: used + 1,
    limit: FREE_STORY_DRAFTS_PER_MONTH,
  })
})
