import { supabase } from './supabase'

/**
 * The testing-mode view of what AI costs, feature by feature.
 *
 * On while the product is being tested, so the owner can see what each AI
 * feature costs to run before deciding which to sell and at what price. Every
 * signed-in person sees only their own calls; row-level security decides that,
 * not this switch. Turn it off before launch: the log keeps recording either way.
 */
export const AI_COST_PANEL_ENABLED = true

/** Announced after any request that may have added a row, so an open panel can refresh. */
export const AI_CALL_RECORDED = 'albums-studio:ai-call-recorded'

export function announceAiCall() {
  window.dispatchEvent(new Event(AI_CALL_RECORDED))
}

/** A paid AI feature: one thing a person asks for, as it would be sold. */
export type PaidFeature = {
  key: string
  name: string
  what: string
  model: string
  /** How one use is named in "per story". */
  use: string
  /** What `items` counts on this feature, singular and plural. */
  unit: [string, string]
}

export const PAID_FEATURES: PaidFeature[] = [
  {
    key: 'album_story',
    name: 'Album story',
    what: "Writes the story that opens an album, from its photographs and the owner's words.",
    model: 'Claude Sonnet 5.5',
    use: 'story',
    unit: ['photo', 'photos'],
  },
  {
    key: 'album_questions',
    name: 'Questions about your photos',
    what: 'Asks about photographs nobody has written about yet.',
    model: 'Claude Sonnet 5.5',
    use: 'request',
    unit: ['photo', 'photos'],
  },
  {
    key: 'alt',
    name: 'Suggested descriptions (alt text)',
    what: 'Describes one photograph for people who use a screen reader.',
    model: 'Claude Sonnet 5.5',
    use: 'description',
    unit: ['photo', 'photos'],
  },
]

/** Features that feel like AI and cost nothing per use. */
export const FREE_FEATURES = [
  { name: 'Blurry photos, person by person', how: 'Measured on this device.' },
  { name: 'Similar photos', how: 'Compared on this device.' },
  { name: 'Eyes open and smiles', how: 'Detected on this device.' },
  { name: 'Speak instead of typing', how: "The browser's own speech service, at no charge to us." },
  { name: 'Search by what you wrote', how: 'Run by the database, with no AI.' },
]

/**
 * AI features not on the site yet, so with no cost to show. A new one needs its
 * name in the `ai_calls.feature` check, `costLog` in its Edge Function, and an
 * entry in `PAID_FEATURES`.
 */
export const PLANNED_FEATURES = ['Caption drafts', 'Search by what is in a photo']

export type AiCall = {
  id: string
  feature: string
  album_id: string | null
  outcome: 'ok' | 'declined' | 'failed'
  model: string
  served_model: string | null
  items: number
  input_tokens: number
  cache_write_tokens: number
  cache_read_tokens: number
  output_tokens: number
  /** Arrives from PostgREST as a string, because the column is `numeric`. */
  cost_usd: number | string | null
  price_list: string
  duration_ms: number | null
  created_at: string
}

export type AiCallWithAlbum = AiCall & { albumTitle: string | null }

/** How far back the panel reads. Enough to price a feature in testing; the CSV has the same rows. */
const LOG_LIMIT = 500

