import { describe, expect, it, vi } from 'vitest'
import { SOFT_FOCUS } from '../focus'
import { fitWithin } from './process'
import { focusScore } from './sharpness'

/**
 * Focus, judged the way a photograph actually reaches this code.
 *
 * The first version of these scenes blurred an image that was already small,
 * and every one of them passed while a plainly blurry photograph in a real
 * album went unmentioned. The fault was in the scenes, not the measure: **a
 * camera blurs a frame thousands of pixels wide, and the app then shrinks that
 * frame to a 400px thumbnail, which shrinks the blur with it.** Blurring at the
 * size we measure at describes a photograph that does not exist, and a
 * threshold calibrated against it is calibrated against nothing.
 *
 * So every scene here starts at camera size, is blurred there, and is then put
 * through the same reduction the app performs before anything is measured.
 */
const CAMERA_WIDTH = 1200
const CAMERA_HEIGHT = 900

/**
 * Longer than the default five seconds, for this file only.
 *
 * Building a camera-sized frame and blurring it is real work — a couple of
 * seconds on an idle machine — and the default limit turned a busy CI runner
 * into a failure that said nothing about focus. The alternative was to measure
 * smaller frames, which is the exact shortcut that hid the bug these tests
 * exist to catch.
 */
vi.setConfig({ testTimeout: 30_000 })

/** The longest edge of the thumbnail the album stores and this reads. */
const THUMBNAIL = 400

type Plane = { luma: Float64Array; width: number; height: number }

function generator(seed: number) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

function octave(width: number, height: number, cell: number, random: () => number): Float64Array {
  const columns = Math.ceil(width / cell) + 2
  const rows = Math.ceil(height / cell) + 2
  const grid = Array.from({ length: rows * columns }, () => random())
  const out = new Float64Array(width * height)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const gx = x / cell
      const gy = y / cell
      const x0 = Math.floor(gx)
      const y0 = Math.floor(gy)
      const fx = gx - x0
      const fy = gy - y0
      const sx = fx * fx * (3 - 2 * fx)
      const sy = fy * fy * (3 - 2 * fy)
      const a = grid[y0 * columns + x0]
      const b = grid[y0 * columns + x0 + 1]
      const c = grid[(y0 + 1) * columns + x0]
      const d = grid[(y0 + 1) * columns + x0 + 1]
      const top = a + (b - a) * sx
      const bottom = c + (d - c) * sx

      out[y * width + x] = top + (bottom - top) * sy
    }
  }

  return out
}

/** Detail at every scale, the way a photograph of anything real carries it. */
function texture(random: () => number, contrast = 1): Float64Array {
  const out = new Float64Array(CAMERA_WIDTH * CAMERA_HEIGHT)
  let amplitude = 1
  let total = 0

  for (let cell = 300; cell >= 2; cell /= 2) {
    const layer = octave(CAMERA_WIDTH, CAMERA_HEIGHT, cell, random)
    for (let i = 0; i < out.length; i += 1) out[i] += amplitude * layer[i]
    total += amplitude
    amplitude *= 0.75
  }

  for (let i = 0; i < out.length; i += 1) {
    out[i] = 128 + contrast * 110 * (out[i] / total - 0.5)
  }

  return out
}

/** What a lens does when the focus is off, at the size the camera wrote. */
function blur(source: Float64Array, sigma: number): Float64Array {
  if (sigma <= 0) return Float64Array.from(source)

  const radius = Math.max(1, Math.ceil(sigma * 3))
  const weights: number[] = []
  for (let i = -radius; i <= radius; i += 1) {
    weights.push(Math.exp(-(i * i) / (2 * sigma * sigma)))
  }
  const sum = weights.reduce((a, b) => a + b, 0)
  const kernel = weights.map((w) => w / sum)

  const clamp = (value: number, limit: number) => Math.min(limit - 1, Math.max(0, value))
  const horizontal = new Float64Array(source.length)
  const out = new Float64Array(source.length)

  for (let y = 0; y < CAMERA_HEIGHT; y += 1) {
    for (let x = 0; x < CAMERA_WIDTH; x += 1) {
      let total = 0
      for (let i = -radius; i <= radius; i += 1) {
        total += kernel[i + radius] * source[y * CAMERA_WIDTH + clamp(x + i, CAMERA_WIDTH)]
      }
      horizontal[y * CAMERA_WIDTH + x] = total
    }
  }

  for (let y = 0; y < CAMERA_HEIGHT; y += 1) {
    for (let x = 0; x < CAMERA_WIDTH; x += 1) {
      let total = 0
      for (let i = -radius; i <= radius; i += 1) {
        total +=
          kernel[i + radius] * horizontal[clamp(y + i, CAMERA_HEIGHT) * CAMERA_WIDTH + x]
      }
      out[y * CAMERA_WIDTH + x] = total
    }
  }

  return out
}

