export type Attempt = {
  /** 1 for the first try. */
  number: number
  attemptsRemaining: number
}

export type RetryOptions = {
  attempts: number
  /** Milliseconds before attempt n + 1. Defaults to exponential backoff. */
  delayFor?: (attempt: number) => number
  /** Return false to give up early, e.g. a rejection that retrying cannot fix. */
  shouldRetry?: (error: unknown) => boolean
  wait?: (ms: number) => Promise<void>
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** 400ms, 800ms, 1600ms, capped, so a flaky connection is not hammered. */
function defaultDelay(attempt: number): number {
  return Math.min(400 * 2 ** (attempt - 1), 5000)
}

export async function withRetry<T>(
  run: (attempt: Attempt) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const { attempts, delayFor = defaultDelay, shouldRetry = () => true, wait = sleep } = options

  if (attempts < 1) {
    throw new Error('withRetry needs at least one attempt.')
  }

  let lastError: unknown

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await run({ number: attempt, attemptsRemaining: attempts - attempt })
    } catch (error) {
      lastError = error

      if (attempt === attempts || !shouldRetry(error)) break

      await wait(delayFor(attempt))
    }
  }

  throw lastError
}

/**
 * Runs `run` over every item with at most `limit` in flight.
 *
 * Workers pull from a shared cursor rather than the list being sliced into
 * batches: a batch only moves on when its slowest member finishes, which idles
 * the connection whenever one photo is much larger than its neighbours.
 *
 * Every result is reported, settled rather than thrown, so one unreadable file
 * among five hundred cannot abandon the rest.
 */
export async function mapWithConcurrency<TIn, TOut>(
  items: readonly TIn[],
  limit: number,
  run: (item: TIn, index: number) => Promise<TOut>,
): Promise<PromiseSettledResult<TOut>[]> {
  if (limit < 1) {
    throw new Error('Concurrency limit must be at least 1.')
  }

  const results: PromiseSettledResult<TOut>[] = new Array(items.length)
  let cursor = 0

  async function worker() {
    for (;;) {
      const index = cursor
      cursor += 1

      if (index >= items.length) return

      try {
        results[index] = { status: 'fulfilled', value: await run(items[index], index) }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  )

  return results
}
