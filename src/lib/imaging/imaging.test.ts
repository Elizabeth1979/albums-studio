import { describe, expect, it } from 'vitest'
import { downsampleLuma, toLuma } from './luma'
import { HASH_SIZE, dct2d, hammingDistance, perceptualHash } from './phash'
import { laplacianVariance } from './sharpness'

const SIZE = 64

/** Builds a luma plane from a function of position. */
function plane(draw: (x: number, y: number) => number, size = SIZE): Float64Array {
  const values = new Float64Array(size * size)

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      values[y * size + x] = draw(x, y)
    }
  }

  return values
}

const flat = plane(() => 128)
const leftHalfDark = plane((x) => (x < SIZE / 2 ? 20 : 220))
const topHalfDark = plane((_x, y) => (y < SIZE / 2 ? 20 : 220))
const gradient = plane((x) => (x / SIZE) * 255)
const checkerboard = plane((x, y) => ((x + y) % 2 === 0 ? 0 : 255))
// Varies in both axes, so the transform has energy spread across coefficients.
// A pure gradient is degenerate: most coefficients are mathematically zero and
// their bits come out of floating-point noise rather than the image.
const textured = plane((x, y) => 128 + 100 * Math.sin(x / 7) * Math.cos(y / 5))

describe('toLuma', () => {
  it('weights green most and alpha not at all', () => {
    const pixels = new Uint8ClampedArray([
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 0,
    ])

    const [red, green, blue] = toLuma(pixels)

    expect(red).toBeCloseTo(76.2, 1)
    expect(green).toBeCloseTo(149.7, 1)
    expect(blue).toBeCloseTo(29.1, 1)
    expect(green).toBeGreaterThan(red)
    expect(red).toBeGreaterThan(blue)
  })

  it('leaves a grey pixel at its own value', () => {
    expect(toLuma(new Uint8ClampedArray([128, 128, 128, 255]))[0]).toBeCloseTo(128, 5)
  })
})

describe('downsampleLuma', () => {
  it('averages a cell rather than sampling one pixel of it', () => {
    // Alternating columns average to the midpoint; picking a single pixel would
    // land on 0 or 255 instead.
    const striped = plane((x) => (x % 2 === 0 ? 0 : 255), 8)

    for (const value of downsampleLuma(striped, 8, 8, 4)) {
      expect(value).toBeCloseTo(127.5, 5)
    }
  })

  it('keeps a flat plane flat', () => {
    for (const value of downsampleLuma(flat, SIZE, SIZE, 8)) {
      expect(value).toBeCloseTo(128, 5)
    }
  })
})

describe('dct2d', () => {
  it('puts all the energy of a flat plane in the DC term', () => {
    const frequencies = dct2d(downsampleLuma(flat, SIZE, SIZE, 8), 8)

    expect(frequencies[0]).toBeCloseTo(128 * 8, 4)

    for (let index = 1; index < frequencies.length; index += 1) {
      expect(frequencies[index]).toBeCloseTo(0, 6)
    }
  })

  it('preserves total energy, as an orthonormal transform must', () => {
    const values = downsampleLuma(gradient, SIZE, SIZE, 8)
    const frequencies = dct2d(values, 8)

    const energy = (input: Float64Array) =>
      input.reduce((total, value) => total + value * value, 0)

    expect(energy(frequencies)).toBeCloseTo(energy(values), 4)
  })
})

describe('perceptualHash', () => {
  it('produces exactly 64 bits', () => {
    const hash = perceptualHash(gradient, SIZE, SIZE)

    expect(hash).toHaveLength(HASH_SIZE * HASH_SIZE)
    expect(hash).toMatch(/^[01]{64}$/)
  })

  it('is stable for the same image', () => {
    expect(perceptualHash(gradient, SIZE, SIZE)).toBe(perceptualHash(gradient, SIZE, SIZE))
  })

  it('ignores a uniform brightness shift', () => {
    // Adding a constant moves only the DC term, which the median excludes.
    const brighter = plane((x, y) => textured[y * SIZE + x] + 30)

    expect(
      hammingDistance(perceptualHash(textured, SIZE, SIZE), perceptualHash(brighter, SIZE, SIZE)),
    ).toBe(0)
  })

  it('survives a resize, which is the point of a perceptual hash', () => {
    const half = downsampleLuma(textured, SIZE, SIZE, SIZE / 2)
    const distance = hammingDistance(
      perceptualHash(textured, SIZE, SIZE),
      perceptualHash(half, SIZE / 2, SIZE / 2),
    )

    expect(distance).toBeLessThanOrEqual(4)
  })

  it('is dominated by noise on a featureless image', () => {
    // Worth pinning down rather than discovering in Phase 7: a subject with no
    // structure leaves every coefficient at zero, so the bits carry no signal
    // and two photos of the same blank wall may not match. Duplicate detection
    // has to treat featureless frames as unresolvable, not as different.
    const blank = plane(() => 128)
    const barelyDifferent = plane((x, y) => 128 + (x === 0 && y === 0 ? 1 : 0))

    expect(
      hammingDistance(perceptualHash(blank, SIZE, SIZE), perceptualHash(barelyDifferent, SIZE, SIZE)),
    ).toBeGreaterThan(0)
  })

  it('separates images that differ in structure', () => {
    const distance = hammingDistance(
      perceptualHash(leftHalfDark, SIZE, SIZE),
      perceptualHash(topHalfDark, SIZE, SIZE),
    )

    expect(distance).toBeGreaterThan(8)
  })
})

describe('hammingDistance', () => {
  it('counts differing bits', () => {
    expect(hammingDistance('0000', '0000')).toBe(0)
    expect(hammingDistance('0000', '1010')).toBe(2)
    expect(hammingDistance('1111', '0000')).toBe(4)
  })

  it('refuses to compare different lengths', () => {
    expect(() => hammingDistance('000', '0000')).toThrow('same length')
  })
})

describe('laplacianVariance', () => {
  it('is zero for a flat image, which has no edges at all', () => {
    expect(laplacianVariance(flat, SIZE, SIZE)).toBeCloseTo(0, 6)
  })

  it('is zero for a linear gradient, whose second derivative vanishes', () => {
    expect(laplacianVariance(gradient, SIZE, SIZE)).toBeCloseTo(0, 6)
  })

  it('rises sharply on hard edges', () => {
    expect(laplacianVariance(checkerboard, SIZE, SIZE)).toBeGreaterThan(100_000)
  })

  it('ranks a crisp edge above a blurred one', () => {
    const crisp = plane((x) => (x < SIZE / 2 ? 0 : 255))
    const blurred = plane((x) => {
      const distance = x - SIZE / 2
      return 127.5 + 127.5 * Math.tanh(distance / 6)
    })

    expect(laplacianVariance(crisp, SIZE, SIZE)).toBeGreaterThan(
      laplacianVariance(blurred, SIZE, SIZE),
    )
  })

  it('never returns a negative number for the database check', () => {
    expect(laplacianVariance(flat, SIZE, SIZE)).toBeGreaterThanOrEqual(0)
    expect(laplacianVariance(new Float64Array(4), 2, 2)).toBe(0)
  })
})
