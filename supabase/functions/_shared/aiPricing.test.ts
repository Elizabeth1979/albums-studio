import { describe, expect, it } from 'vitest'
import { attemptsFrom, costOf, totalTokens } from './aiPricing'

describe('costOf', () => {
  it("prices the owner's first real story draft at about 5 US cents", () => {
    // 2026-11-18: 20 photographs, 23,106 tokens in and 464 out on Sonnet 5.5.
    const attempts = attemptsFrom({ input_tokens: 23_106, output_tokens: 464 }, 'claude-sonnet-5-5')

    expect(costOf(attempts)).toBe(0.050852)
  })

  it('prices cache reads and both cache lifetimes at their own rates, not as input', () => {
    const attempts = attemptsFrom(
      {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 1_000_000,
        cache_creation_input_tokens: 3_000_000,
        cache_creation: { ephemeral_1h_input_tokens: 1_000_000 },
      },
      'claude-sonnet-5-5',
    )

    // 1M read at $0.10, 2M five-minute writes at $2.50, 1M one-hour write at $4.
    expect(costOf(attempts)).toBe(0.1 + 5 + 4)
  })

  it('bills a declined attempt and its fallback each at their own model', () => {
    const usage = {
      // The top level covers only the attempt that answered.
      input_tokens: 1_000_000,
      output_tokens: 0,
      iterations: [
        { type: 'message', model: 'claude-sonnet-5-5', input_tokens: 1_000_000, output_tokens: 100_000 },
        {
          type: 'fallback_message',
          model: 'claude-sonnet-5',
          input_tokens: 0,
          output_tokens: 0,
          cache_read_input_tokens: 1_000_000,
        },
      ],
    }
    const attempts = attemptsFrom(usage, 'claude-sonnet-5')

    expect(attempts.map((attempt) => attempt.model)).toEqual(['claude-sonnet-5-5', 'claude-sonnet-5'])
    // $2 + $1 for the declined attempt, then a cache read at Sonnet 5's $0.20.
    expect(costOf(attempts)).toBe(3.2)
    expect(totalTokens(attempts)).toEqual({
      inputTokens: 1_000_000,
      cacheWriteTokens: 0,
      cacheReadTokens: 1_000_000,
      outputTokens: 100_000,
    })
  })

  it('says it does not know, rather than calling a model with no price free', () => {
    const attempts = attemptsFrom({ input_tokens: 10, output_tokens: 10 }, 'claude-not-a-model')

    expect(costOf(attempts)).toBeNull()
  })
})