export async function listAiCalls(): Promise<AiCallWithAlbum[]> {
  const { data, error } = await supabase
    .from('ai_calls')
    .select(
      'id, feature, album_id, outcome, model, served_model, items, input_tokens, cache_write_tokens, cache_read_tokens, output_tokens, cost_usd, price_list, duration_ms, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(LOG_LIMIT)

  if (error) throw new Error(error.message)
  const calls = (data ?? []) as AiCall[]

  const albumIds = [...new Set(calls.flatMap((call) => (call.album_id ? [call.album_id] : [])))]
  const titles = new Map<string, string>()
  if (albumIds.length > 0) {
    const albums = await supabase.from('albums').select('id, title').in('id', albumIds)
    // A missing title is not worth failing the panel over: the cost is what it is for.
    for (const album of (albums.data ?? []) as { id: string; title: string }[]) titles.set(album.id, album.title)
  }

  return calls.map((call) => ({ ...call, albumTitle: call.album_id ? titles.get(call.album_id) ?? null : null }))
}

export function costNumber(call: Pick<AiCall, 'cost_usd'>): number | null {
  if (call.cost_usd === null || call.cost_usd === undefined) return null
  const value = typeof call.cost_usd === 'number' ? call.cost_usd : Number(call.cost_usd)
  return Number.isFinite(value) ? value : null
}

export type FeatureSummary = {
  uses: number
  ok: number
  declined: number
  failed: number
  /** Sum of every cost that is known. */
  totalUsd: number
  /** Calls whose price could not be worked out; not in any total or average. */
  unpriced: number
  /** Over priced calls only; null when there are none. */
  perUseUsd: number | null
  /** Per photograph (or whatever the feature counts), over priced calls; null when none had any. */
  perItemUsd: number | null
  monthUses: number
  monthUsd: number
}

/** Adds up one feature's calls. `now` decides which calendar month is "this month", in UTC like the allowance. */
export function summarize(calls: AiCall[], now = new Date()): FeatureSummary {
  const month = now.toISOString().slice(0, 7)
  let totalUsd = 0
  let priced = 0
  let pricedItems = 0
  let unpriced = 0
  let monthUses = 0
  let monthUsd = 0

  for (const call of calls) {
    const cost = costNumber(call)
    const thisMonth = call.created_at.slice(0, 7) === month
    if (thisMonth) monthUses += 1

    if (cost === null) {
      unpriced += 1
      continue
    }
    totalUsd += cost
    priced += 1
    pricedItems += call.items
    if (thisMonth) monthUsd += cost
  }

  return {
    uses: calls.length,
    ok: calls.filter((call) => call.outcome === 'ok').length,
    declined: calls.filter((call) => call.outcome === 'declined').length,
    failed: calls.filter((call) => call.outcome === 'failed').length,
    totalUsd,
    unpriced,
    perUseUsd: priced > 0 ? totalUsd / priced : null,
    perItemUsd: pricedItems > 0 ? totalUsd / pricedItems : null,
    monthUses,
    monthUsd,
  }
}

/**
 * What to announce when a re-read of the log finds calls that were not there
 * before, so a screen reader hears a cost arrive as a sighted owner sees it.
 * Nothing on the first read: that is the panel opening, not news.
 */
export function newCallsMessage(before: AiCall[] | null, after: AiCall[]): string {
  if (!before) return ''
  const seen = new Set(before.map((call) => call.id))
  const fresh = after.filter((call) => !seen.has(call.id))
  if (fresh.length === 0) return ''

  const prices = fresh.map(costNumber)
  const known = prices.every((price) => price !== null)
  const total = prices.reduce<number>((sum, price) => sum + (price ?? 0), 0)

  if (fresh.length === 1) {
    const name = PAID_FEATURES.find((feature) => feature.key === fresh[0].feature)?.name ?? fresh[0].feature
    return `New AI cost logged: ${name}, ${known ? formatUsd(total) : 'no price on file'}.`
  }
  return `${fresh.length} new AI costs logged${known ? `, ${formatUsd(total)} in all` : ''}.`
}

/** Dollars to four places: a story costs about $0.05, so cents alone would hide the differences. */
export function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value)
}

const OUTCOME_WORDS: Record<AiCall['outcome'], string> = {
  ok: 'Draft',
  declined: 'Declined',
  failed: 'Failed',
}

export function outcomeWord(outcome: AiCall['outcome']): string {
  return OUTCOME_WORDS[outcome] ?? outcome
}

function csvField(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value)
  // An album title beginning "=" would run as a formula in a spreadsheet (OWASP's CSV injection advice).
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** The log as a spreadsheet: one row per call, every number the panel adds up. */
export function toCsv(calls: AiCallWithAlbum[]): string {
  const header = [
    'when',
    'feature',
    'album',
    'outcome',
    'model',
    'served_model',
    'items',
    'input_tokens',
    'cache_write_tokens',
    'cache_read_tokens',
    'output_tokens',
    'cost_usd',
    'price_list',
    'duration_ms',
  ]
  const rows = calls.map((call) =>
    [
      call.created_at,
      call.feature,
      call.albumTitle,
      call.outcome,
      call.model,
      call.served_model,
      call.items,
      call.input_tokens,
      call.cache_write_tokens,
      call.cache_read_tokens,
      call.output_tokens,
      costNumber(call),
      call.price_list,
      call.duration_ms,
    ]
      .map(csvField)
      .join(','),
  )

  return [header.join(','), ...rows].join('\n') + '\n'
}