/**
 * What a canvas does when it draws a large photograph small: average the pixels
 * that fall in each cell. This is the step that hides blur, so it belongs in
 * every scene rather than in none of them.
 */
function shrink(source: Plane, longestEdge: number): Plane {
  const size = fitWithin(source.width, source.height, longestEdge)
  const out = new Float64Array(size.width * size.height)

  for (let y = 0; y < size.height; y += 1) {
    const top = Math.floor((y * source.height) / size.height)
    const bottom = Math.max(top + 1, Math.floor(((y + 1) * source.height) / size.height))

    for (let x = 0; x < size.width; x += 1) {
      const left = Math.floor((x * source.width) / size.width)
      const right = Math.max(left + 1, Math.floor(((x + 1) * source.width) / size.width))

      let total = 0
      let counted = 0
      for (let sy = top; sy < bottom && sy < source.height; sy += 1) {
        for (let sx = left; sx < right && sx < source.width; sx += 1) {
          total += source.luma[sy * source.width + sx]
          counted += 1
        }
      }

      out[y * size.width + x] = counted > 0 ? total / counted : 0
    }
  }

  return { luma: out, width: size.width, height: size.height }
}

/**
 * A camera frame, reduced to the thumbnail the album stores — and rounded to
 * whole numbers, because that is what a stored image holds.
 *
 * The rounding is not a detail. Measured in floating point a blurred photograph
 * read 0.07, and the same photograph through a real browser read 0.21: rounding
 * is itself a source of detail, the Laplacian multiplies it, and taking the
 * sharpest squares hunts out the squares where it dominates. A harness that
 * skips this step describes a photograph made of real numbers, which no camera
 * has ever produced.
 */
function asThumbnail(camera: Float64Array): Plane {
  const plane = shrink({ luma: camera, width: CAMERA_WIDTH, height: CAMERA_HEIGHT }, THUMBNAIL)

  for (let i = 0; i < plane.luma.length; i += 1) {
    plane.luma[i] = Math.max(0, Math.min(255, Math.round(plane.luma[i])))
  }

  return plane
}

/**
 * A subject in focus with the rest of the frame thrown out of focus behind it.
 *
 * The background is blurred by 8px at camera size, which is several times past
 * the line this feature draws — thoroughly out of focus, and a third of the
 * cost of the 20px it used to be. That cost was not free: building it took this
 * test beyond vitest's five-second limit whenever the machine was busy, which
 * showed up as a failure that had nothing to do with what is being measured.
 */
function subjectAgainstBackground(random: () => number): Float64Array {
  const out = blur(texture(random), 8)
  const subject = texture(random)

  for (let y = Math.round(CAMERA_HEIGHT * 0.3); y < Math.round(CAMERA_HEIGHT * 0.75); y += 1) {
    for (let x = Math.round(CAMERA_WIDTH * 0.35); x < Math.round(CAMERA_WIDTH * 0.7); x += 1) {
      out[y * CAMERA_WIDTH + x] = subject[y * CAMERA_WIDTH + x]
    }
  }

  return out
}

const SEEDS = [11, 23, 57]

/**
 * Scenes are built once per seed and reused.
 *
 * Deterministic either way — each seed drives its own generator — but building
 * a 1200x900 frame is the expensive part of this file, and several cases want
 * the same one. Kept cheap on purpose: this suite runs beside timing-sensitive
 * tests, and a slow file makes their failures somebody else's mystery.
 */
const cache = new Map<string, Float64Array>()

function remember(key: string, build: () => Float64Array): Float64Array {
  const known = cache.get(key)
  if (known) return known

  const built = build()
  cache.set(key, built)
  return built
}

function scene(seed: number): Float64Array {
  return remember(`sharp-${seed}`, () => texture(generator(seed)))
}

function softened(seed: number, sigma: number): Float64Array {
  return remember(`blur-${seed}-${sigma}`, () => blur(scene(seed), sigma))
}

function read(camera: Float64Array): number | null {
  const thumbnail = asThumbnail(camera)
  return focusScore(thumbnail.luma, thumbnail.width, thumbnail.height)
}

