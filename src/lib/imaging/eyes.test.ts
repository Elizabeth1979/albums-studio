import { describe, expect, it } from 'vitest'
import { cutOut } from './eyes'

describe('cutOut', () => {
  const frame = { width: 2000, height: 1500 }

  it('widens a face box by half on every side, as a square', () => {
    expect(cutOut({ x: 900, y: 600, width: 100, height: 120 }, frame)).toEqual({
      x: 830,
      y: 540,
      size: 240,
    })
  })

  it('keeps a face at the edge inside the frame rather than cutting off the eyes', () => {
    const area = cutOut({ x: 1950, y: 0, width: 50, height: 50 }, frame)

    expect(area.x + area.size).toBeLessThanOrEqual(frame.width)
    expect(area.y).toBe(0)
  })

  it('never asks for more than the frame holds', () => {
    expect(cutOut({ x: 0, y: 0, width: 1400, height: 1400 }, frame).size).toBe(1500)
  })
})
