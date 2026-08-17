import { describe, expect, it } from 'vitest'
import { FULL_SIZE, THUMBNAIL_SIZE, fitWithin } from './process'

/**
 * fitWithin decides the dimensions of every stored photo and thumbnail. The
 * end-to-end suite uses a small sample that already fits, so without these the
 * downscale branch every real photo takes would run untested.
 */
describe('fitWithin', () => {
  it('leaves an image that already fits alone', () => {
    expect(fitWithin(800, 600, FULL_SIZE)).toEqual({ width: 800, height: 600 })
  })

  it('never enlarges a small image', () => {
    expect(fitWithin(50, 40, FULL_SIZE)).toEqual({ width: 50, height: 40 })
  })

  it('caps the longest edge when the image is wider than tall', () => {
    expect(fitWithin(4000, 3000, FULL_SIZE)).toEqual({ width: 2000, height: 1500 })
  })

  it('caps the longest edge when the image is taller than wide', () => {
    expect(fitWithin(3000, 4000, FULL_SIZE)).toEqual({ width: 1500, height: 2000 })
  })

  it('keeps the aspect ratio through a downscale', () => {
    const source = { width: 4032, height: 3024 } // a common phone sensor
    const fitted = fitWithin(source.width, source.height, FULL_SIZE)

    expect(fitted.width / fitted.height).toBeCloseTo(source.width / source.height, 2)
    expect(Math.max(fitted.width, fitted.height)).toBe(FULL_SIZE)
  })

  it('produces whole pixels', () => {
    const fitted = fitWithin(1476, 1500, FULL_SIZE)

    expect(Number.isInteger(fitted.width)).toBe(true)
    expect(Number.isInteger(fitted.height)).toBe(true)
  })

  it('never rounds an extreme ratio down to zero', () => {
    // A canvas of zero width throws, and the dimensions columns require > 0.
    const fitted = fitWithin(8000, 3, THUMBNAIL_SIZE)

    expect(fitted.width).toBeGreaterThan(0)
    expect(fitted.height).toBeGreaterThan(0)
  })

  it('caps a square at the thumbnail size too', () => {
    expect(fitWithin(3000, 3000, THUMBNAIL_SIZE)).toEqual({
      width: THUMBNAIL_SIZE,
      height: THUMBNAIL_SIZE,
    })
  })
})
