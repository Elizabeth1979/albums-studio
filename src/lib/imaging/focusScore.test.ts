import { describe, expect, it, vi } from 'vitest'
import { BLURRED_ENOUGH } from '../focus'
import { ANALYSIS_CEILING } from './measure'
import { FULL_SIZE, fitWithin } from './process'
import { blurRatio } from './reblur'
import { focusScore } from './sharpness'

/**
 * Focus, judged the way a photograph actually reaches this code.
 *
 * These scenes have modelled the wrong reduction twice, and each time every
 * test passed while the owner's album went unseparated.
 *
 * The first version blurred an image that was already small. **A camera blurs
 * a frame thousands of pixels wide and the app then shrinks it, which shrinks
 * the blur with it**, so blurring at the size we measure at describes a
 * photograph that does not exist.
 *
 * The second version — this one, until now — fixed that but reduced to a 400px
 * thumbnail, which is what the app read until #53 moved it to the 2000px stored
 * image read at `ANALYSIS_CEILING`. The harness was not moved with it. So the
 * threshold below, the denoise width and the re-blur span were all fitted at
 * 400px and then used at 800px, where the same frame reads quite differently:
 * a lightly softened one read 0.390 at 400px and 0.458 at 800px, because the
 * re-blur span is a fixed count of pixels and halving the frame doubles it
 * relative to the picture.
 *
 * So the chain here is now the one the app performs, and the sizes are imported
 * rather than restated: a camera frame, blurred at camera size, reduced to
 * `FULL_SIZE` and rounded as a stored JPEG holds it, then reduced to
 * `ANALYSIS_CEILING` and rounded again — which is exactly what `measureFocus`
 * does to the bytes it downloads.
 */

/**
 * The stored image, which is what `measureFocus` is handed.
 *
 * Scenes are built and blurred at this size rather than at a phone's full
 * 4000px, which would take minutes to blur in a test. The blur is named in
 * stored-image pixels throughout, and a phone frame reduced to `FULL_SIZE`
 * halves whatever the lens did — so a sigma here is worth roughly twice as many
 * pixels on the camera's own frame, which is how the tables below read it.
 */
const STORED_WIDTH = FULL_SIZE
const STORED_HEIGHT = 1500

/**
 * Longer than the default five seconds, for this file only.
 *
 * Building a stored-size frame and blurring it is real work, and the default
 * limit turned a busy CI runner into a failure that said nothing about focus.
 * The alternative was to measure smaller frames, which is the exact shortcut
 * that hid the bug these tests exist to catch — twice.
 */
