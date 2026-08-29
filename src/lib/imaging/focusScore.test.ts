import { describe, expect, it } from 'vitest'
import { SOFT_FOCUS } from '../focus'
import { focusScore } from './sharpness'

/**
 * The scenes that set `SOFT_FOCUS`, and the reason it can be a single number.
 *
 * A focus measure is only as good as the range of photographs it stays honest
 * across, and the ones that break a naive measure are not blurred photographs
 * at all — they are sharp photographs of smooth things (fog, a pale sky) and
 * sharp subjects against deliberately blurred backgrounds. So these build both,
 * from fractal texture that stands in for the detail a real photograph carries,
 * and assert the gap the threshold sits inside rather than any exact value.
 */
const WIDTH = 256
const HEIGHT = 192

function generator(seed: number) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

/** One octave of smoothly interpolated value noise. */
function octave(cell: number, random: () => number): Float64Array {
  const columns = Math.ceil(WIDTH / cell) + 2
  const rows = Math.ceil(HEIGHT / cell) + 2
  const grid = Array.from({ length: rows * columns }, () => random())
  const out = new Float64Array(WIDTH * HEIGHT)

  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const gx = x / cell
      const gy = y / cell
      const x0 = Math.floor(gx)
      const y0 = Math.floor(gy)
      const fx = gx - x0
      const fy = gy - y0
      const sx = fx * fx * (3 - 2 * fx)
      const sy = fy * fy * (3 - 2 * fy)
      const top =
        grid[y0 * columns + x0] + (grid[y0 * columns + x0 + 1] - grid[y0 * columns + x0]) * sx
      const bottom =
        grid[(y0 + 1) * columns + x0] +
        (grid[(y0 + 1) * columns + x0 + 1] - grid[(y0 + 1) * columns + x0]) * sx

      out[y * WIDTH + x] = top + (bottom - top) * sy
    }
  }

  return out
}

/** Detail at every scale, the way a photograph of anything real carries it. */
function texture(random: () => number, contrast = 1): Float64Array {
  const out = new Float64Array(WIDTH * HEIGHT)
  let amplitude = 1
  let total = 0

  for (let cell = 64; cell >= 1; cell /= 2) {
    const layer = octave(cell, random)
    for (let i = 0; i < out.length; i += 1) out[i] += amplitude * layer[i]
    total += amplitude
    amplitude *= 0.75
  }

  for (let i = 0; i < out.length; i += 1) {
    out[i] = 128 + contrast * 110 * (out[i] / total - 0.5)
  }

  return out
}

function blur(source: Float64Array, sigma: number): Float64Array {
  if (sigma <= 0) return Float64Array.from(source)

  const radius = Math.max(1, Math.ceil(sigma * 3))
  const weights: number[] = []
  for (let i = -radius; i <= radius; i += 1) weights.push(Math.exp(-(i * i) / (2 * sigma * sigma)))
  const sum = weights.reduce((a, b) => a + b, 0)
  const kernel = weights.map((w) => w / sum)

  const clamp = (value: number, limit: number) => Math.min(limit - 1, Math.max(0, value))
  const horizontal = new Float64Array(source.length)
  const out = new Float64Array(source.length)

  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      let total = 0
      for (let i = -radius; i <= radius; i += 1) {
        total += kernel[i + radius] * source[y * WIDTH + clamp(x + i, WIDTH)]
      }
      horizontal[y * WIDTH + x] = total
    }
  }

  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      let total = 0
      for (let i = -radius; i <= radius; i += 1) {
        total += kernel[i + radius] * horizontal[clamp(y + i, HEIGHT) * WIDTH + x]
      }
      out[y * WIDTH + x] = total
    }
  }

  return out
}

/**
 * Sensor noise, which a camera adds after the lens has already blurred.
 *
 * Small, because these photographs are measured at 256px: a phone frame is
 * shrunk by more than tenfold to get here, and averaging that many pixels
 * leaves very little noise behind. Getting this wrong in either direction is
 * what makes a focus measure look better in a test than it is.
 */
function withNoise(luma: Float64Array, random: () => number, sigma = 0.25): Float64Array {
  const out = Float64Array.from(luma)
  for (let i = 0; i < out.length; i += 1) {
    out[i] += sigma * (random() + random() + random() - 1.5) * 2
  }
  return out
}

/** A subject in focus, the rest of the frame thrown out of focus behind it. */
function subjectAgainstBackground(
  random: () => number,
  box: { top: number; left: number; size: number },
): Float64Array {
  const out = blur(texture(random), 4)
  const subject = texture(random)

  for (let y = box.top; y < box.top + box.size; y += 1) {
    for (let x = box.left; x < box.left + box.size; x += 1) {
      out[y * WIDTH + x] = subject[y * WIDTH + x]
    }
  }

  return out
}

function scenes(seed: number) {
  const random = generator(seed)
  const sharp = texture(random)

  return {
    inFocus: {
      'a textured landscape': withNoise(sharp, random),
      'a subject against a blurred background': withNoise(
        subjectAgainstBackground(random, { top: 60, left: 80, size: 80 }),
        random,
      ),
      'a small subject against a blurred background': withNoise(
        subjectAgainstBackground(random, { top: 80, left: 110, size: 45 }),
        random,
      ),
    },
    blurred: {
      'softened': withNoise(blur(sharp, 1), random),
      'blurred': withNoise(blur(sharp, 2), random),
      'badly blurred': withNoise(blur(sharp, 4), random),
    },
    unjudgeable: {
      'fog: sharp, but almost no contrast anywhere': withNoise(texture(random, 0.12), random),
      'a blank wall': withNoise(new Float64Array(WIDTH * HEIGHT).fill(128), random),
    },
  }
}

const SEEDS = [1, 7, 42, 99, 2026]

describe('focusScore', () => {
  it('reads every kind of in-focus photograph well above the line', () => {
    for (const seed of SEEDS) {
      for (const [name, luma] of Object.entries(scenes(seed).inFocus)) {
        const score = focusScore(luma, WIDTH, HEIGHT)

        expect(score, `${name} (seed ${seed})`).not.toBeNull()
        expect(score as number, `${name} (seed ${seed})`).toBeGreaterThan(SOFT_FOCUS * 2)
      }
    }
  })

  it('reads every blurred photograph well below the line', () => {
    for (const seed of SEEDS) {
      for (const [name, luma] of Object.entries(scenes(seed).blurred)) {
        const score = focusScore(luma, WIDTH, HEIGHT)

        expect(score, `${name} (seed ${seed})`).not.toBeNull()
        expect(score as number, `${name} (seed ${seed})`).toBeLessThan(SOFT_FOCUS / 1.5)
      }
    }
  })

  it('declines to judge a frame with nothing in it to judge', () => {
    // The false positive that matters. A misty lake is a sharp photograph of a
    // smooth thing, and a measure that cannot tell those apart tells the owner
    // to delete it.
    for (const seed of SEEDS) {
      for (const [name, luma] of Object.entries(scenes(seed).unjudgeable)) {
        expect(focusScore(luma, WIDTH, HEIGHT), `${name} (seed ${seed})`).toBeNull()
      }
    }
  })

  it('has nothing to say about a frame smaller than one square', () => {
    expect(focusScore(new Float64Array(16 * 16), 16, 16)).toBeNull()
  })
})
