import { type SupabaseClient, createClient } from 'jsr:@supabase/supabase-js@2'
import type Anthropic from 'npm:@anthropic-ai/sdk@1.8.0'
import { PRICE_LIST, attemptsFrom, costOf, totalTokens } from './aiPricing.ts'

/**
 * What every AI Edge Function here does the same way: who is asking, how much
 * of the month's allowance they have used, how photographs and the owner's
 * words are shown to the model, and how a use is counted.
 *
 * Who is asking is always read from their own token, and the album and its
 * photographs through a client carrying it, so row-level security decides what
 * they may use — never an id taken on trust. The service role is used only for
 * what the owner cannot do directly: reading image bytes, saving what the model
 * wrote, and counting the use.
 */

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

/** Said plainly, because the owner can act on it: the key is a function secret. */
export const NO_KEY = 'AI is not set up yet: no AI key on the server.'

export type Caller = { asOwner: SupabaseClient; service: SupabaseClient; ownerId: string }

/** The signed-in owner and the two clients the work needs, or null when nobody is signed in. */
export async function caller(request: Request): Promise<Caller | null> {
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const asOwner = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: request.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  })
  const { data } = await asOwner.auth.getUser()
  const ownerId = data.user?.id
  if (!ownerId) return null

  const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { persistSession: false },
  })
  return { asOwner, service, ownerId }
}

/** How many times this owner has used `operation` this calendar month on the platform's key. */
export async function usedThisMonth(who: Caller, operation: string): Promise<number> {
  const period = new Date().toISOString().slice(0, 8) + '01'
  const usage = await who.service
    .from('ai_usage')
    .select('count')
    .eq('owner_id', who.ownerId)
    .eq('period', period)
    .eq('operation', operation)
    .eq('byok', false)
    .maybeSingle()
  return usage.data?.count ?? 0
}

/** Counts one completed call, whatever came back: each one was paid for. */
export async function recordUse(who: Caller, operation: string): Promise<void> {
  await who.service.rpc('record_ai_use', { p_owner: who.ownerId, p_operation: operation })
}

export type CallOutcome = 'ok' | 'declined' | 'failed'

/**
 * Starts the cost log for one call to the model, and returns what writes it.
 *
 * Call it once the request is ready, so the time it records is the model's;
 * then call the result once, with how the call ended. Every call that reached
 * the model is logged, whatever came back, because each was paid for; one that
 * never reached it (an allowance already used) costs nothing and is not. With
 * no reply, nothing was billed. A failure to log goes to the function's logs
 * and never costs the owner what she asked for.
 */
export function costLog(
  who: Caller,
  call: { feature: string; model: string; albumId: string | null; items: number },
) {
  const started = Date.now()

  return async (outcome: CallOutcome, reply: Anthropic.Beta.BetaMessage | null, draftId: string | null = null) => {
    const attempts = reply ? attemptsFrom(reply.usage, reply.model) : []
    const tokens = totalTokens(attempts)
    const logged = await who.service.from('ai_calls').insert({
      owner_id: who.ownerId,
      feature: call.feature,
      album_id: call.albumId,
      draft_id: draftId,
      outcome,
      model: call.model,
      served_model: reply?.model ?? null,
      items: call.items,
      input_tokens: tokens.inputTokens,
      cache_write_tokens: tokens.cacheWriteTokens,
      cache_read_tokens: tokens.cacheReadTokens,
      output_tokens: tokens.outputTokens,
      // An unknown model's price stays unknown rather than becoming free.
      cost_usd: reply ? costOf(attempts) : 0,
      price_list: PRICE_LIST,
      duration_ms: Date.now() - started,
    })
    if (logged.error) console.error(`ai_calls: ${call.feature} not logged:`, logged.error.message)
  }
}

/** How many photographs a request actually shows the model: one that could not be read is left out. */
export function imagesIn(content: Anthropic.Beta.BetaContentBlockParam[]): number {
  return content.filter((block) => block.type === 'image').length
}

/** Input tokens as billed, cached or not: the measured price of a call. */
export function tokensIn(usage: Anthropic.Beta.BetaUsage): number {
  return usage.input_tokens + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0)
}

export type PhotoRow = {
  id: string
  storage_path: string
  display_path: string | null
  caption: string | null
  caption_visibility: string
  alt: string | null
  taken_at: string | null
  sort_order: number
}

export const PHOTO_FIELDS =
  'id, storage_path, display_path, caption, caption_visibility, alt, taken_at, sort_order'

/** Every note on these photographs, by photo id, private ones marked as private. */
export async function notesFor(who: Caller, photoIds: string[]): Promise<Map<string, string[]>> {
  const byPhoto = new Map<string, string[]>()
  if (photoIds.length === 0) return byPhoto

  const stories = await who.asOwner
    .from('photo_stories')
    .select('photo_id, body, visibility')
    .in('photo_id', photoIds)
  for (const story of (stories.data ?? []) as { photo_id: string; body: string; visibility: string }[]) {
    const line = story.visibility === 'visible' ? story.body : `(private) ${story.body}`
    byPhoto.set(story.photo_id, [...(byPhoto.get(story.photo_id) ?? []), line])
  }
  return byPhoto
}

/** Image bytes as the base64 the model's image blocks take. */
export function base64(bytes: Uint8Array): string {
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(text)
}

/**
 * One line of what the owner wrote, then the picture, for each photograph,
 * numbered from 1 in the order given. A photograph whose bytes cannot be read
 * is left out rather than failing the whole request.
 */
export async function photoBlocks(
  who: Caller,
  rows: PhotoRow[],
  notesByPhoto: Map<string, string[]>,
): Promise<Anthropic.Beta.BetaContentBlockParam[]> {
  const blocks: Anthropic.Beta.BetaContentBlockParam[] = []
  for (const [index, row] of rows.entries()) {
    const stored = await who.service.storage.from('photos').download(row.display_path ?? row.storage_path)
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

    blocks.push({ type: 'text', text: `Photograph ${index + 1}${said.length ? ` — ${said.join('; ')}` : ''}` })
    blocks.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/jpeg',
        data: base64(new Uint8Array(await stored.data.arrayBuffer())),
      },
    })
  }
  return blocks
}
