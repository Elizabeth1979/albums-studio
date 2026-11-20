import { describe, expect, it } from 'vitest'
import { cutOut, headTurn } from './eyes'

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

describe('headTurn', () => {
  /** A column-major 4x4 rotation about the vertical axis, as the model returns it. */
  function turnedSideways(degrees: number): number[] {
    const r = (degrees * Math.PI) / 180
    // Rows of the rotation: [cos, 0, sin], [0, 1, 0], [-sin, 0, cos].
    const rows = [
      [Math.cos(r), 0, Math.sin(r), 0],
      [0, 1, 0, 0],
      [-Math.sin(r), 0, Math.cos(r), 0],
      [0, 0, 0, 1],
    ]
    return [0, 1, 2, 3].flatMap((column) => rows.map((row) => row[column]))
  }

  it('reads a head facing the camera as no turn', () => {
    const turn = headTurn(turnedSideways(0))
    expect(turn?.sideways).toBeCloseTo(0)
    expect(turn?.upDown).toBeCloseTo(0)
  })

  it('reads a head turned sideways by its angle', () => {
    expect(headTurn(turnedSideways(35))?.sideways).toBeCloseTo(35)
    expect(headTurn(turnedSideways(35))?.upDown).toBeCloseTo(0)
  })

  it('says nothing when the model returned no transform', () => {
    expect(headTurn(undefined)).toBeNull()
  })
})
