/**
 * What a call to a paid AI model cost, worked out from what the provider reported.
 *
 * Kept apart from the Edge Function that makes the call, so the arithmetic that
 * decides what a feature is worth charging for has tests of its own. Shared by
 * Deno (the function) and Vitest (the tests); nothing here may import either.
 *
 * The cost is fixed when the call is logged, at the prices in force that day,
 * and stored beside the tokens. A later price change must not rewrite what an
 * earlier story cost; the tokens are kept so any row can be repriced on purpose.
 */

/** Which published price list the rates below come from. Stored on every row. */
export const PRICE_LIST = 'anthropic-2026-11-03'

/** US dollars per million tokens. */
export type ModelRates = {
  input: number
  output: number
  /** Reading a cached prefix. */
  cacheRead: number
  /** Writing the cache with the default five-minute lifetime: 1.25 times input. */
  cacheWrite5m: number
  /** Writing the cache with a one-hour lifetime: 2 times input. */
  cacheWrite1h: number
}

function rates(input: number, output: number, cacheRead: number): ModelRates {
  return { input, output, cacheRead, cacheWrite5m: input * 1.25, cacheWrite1h: input * 2 }
}

/**
 * Anthropic first-party API prices. Only models this app calls, or that a
 * fallback can land on, need to be here; an unlisted model is priced as
 * unknown, never as free.
 */
export const MODEL_RATES: Record<string, ModelRates> = {
  // Story drafts. Cache reads are 0.05 times input on this model, not 0.1.
  'claude-sonnet-5-5': rates(2, 10, 0.1),
  // Where a declined Sonnet 5.5 request is retried by server-side fallback.
  'claude-sonnet-5': rates(2, 10, 0.2),
  'claude-opus-5-5': rates(4, 20, 0.2),
  'claude-opus-5': rates(5, 25, 0.5),
  'claude-opus-4-8': rates(5, 25, 0.5),
  'claude-haiku-5-5': rates(0.1, 0.5, 0.01),
}

/** One model's share of a call: a call that falls back is two or more of these. */
export type Attempt = {
  model: string
  inputTokens: number
  cacheWriteTokens: number
  /** The part of `cacheWriteTokens` written with a one-hour lifetime. */
  cacheWrite1hTokens: number
  cacheReadTokens: number
  outputTokens: number
}

/** The fields of the provider's usage report this reads, as the SDK types them. */
type UsageLike = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
  cache_creation?: { ephemeral_1h_input_tokens?: number | null } | null
  iterations?: Array<UsageLike & { type: string; model?: string | null }> | null
}

function attemptFrom(usage: UsageLike, model: string): Attempt {
  return {
    model,
    inputTokens: usage.input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
    cacheWrite1hTokens: usage.cache_creation?.ephemeral_1h_input_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
  }
}

/**
 * Splits a response's usage into the attempts that were paid for.
 *
 * With server-side fallback, the top-level usage covers only the attempt that
 * produced the answer; `iterations` lists every attempt, the declined one
 * included, each with its own model. So iterations, when present, are the
 * whole bill, and the top level is used only when there are none.
 */
export function attemptsFrom(usage: UsageLike, servedModel: string): Attempt[] {
  const iterations = (usage.iterations ?? []).filter(
    (entry) => entry.type === 'message' || entry.type === 'fallback_message',
  )
  if (iterations.length === 0) return [attemptFrom(usage, servedModel)]

  return iterations.map((entry) => attemptFrom(entry, entry.model ?? servedModel))
}

/** What the attempts cost in US dollars, or `null` when any model's price is not known. */
export function costOf(attempts: Attempt[]): number | null {
  let total = 0

  for (const attempt of attempts) {
    const price = MODEL_RATES[attempt.model]
    if (!price) return null

    const write1h = Math.min(attempt.cacheWrite1hTokens, attempt.cacheWriteTokens)
    const write5m = attempt.cacheWriteTokens - write1h

    total +=
      (attempt.inputTokens * price.input +
        write5m * price.cacheWrite5m +
        write1h * price.cacheWrite1h +
        attempt.cacheReadTokens * price.cacheRead +
        attempt.outputTokens * price.output) /
      1_000_000
  }

  // Stored as numeric(12, 6): a millionth of a dollar is finer than any price here.
  return Math.round(total * 1_000_000) / 1_000_000
}

/** The attempts added together, as one row of the log records them. */
export function totalTokens(attempts: Attempt[]) {
  return attempts.reduce(
    (sum, attempt) => ({
      inputTokens: sum.inputTokens + attempt.inputTokens,
      cacheWriteTokens: sum.cacheWriteTokens + attempt.cacheWriteTokens,
      cacheReadTokens: sum.cacheReadTokens + attempt.cacheReadTokens,
      outputTokens: sum.outputTokens + attempt.outputTokens,
    }),
    { inputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens: 0 },
  )
}
