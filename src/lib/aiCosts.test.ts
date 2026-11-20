import { describe, expect, it } from 'vitest'
import { type AiCall, type AiCallWithAlbum, formatUsd, summarize, toCsv } from './aiCosts'

function call(overrides: Partial<AiCall> = {}): AiCall {
  return {
    id: 'call-1',
    feature: 'album_story',
    album_id: 'album-1',
    outcome: 'ok',
    model: 'claude-sonnet-5-5',
    served_model: 'claude-sonnet-5-5',
    items: 20,
    input_tokens: 23_106,
    cache_write_tokens: 0,
    cache_read_tokens: 0,
    output_tokens: 464,
    cost_usd: '0.050852',
    price_list: 'anthropic-2026-11-03',
    duration_ms: 18_000,
    created_at: '2026-11-18T10:00:00Z',
    ...overrides,
  }
}

const NOW = new Date('2026-11-20T12:00:00Z')

describe('summarize', () => {
  it('reads PostgREST numeric strings as numbers and averages per use and per photograph', () => {
    const summary = summarize(
      [call({ cost_usd: '0.06', items: 20 }), call({ id: 'call-2', cost_usd: 0.04, items: 10 })],
      NOW,
    )

    expect(summary.uses).toBe(2)
    expect(summary.totalUsd).toBeCloseTo(0.1)
    expect(summary.perUseUsd).toBeCloseTo(0.05)
    // Thirty photographs for ten cents.
    expect(summary.perItemUsd).toBeCloseTo(0.1 / 30)
  })

  it('counts declined and failed calls, because each one was paid for', () => {
    const summary = summarize(
      [call(), call({ id: 'call-2', outcome: 'declined' }), call({ id: 'call-3', outcome: 'failed', cost_usd: 0 })],
      NOW,
    )

    expect([summary.ok, summary.declined, summary.failed]).toEqual([1, 1, 1])
    expect(summary.totalUsd).toBeCloseTo(0.101704)
    expect(summary.perUseUsd).toBeCloseTo(0.101704 / 3)
  })

  it('keeps an unpriced call out of the money and says how many there were', () => {
    const summary = summarize([call(), call({ id: 'call-2', cost_usd: null })], NOW)

    expect(summary.uses).toBe(2)
    expect(summary.unpriced).toBe(1)
    expect(summary.perUseUsd).toBeCloseTo(0.050852)
  })

  it('separates this month from earlier ones', () => {
    const summary = summarize([call(), call({ id: 'call-2', created_at: '2026-10-31T23:59:00Z' })], NOW)

    expect(summary.monthUses).toBe(1)
    expect(summary.monthUsd).toBeCloseTo(0.050852)
    expect(summary.totalUsd).toBeCloseTo(0.101704)
  })

  it('has no averages for a feature never used, rather than zero', () => {
    const summary = summarize([], NOW)

    expect(summary.perUseUsd).toBeNull()
    expect(summary.perItemUsd).toBeNull()
  })
})

describe('formatUsd', () => {
  it('shows a story in fractions of a cent, so two features can be told apart', () => {
    expect(formatUsd(0.050852)).toBe('$0.0509')
    expect(formatUsd(1.5)).toBe('$1.50')
  })
})

describe('toCsv', () => {
  it('writes one row per call and quotes what a spreadsheet would split', () => {
    const rows: AiCallWithAlbum[] = [call({ cost_usd: '0.050852' })].map((entry) => ({
      ...entry,
      albumTitle: 'Lake, rain and "Friday"',
    }))
    const lines = toCsv(rows).trim().split('\n')

    expect(lines[0]).toMatch(/^when,feature,album,outcome/)
    expect(lines[1]).toContain('"Lake, rain and ""Friday"""')
    expect(lines[1]).toContain(',0.050852,')
  })

  it('keeps an album title from running as a spreadsheet formula', () => {
    const csv = toCsv([{ ...call(), albumTitle: '=HYPERLINK("x")' }])

    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
  })
})
