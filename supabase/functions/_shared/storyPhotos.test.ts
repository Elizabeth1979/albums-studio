import { describe, expect, it } from 'vitest'
import { STORY_PHOTO_LIMIT, spreadAcross } from './storyPhotos'

const range = (n: number) => Array.from({ length: n }, (_, index) => index)

describe('spreadAcross', () => {
  it('returns an album that fits whole, in order', () => {
    expect(spreadAcross(range(7))).toEqual(range(7))
    expect(spreadAcross(range(STORY_PHOTO_LIMIT))).toEqual(range(STORY_PHOTO_LIMIT))
  })

  it('covers a long album from its first photograph to its last, not just its start', () => {
    const chosen = spreadAcross(range(200))

    expect(chosen).toHaveLength(STORY_PHOTO_LIMIT)
    expect(chosen[0]).toBe(0)
    expect(chosen[chosen.length - 1]).toBe(199)
    // Evenly: no two picks further apart than one step plus rounding.
    const gaps = chosen.slice(1).map((value, index) => value - chosen[index])
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(1)
  })

  it('never picks the same photograph twice, even just past the limit', () => {
    for (const size of [21, 22, 39, 41, 1000]) {
      const chosen = spreadAcross(range(size))
      expect(new Set(chosen).size).toBe(STORY_PHOTO_LIMIT)
      expect([...chosen].sort((a, b) => a - b)).toEqual(chosen)
    }
  })

  it('handles the edges', () => {
    expect(spreadAcross([])).toEqual([])
    expect(spreadAcross(range(5), 1)).toEqual([0])
    expect(spreadAcross(range(5), 0)).toEqual([])
  })
})
