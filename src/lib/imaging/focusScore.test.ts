import { describe, expect, it, vi } from 'vitest'
import { BLURRED_ENOUGH } from '../focus'
import { fitWithin } from './process'
import { blurRatio } from './reblur'
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

/**
 * The noise every camera writes, added after the blur the way a camera adds it.
 *
 * Absent from these scenes for the first five rounds of this feature, and its
 * absence is what let a measure that collapses on every real photograph pass
 * every test here. Amounts are in grey levels either side of the true value:
 * two is a bright daylight frame, ten is a dim one.
 */
function noisy(source: Float64Array, levels: number, random: () => number): Float64Array {
  if (levels <= 0) return source

  const out = Float64Array.from(source)
  for (let i = 0; i < out.length; i += 1) out[i] += levels * (random() * 2 - 1)

  return out
}

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

/**
 * A frame like a close-up of people: broad smooth areas, a few crisp
 * boundaries, very little fine texture.
 *
 * This is the scene the previous measure could not handle. A sharp photograph
 * of faces carries a fraction of the detail a sharp photograph of water does,
 * so counting detail called it blurred. Every claim below is asserted for this
 * scene as well as for the textured one.
 */
function smoothSubject(random: () => number): Float64Array {
  const out = new Float64Array(CAMERA_WIDTH * CAMERA_HEIGHT)
  const soft = octave(CAMERA_WIDTH, CAMERA_HEIGHT, 400, random)

  for (let y = 0; y < CAMERA_HEIGHT; y += 1) {
    for (let x = 0; x < CAMERA_WIDTH; x += 1) {
      let value = 150 + 30 * soft[y * CAMERA_WIDTH + x]

      const dx = (x - CAMERA_WIDTH * 0.42) / (CAMERA_WIDTH * 0.22)
      const dy = (y - CAMERA_HEIGHT * 0.48) / (CAMERA_HEIGHT * 0.37)
      if (dx * dx + dy * dy < 1) value = 196 + 12 * soft[y * CAMERA_WIDTH + x]

      const inBar = (from: number, to: number) => x > from && x < to
      if (y > CAMERA_HEIGHT * 0.36 && y < CAMERA_HEIGHT * 0.44) {
        if (inBar(CAMERA_WIDTH * 0.27, CAMERA_WIDTH * 0.41)) value = 42
        if (inBar(CAMERA_WIDTH * 0.44, CAMERA_WIDTH * 0.58)) value = 42
      }

      if (y > CAMERA_HEIGHT * 0.84) value = 96 + 20 * soft[y * CAMERA_WIDTH + x]

      out[y * CAMERA_WIDTH + x] = value
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

function faces_(seed: number): Float64Array {
  return remember(`faces-${seed}`, () => smoothSubject(generator(seed)))
}

function softenedFaces(seed: number, sigma: number): Float64Array {
  return remember(`faces-blur-${seed}-${sigma}`, () => blur(faces_(seed), sigma))
}

function softened(seed: number, sigma: number): Float64Array {
  return remember(`blur-${seed}-${sigma}`, () => blur(scene(seed), sigma))
}

/** The reading the blur advice acts on: how much detail survives a re-blur. */
function read(camera: Float64Array): number | null {
  const frame = asThumbnail(camera)
  return blurRatio(frame.luma, frame.width, frame.height)
}

/** The reading used only for ranking inside one burst. */
function readDetail(camera: Float64Array): number | null {
  const thumbnail = asThumbnail(camera)
  return focusScore(thumbnail.luma, thumbnail.width, thumbnail.height)
}

describe('the blur reading, through the reduction a photograph really goes through', () => {
  it('reads a photograph that came out as sharp, whatever it is a photograph of', () => {
    // Both content types, because the previous measure passed this for textured
    // scenes and failed it for faces — which is how a sharp close-up of two
    // people came to be offered for deletion.
    for (const seed of SEEDS) {
      for (const [what, frame] of [
        ['textured', scene(seed)],
        ['faces', faces_(seed)],
      ] as const) {
        const width = read(frame)

        expect(width, `${what}, seed ${seed}`).not.toBeNull()
        expect(width as number, `${what}, seed ${seed}`).toBeLessThan(BLURRED_ENOUGH)
      }
    }
  })

  it('reads a deliberately blurred background as less blurred than the whole frame', () => {
    // The one thing this measure still gets wrong, recorded rather than hidden.
    // A portrait shot against a thrown-out background is a photograph that came
    // out right, and judging the whole frame cannot know that: with the entire
    // background blurred by eight pixels it reads 0.47, which is past the line.
    //
    // What is asserted is the part that does hold — such a frame still reads
    // clearly sharper than the same scene blurred throughout — and the rest is
    // the case for finding the people in a photograph and judging them instead
    // of the frame, which is the next piece of work.
    for (const seed of SEEDS) {
      const bokeh = read(remember(`bokeh-${seed}`, () => subjectAgainstBackground(generator(seed))))
      const throughout = read(softened(seed, 8))

      expect(bokeh as number, `seed ${seed}`).toBeLessThan(throughout as number)
    }
  })

  it('offers a photograph the lens actually missed, whatever it is a photograph of', () => {
    // Six pixels at camera size, not three. Three is one pixel by the time the
    // frame is a 400px thumbnail, and reading that as soft would mean drawing
    // the line where an in-focus photograph of dense texture already sits.
    for (const seed of SEEDS) {
      for (const sigma of [6, 12]) {
        expect(read(softened(seed, sigma)) as number, `textured ${sigma}px, seed ${seed}`)
          .toBeGreaterThan(BLURRED_ENOUGH)
        expect(read(softenedFaces(seed, sigma)) as number, `faces ${sigma}px, seed ${seed}`)
          .toBeGreaterThan(BLURRED_ENOUGH)
      }
    }
  })

  it('moves far less with the subject than with the blur', () => {
    // The property the whole change rests on. Content shifts the reading by
    // about a pixel; blur shifts it by several. The measure it replaced moved
    // five-fold with content, which is why a portrait could not be told from a
    // blurred seascape.
    for (const seed of SEEDS) {
      const sharpTextured = read(scene(seed)) as number
      const sharpFaces = read(faces_(seed)) as number
      const blurredFaces = read(softenedFaces(seed, 4)) as number

      const bySubject = Math.abs(sharpTextured - sharpFaces)
      const byBlur = blurredFaces - sharpFaces

      expect(byBlur, `seed ${seed}`).toBeGreaterThan(bySubject * 1.5)
    }
  })

  it('offers a photograph so blurred it has almost no edges left', () => {
    // The fault the owner kept reporting, and the nastiest one in this feature:
    // heavy blur destroys the very transitions the measure looks for, so the
    // blurriest photographs found too few edges and were reported as
    // impossible to judge — which reads on screen as "nothing to say". The
    // worse the photograph, the more certain the silence.
    for (const seed of SEEDS) {
      for (const sigma of [10, 16]) {
        const width = read(softened(seed, sigma))

        expect(width, `${sigma}px, seed ${seed}`).not.toBeNull()
        expect(width as number, `${sigma}px, seed ${seed}`).toBeGreaterThan(BLURRED_ENOUGH)
      }
    }
  })

  it('is not fooled by the noise every camera writes', () => {
    // The fault that made this useless on real photographs, and the one that
    // took longest to find because it cannot happen in a scene built from
    // arithmetic. Noise is one-pixel spikes; a blurred frame has no slopes of
    // its own left, so the spikes became its strongest gradients, were found
    // as edges, and each one is a pixel wide. A frame blurred twenty pixels
    // with a trace of noise read *sharper than a sharp one*.
    for (const seed of SEEDS) {
      for (const levels of [2, 5, 10]) {
        const grain = generator(seed + 7)

        expect(
          read(noisy(scene(seed), levels, generator(seed + 7))) as number,
          `sharp, noise ${levels}, seed ${seed}`,
        ).toBeLessThan(BLURRED_ENOUGH)

        for (const sigma of [6, 12, 20]) {
          expect(
            read(noisy(softened(seed, sigma), levels, grain)) as number,
            `${sigma}px, noise ${levels}, seed ${seed}`,
          ).toBeGreaterThan(BLURRED_ENOUGH)
        }
      }
    }
  })

  it('says nothing about fog or a blank wall', () => {
    // Fog and a blank wall carry no dark and light to have a transition
    // between, so there is nothing to be wrong about. A ratio needs no special
    // case for them: with almost no detail to lose, almost none is lost, and
    // they land far below the line rather than being accused. Grain does not
    // change that, which is what broke every measure before this one.
    for (const seed of SEEDS) {
      const fog = remember(`fog-${seed}`, () => texture(generator(seed), 0.02))

      expect(read(fog) as number, `fog, seed ${seed}`).toBeLessThan(BLURRED_ENOUGH)
      expect(
        read(noisy(fog, 5, generator(seed + 7))) as number,
        `grainy fog, seed ${seed}`,
      ).toBeLessThan(BLURRED_ENOUGH)
      expect(
        read(new Float64Array(CAMERA_WIDTH * CAMERA_HEIGHT).fill(128)),
        `blank wall, seed ${seed}`,
      ).toBeNull()
    }
  })

  it('reads the same whatever the photograph is of', () => {
    // The property every earlier measure failed, and the reason this one
    // replaced them. Dense water and smooth skin are the pair that defeated
    // each of the others: the detail ratio read them five-fold apart, and the
    // crispest quarter put a tack-sharp selfie above a blurred seascape in a
    // real album. A ratio of a frame against itself cannot do that.
    for (const seed of SEEDS) {
      const textured = read(scene(seed)) as number
      const faces = read(faces_(seed)) as number
      const blurred = read(softenedFaces(seed, 6)) as number

      // Subject matter must move the reading by well under what blur does.
      expect(Math.abs(textured - faces), `seed ${seed}`).toBeLessThan((blurred - faces) / 3)
    }
  })

  it('has nothing to say about a frame too small to compare with itself', () => {
    expect(blurRatio(new Float64Array(16), 4, 4)).toBeNull()
  })
})

describe('focusScore, kept for ranking the frames of one burst', () => {
  it('separates blur when the subject is held still', () => {
    // Its remaining job. Inside a near-duplicate group every frame is the same
    // picture, so the detail it counts varies only with how well each came out
    // — which is the one condition under which this measure is trustworthy.
    for (const seed of SEEDS) {
      const sharp = readDetail(scene(seed)) as number
      const soft = readDetail(softened(seed, 2)) as number

      expect(soft, `seed ${seed}`).toBeLessThan(sharp * 0.5)
    }
  })

  // Not asserted here: that this measure swings more with subject matter than
  // edge width does. It is true — a real album read a sharp portrait five times
  // below sharp seascapes, which is what put the portrait on the list for
  // deletion — but these synthetic scenes do not reproduce it. Fractal texture
  // is not as dense as water and the smooth scene is not as smooth as skin, so
  // the two measures swing about equally here. The evidence for that claim is
  // the album in `docs/sessions/2026-08-30-texture-is-not-focus.md`, and a
  // scene invented to demonstrate it would be a scene fitted to the conclusion.

})