describe('focusScore, through the reduction a photograph really goes through', () => {
  it('reads a photograph that came out as in focus', () => {
    for (const seed of SEEDS) {
      const score = read(scene(seed))

      expect(score, `seed ${seed}`).not.toBeNull()
      expect(score as number, `seed ${seed}`).toBeGreaterThan(SOFT_FOCUS * 2)
    }
  })

  it('leaves a sharp subject against a deliberately blurred background alone', () => {
    // The photograph someone meant to take. Averaged over the whole frame this
    // reads as a mistake, which is why the sharpest squares are what count.
    for (const seed of SEEDS) {
      const score = read(remember(`bokeh-${seed}`, () => subjectAgainstBackground(generator(seed))))

      expect(score, `seed ${seed}`).not.toBeNull()
      expect(score as number, `seed ${seed}`).toBeGreaterThan(SOFT_FOCUS)
    }
  })

  it('leaves a barely soft photograph alone', () => {
    for (const seed of SEEDS) {
      const score = read(softened(seed, 1))

      expect(score as number, `seed ${seed}`).toBeGreaterThan(SOFT_FOCUS)
    }
  })

  it('draws the line between the softness worth mentioning and the softness that is not', () => {
    // This is what pins `SOFT_FOCUS` to something measured. Rather than assert
    // a reading against a number chosen to match it, it asserts the constant
    // itself falls inside the gap these scenes leave, with room on both sides.
    // The shipped 0.3 sat below the gap and flagged nothing in a real album.
    const barelySoft = SEEDS.map((seed) => read(softened(seed, 1)) as number)
    const worthMentioning = SEEDS.map((seed) => read(softened(seed, 1.5)) as number)

    expect(SOFT_FOCUS).toBeGreaterThan(Math.max(...worthMentioning) * 1.1)
    expect(SOFT_FOCUS).toBeLessThan(Math.min(...barelySoft) / 1.1)
  })

  it('offers a photograph the lens actually missed', () => {
    // The case the whole feature exists for, and the one the first version of
    // this suite could not see: blur applied at camera size, then reduced.
    for (const seed of SEEDS) {
      for (const sigma of [2, 3, 6]) {
        const score = read(softened(seed, sigma))

        expect(score, `${sigma}px blur, seed ${seed}`).not.toBeNull()
        expect(score as number, `${sigma}px blur, seed ${seed}`).toBeLessThan(SOFT_FOCUS)
      }
    }
  })

  it('declines to judge a frame with nothing in it to judge', () => {
    // A misty lake is a sharp photograph of a smooth thing, and a measure that
    // cannot tell those apart tells the owner to delete it.
    for (const seed of SEEDS) {
      expect(
        read(remember(`fog-${seed}`, () => texture(generator(seed), 0.1))),
        `fog, seed ${seed}`,
      ).toBeNull()
      expect(
        read(new Float64Array(CAMERA_WIDTH * CAMERA_HEIGHT).fill(128)),
        `blank wall, seed ${seed}`,
      ).toBeNull()
    }
  })

  it('would miss the same photograph if it were shrunk further before measuring', () => {
    // This is the bug that shipped, kept as a test so it cannot ship twice.
    // Reducing the thumbnail again before measuring — which the first version
    // did, to 256px — lifts a blurred photograph back above the line and the
    // album goes quiet.
    for (const seed of SEEDS) {
      const soft = softened(seed, 2)
      const thumbnail = asThumbnail(soft)
      const shrunkFurther = shrink(thumbnail, 256)

      const atThumbnailSize = focusScore(thumbnail.luma, thumbnail.width, thumbnail.height)
      const atSmallerSize = focusScore(
        shrunkFurther.luma,
        shrunkFurther.width,
        shrunkFurther.height,
      )

      // Clearly blurred where it is measured now...
      expect(atThumbnailSize as number, `seed ${seed}`).toBeLessThan(SOFT_FOCUS)

      // ...and more than twice that reading once shrunk again, which is what
      // lifted photographs like this over the line and emptied the section.
      expect(atSmallerSize as number, `seed ${seed}`).toBeGreaterThan(
        (atThumbnailSize as number) * 1.8,
      )
    }
  })

  it('finds no detail in a photograph that has none, whole-numbered pixels and all', () => {
    // The second fault this feature shipped with. Every stored photograph holds
    // whole numbers, and rounding to them is itself a source of detail that the
    // Laplacian multiplies about twentyfold. It lands hardest on the squares
    // with least contrast, which are exactly the ones the sharpest-fifth rule
    // picks — so a frame with no detail at all read as though it had some, and
    // blurred photographs read three times higher in a browser than the same
    // pixels did in arithmetic.
    //
    // This frame is smooth by construction: plenty of contrast for a square to
    // be judged, and nothing in it finer than the blur of a badly missed shot.
    const smooth = new Float64Array(CAMERA_WIDTH * CAMERA_HEIGHT)
    for (let y = 0; y < CAMERA_HEIGHT; y += 1) {
      for (let x = 0; x < CAMERA_WIDTH; x += 1) {
        // Gently lit rather than bold: enough contrast for a square to be
        // judged, little enough that a fixed amount of false detail would
        // dominate it — which is the case the correction exists for.
        smooth[y * CAMERA_WIDTH + x] = 128 + 16 * Math.sin(x / 90) + 13 * Math.cos(y / 70)
      }
    }

    const plane = asThumbnail(smooth)
    const score = focusScore(plane.luma, plane.width, plane.height)

    expect(score).not.toBeNull()
    expect(score as number).toBeLessThan(0.05)
  })

  it('has nothing to say about a frame smaller than one square', () => {
    expect(focusScore(new Float64Array(16 * 16), 16, 16)).toBeNull()
  })
})