vi.setConfig({ testTimeout: 180_000 })

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
  const out = new Float64Array(STORED_WIDTH * STORED_HEIGHT)
  let amplitude = 1
  let total = 0

  for (let cell = 500; cell >= 2; cell /= 2) {
    const layer = octave(STORED_WIDTH, STORED_HEIGHT, cell, random)
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

  for (let y = 0; y < STORED_HEIGHT; y += 1) {
    for (let x = 0; x < STORED_WIDTH; x += 1) {
      let total = 0
      for (let i = -radius; i <= radius; i += 1) {
        total += kernel[i + radius] * source[y * STORED_WIDTH + clamp(x + i, STORED_WIDTH)]
      }
      horizontal[y * STORED_WIDTH + x] = total
    }
  }

  for (let y = 0; y < STORED_HEIGHT; y += 1) {
    for (let x = 0; x < STORED_WIDTH; x += 1) {
      let total = 0
      for (let i = -radius; i <= radius; i += 1) {
        total +=
          kernel[i + radius] * horizontal[clamp(y + i, STORED_HEIGHT) * STORED_WIDTH + x]
      }
      out[y * STORED_WIDTH + x] = total
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
 * Rounded to whole numbers, because that is what a stored image holds.
 *
 * The rounding is not a detail. Measured in floating point a blurred photograph
 * read 0.07, and the same photograph through a real browser read 0.21: rounding
 * is itself a source of detail, the Laplacian multiplies it, and taking the
 * sharpest squares hunts out the squares where it dominates. A harness that
 * skips this step describes a photograph made of real numbers, which no camera
 * has ever produced.
 */
function rounded(plane: Plane): Plane {
  for (let i = 0; i < plane.luma.length; i += 1) {
    plane.luma[i] = Math.max(0, Math.min(255, Math.round(plane.luma[i])))
  }

  return plane
}

/**
 * The stored image, read at the size the app reads it at.
 *
 * This is `measureFocus` with the decoding taken out: it is handed the stored
 * JPEG, reduces it to `ANALYSIS_CEILING`, and measures that. Both roundings are
 * here because both happen — once when the stored image is written, once when
 * the analysis canvas hands back eight-bit pixels.
 */
function asAnalysed(stored: Float64Array): Plane {
  const kept = rounded({ luma: stored, width: STORED_WIDTH, height: STORED_HEIGHT })

  return rounded(shrink(kept, ANALYSIS_CEILING))
}

/**
 * A subject in focus with the rest of the frame thrown out of focus behind it.
 *
 * The background is blurred by 10px in the stored image — roughly 20px on the
 * camera's own frame, thoroughly out of focus and well past anything this
 * feature would call soft.
 */
function subjectAgainstBackground(random: () => number): Float64Array {
  const out = blur(texture(random), 10)
  const subject = texture(random)

  for (let y = Math.round(STORED_HEIGHT * 0.3); y < Math.round(STORED_HEIGHT * 0.75); y += 1) {
    for (let x = Math.round(STORED_WIDTH * 0.35); x < Math.round(STORED_WIDTH * 0.7); x += 1) {
      out[y * STORED_WIDTH + x] = subject[y * STORED_WIDTH + x]
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
  const out = new Float64Array(STORED_WIDTH * STORED_HEIGHT)
  const soft = octave(STORED_WIDTH, STORED_HEIGHT, Math.round(STORED_WIDTH / 3), random)

  for (let y = 0; y < STORED_HEIGHT; y += 1) {
    for (let x = 0; x < STORED_WIDTH; x += 1) {
      let value = 150 + 30 * soft[y * STORED_WIDTH + x]

      const dx = (x - STORED_WIDTH * 0.42) / (STORED_WIDTH * 0.22)
      const dy = (y - STORED_HEIGHT * 0.48) / (STORED_HEIGHT * 0.37)
      if (dx * dx + dy * dy < 1) value = 196 + 12 * soft[y * STORED_WIDTH + x]

      const inBar = (from: number, to: number) => x > from && x < to
      if (y > STORED_HEIGHT * 0.36 && y < STORED_HEIGHT * 0.44) {
        if (inBar(STORED_WIDTH * 0.27, STORED_WIDTH * 0.41)) value = 42
        if (inBar(STORED_WIDTH * 0.44, STORED_WIDTH * 0.58)) value = 42
      }

      if (y > STORED_HEIGHT * 0.84) value = 96 + 20 * soft[y * STORED_WIDTH + x]

      out[y * STORED_WIDTH + x] = value
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
function read(stored: Float64Array): number | null {
  const frame = asAnalysed(stored)
  return blurRatio(frame.luma, frame.width, frame.height)
}

/** The reading used only for ranking inside one burst. */
function readDetail(stored: Float64Array): number | null {
  const frame = asAnalysed(stored)
  return focusScore(frame.luma, frame.width, frame.height)
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
      const throughout = read(softened(seed, 10))

      expect(bokeh as number, `seed ${seed}`).toBeLessThan(throughout as number)
    }
  })

  it('offers a photograph the lens actually missed, whatever it is a photograph of', () => {
    // Ten pixels in the stored image, about twenty on the camera's own frame.
    // The old harness asserted this of a blur a third that size, which it could
    // only do because it measured a 400px frame: through the reduction the app
    // really performs, a six-pixel camera blur lands inside the in-focus band
    // and nothing can be claimed about it. See the gap named below.
    for (const seed of SEEDS) {
      for (const sigma of [10, 15]) {
        expect(read(softened(seed, sigma)) as number, `textured ${sigma}px, seed ${seed}`)
          .toBeGreaterThan(BLURRED_ENOUGH)
        expect(read(softenedFaces(seed, sigma)) as number, `faces ${sigma}px, seed ${seed}`)
          .toBeGreaterThan(BLURRED_ENOUGH)
      }
    }
  })

  it('cannot tell a mild softening from a frame that came out, and does not try', () => {
    // The gap the corrected reduction opens, asserted rather than hidden. A 3px
    // blur in the stored image — six on the camera's frame — reads 0.377 to
    // 0.424 across subjects and noise, and an in-focus frame reads 0.338 to
    // 0.381. Those bands touch, so no line separates them, and the line is
    // drawn above both: such a photograph goes unmentioned.
    //
    // The old harness asserted the opposite and passed, because at 400px the
    // same frames read further apart than they do at the size the app uses.
    for (const seed of SEEDS) {
      for (const frame of [softened(seed, 3), softenedFaces(seed, 3)]) {
        expect(read(frame) as number, `seed ${seed}`).toBeLessThan(BLURRED_ENOUGH)
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
      const blurredFaces = read(softenedFaces(seed, 8)) as number

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
      for (const sigma of [15, 25]) {
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

        for (const sigma of [10, 15, 25]) {
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
        read(new Float64Array(STORED_WIDTH * STORED_HEIGHT).fill(128)),
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
      const blurred = read(softenedFaces(seed, 12)) as number

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
      const soft = readDetail(softened(seed, 4)) as number

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
