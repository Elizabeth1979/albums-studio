import { describe, expect, it, vi } from 'vitest'
import { mapWithConcurrency, withRetry } from './concurrency'

/** A promise plus the handles to settle it from the test. */
function deferred<T = void>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

const immediately = async () => {}

describe('withRetry', () => {
  it('returns the first success without retrying', async () => {
    const run = vi.fn().mockResolvedValue('ok')

    expect(await withRetry(run, { attempts: 3, wait: immediately })).toBe('ok')
    expect(run).toHaveBeenCalledOnce()
  })

  it('retries until it succeeds', async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error('flaky'))
      .mockRejectedValueOnce(new Error('flaky'))
      .mockResolvedValue('ok')

    expect(await withRetry(run, { attempts: 3, wait: immediately })).toBe('ok')
    expect(run).toHaveBeenCalledTimes(3)
  })

  it('gives up after the last attempt and reports that failure', async () => {
    const run = vi.fn().mockRejectedValue(new Error('still broken'))

    await expect(withRetry(run, { attempts: 3, wait: immediately })).rejects.toThrow(
      'still broken',
    )
    expect(run).toHaveBeenCalledTimes(3)
  })

  it('stops early for a failure retrying cannot fix', async () => {
    const run = vi.fn().mockRejectedValue(new Error('unsupported format'))

    await expect(
      withRetry(run, { attempts: 5, wait: immediately, shouldRetry: () => false }),
    ).rejects.toThrow('unsupported format')
    expect(run).toHaveBeenCalledOnce()
  })

  it('tells the caller which attempt it is on', async () => {
    const seen: number[] = []
    const run = vi.fn(async ({ number, attemptsRemaining }) => {
      seen.push(number)
      if (attemptsRemaining > 0) throw new Error('again')
      return 'ok'
    })

    await withRetry(run, { attempts: 3, wait: immediately })
    expect(seen).toEqual([1, 2, 3])
  })

  it('backs off further after each failure', async () => {
    const waits: number[] = []
    const run = vi.fn().mockRejectedValue(new Error('flaky'))

    await expect(
      withRetry(run, {
        attempts: 4,
        wait: async (ms) => {
          waits.push(ms)
        },
      }),
    ).rejects.toThrow('flaky')

    expect(waits).toEqual([400, 800, 1600])
  })

  it('refuses a nonsensical attempt count', async () => {
    await expect(withRetry(async () => 'ok', { attempts: 0 })).rejects.toThrow(
      'at least one attempt',
    )
  })
})

describe('mapWithConcurrency', () => {
  it('keeps results in the order of the input', async () => {
    const results = await mapWithConcurrency([1, 2, 3, 4], 2, async (value) => value * 10)

    expect(results).toEqual([
      { status: 'fulfilled', value: 10 },
      { status: 'fulfilled', value: 20 },
      { status: 'fulfilled', value: 30 },
      { status: 'fulfilled', value: 40 },
    ])
  })

  it('never exceeds the limit', async () => {
    let running = 0
    let peak = 0

    await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      running += 1
      peak = Math.max(peak, running)
      await Promise.resolve()
      running -= 1
    })

    expect(peak).toBe(4)
  })

  it('starts the next item as soon as any slot frees, not when a batch ends', async () => {
    // The whole point of a pull-based queue: one slow item must not hold up the
    // three that could have run in the meantime.
    const gates = [deferred(), deferred(), deferred()]
    const started: number[] = []

    const all = mapWithConcurrency([0, 1, 2], 2, async (index) => {
      started.push(index)
      await gates[index].promise
    })

    await Promise.resolve()
    expect(started).toEqual([0, 1])

    // Finish the second; the third should take its slot while the first is stuck.
    gates[1].resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(started).toEqual([0, 1, 2])

    gates[0].resolve()
    gates[2].resolve()
    await all
  })

  it('reports a failure without abandoning the rest', async () => {
    const results = await mapWithConcurrency([1, 2, 3], 2, async (value) => {
      if (value === 2) throw new Error('unreadable file')
      return value
    })

    expect(results[0]).toEqual({ status: 'fulfilled', value: 1 })
    expect(results[1]).toMatchObject({ status: 'rejected' })
    expect(results[2]).toEqual({ status: 'fulfilled', value: 3 })
  })

  it('handles an empty list', async () => {
    expect(await mapWithConcurrency([], 4, async () => 'never')).toEqual([])
  })

  it('does not spawn more workers than there are items', async () => {
    let started = 0

    await mapWithConcurrency([1, 2], 10, async (value) => {
      started += 1
      return value
    })

    expect(started).toBe(2)
  })

  it('refuses a nonsensical limit', async () => {
    await expect(mapWithConcurrency([1], 0, async () => 1)).rejects.toThrow('at least 1')
  })
})
