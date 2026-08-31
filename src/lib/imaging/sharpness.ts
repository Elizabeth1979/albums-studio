/**
 * Variance of the Laplacian: the standard cheap focus measure.
 *
 * The Laplacian responds to abrupt brightness changes, so a crisp photo full of
 * edges produces a wide spread of responses and a blurred one produces a narrow
 * spread near zero. Taking the variance turns that spread into a single number.
 *
 * The value is unbounded and only comparable between photos of similar size and
 * subject, which is why it is stored as a raw signal rather than a score. Phase
 * 7 turns signals like this into a "best of this burst" suggestion.
 */
export function laplacianVariance(
  luma: Float64Array,
  width: number,
  height: number,
): number {
  // A 3x3 kernel has no room to sit on the border.
  if (width < 3 || height < 3) return 0

  const responses: number[] = []

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x

      responses.push(
        luma[index - width] +
          luma[index + width] +
          luma[index - 1] +
          luma[index + 1] -
          4 * luma[index],
      )
    }
  }

  if (responses.length === 0) return 0

  let total = 0
  for (const response of responses) total += response
  const mean = total / responses.length

  let squared = 0
  for (const response of responses) squared += (response - mean) ** 2

  // The column is `real` with a `>= 0` check; variance cannot be negative, but
  // rounding keeps a -0 from ever reaching the database.
  return Math.max(0, squared / responses.length)
}

/**
 * How large a square of the photograph is judged at once, at the 256px analysis
 * size. Small enough that a face or a single subject fills one, large enough
 * that the reading is not noise.
 */
const FOCUS_BLOCK = 32

/** Squares overlap by half, so a subject is never split across four of them. */
const FOCUS_STRIDE = 16

/**
 * A square this flat carries no evidence either way.
 *
 * Below it there is nothing in the square to be in focus: blank sky, a wall, fog.
 * Such squares are left out rather than counted as blurred, which is what stops
 * a misty lake from being reported as a mistake.
 */
const MIN_CONTRAST = 9

/** The share of squares, sharpest first, the reading is taken from. */
const FOCUS_SHARE = 0.2

/**
 * The detail a perfectly smooth photograph still shows, because pixels are
 * whole numbers.
 *
 * Rounding to 8 bits is itself a source of noise, with a variance of 1/12, and
 * the Laplacian multiplies the variance of anything uncorrelated by the sum of
 * its squared weights — four ones and a minus four, so twenty. Every square
 * therefore carries about 20/12 of detail that is not detail.
 *
 * Left in, it lands hardest exactly where it does the most harm. A square with
 * little contrast divides that fixed amount by a small number, and taking the
 * sharpest squares then seeks those inflated readings out: a blurred photograph
 * measured 0.21 in the browser against 0.07 on the same pixels in floating
 * point. Subtracting it is what makes a reading taken on real 8-bit pixels
 * agree with one taken on the arithmetic.
 */
const QUANTISATION_DETAIL = 20 / 12

function variance(values: number[]): number {
  if (values.length === 0) return 0

  let total = 0
  for (const value of values) total += value
  const mean = total / values.length

  let squared = 0
  for (const value of values) squared += (value - mean) ** 2

  return squared / values.length
}

/**
 * How well the best-focused part of this photograph is focused.
 *
 * Two departures from the plain variance above, and both exist because that
 * number answers a question nobody asked. It measures the whole frame at once,
 * so a photograph is punished for having sky in it, and it is measured in
 * arbitrary units that grow with how much texture and contrast the scene
 * happened to carry — which means "blurred" and "smooth" produce the same low
 * number, and no single threshold can separate them.
 *
 * So: judge small squares rather than the frame, divide each square's detail by
 * its own contrast (making the reading independent of light, subject and
 * scene), and take the reading from the sharpest fifth of them. The last part
 * is what makes a portrait work — a face in focus against a deliberately
 * blurred background is a photograph that came out right, and averaging the
 * background into it says the opposite. It is also the rule a person applies:
 * a photograph is in focus when the thing worth looking at is.
 *
 * Returns null when no square in the frame carries enough contrast to judge —
 * fog, a blank wall, a photograph of the sky. Nothing can honestly be said
 * about those, so nothing is.
 */
export function focusScore(
  luma: Float64Array,
  width: number,
  height: number,
): number | null {
  if (width < FOCUS_BLOCK + 2 || height < FOCUS_BLOCK + 2) return null

  const scores: number[] = []

  for (let top = 1; top + FOCUS_BLOCK <= height - 1; top += FOCUS_STRIDE) {
    for (let left = 1; left + FOCUS_BLOCK <= width - 1; left += FOCUS_STRIDE) {
      const detail: number[] = []
      const brightness: number[] = []

      for (let y = top; y < top + FOCUS_BLOCK; y += 1) {
        for (let x = left; x < left + FOCUS_BLOCK; x += 1) {
          const index = y * width + x

          detail.push(
            luma[index - width] +
              luma[index + width] +
              luma[index - 1] +
              luma[index + 1] -
              4 * luma[index],
          )
          brightness.push(luma[index])
        }
      }

      const contrast = variance(brightness)
      if (contrast < MIN_CONTRAST) continue

      scores.push(Math.max(0, variance(detail) - QUANTISATION_DETAIL) / contrast)
    }
  }

  if (scores.length === 0) return null

  scores.sort((one, two) => two - one)
  const counted = Math.max(1, Math.round(scores.length * FOCUS_SHARE))

  let total = 0
  for (let index = 0; index < counted; index += 1) total += scores[index]

  return total / counted
}

/**
 * How many pixels a transition takes: the width of the picture's strong edges.
 *
 * This is what `focusScore` above could not do, and the difference matters
 * enough to justify a second measure. That one counts how much fine detail a
 * frame carries, and **how much detail a photograph carries is a property of
 * its subject rather than of its focus**: rippling water and wet sand are dense
 * with it, skin and sky are not. Measured on a real album, sharp seascapes read
 * five times higher than a sharp close-up of two faces, so the portrait looked
 * like the blurred one and was offered for deletion.
 *
 * Blur does something a subject cannot fake: it widens edges. A sharp
 * photograph crosses from one side of an edge to the other in a pixel or two
 * whether the edge is a face against the sky or a wave against sand; a blurred
 * one takes four, six, ten. Measuring that width is what the no-reference blur
 * literature settled on — Marziliano's edge-width metric, and CPBD and JNB
 * after it — and across scenes built from very different content it moves by
 * about one pixel, where the detail ratio moves five-fold.
 *
 * Returns null when the frame holds too few strong edges to judge: a photograph
 * of fog has no transitions to measure the width of.
 */
export function edgeWidth(luma: Float64Array, width: number, height: number): number | null {
  if (width < 8 || height < 8) return null

  // What counts as a strong edge is decided by the picture itself. A fixed
  // threshold would mean something different in a seascape and in a portrait,
  // which is the mistake the other measure makes.
  const magnitudes: number[] = []
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const across = Math.abs(luma[y * width + x + 1] - luma[y * width + x - 1]) / 2
      const down = Math.abs(luma[(y + 1) * width + x] - luma[(y - 1) * width + x]) / 2
      magnitudes.push(Math.max(across, down))
    }
  }

  magnitudes.sort((one, two) => one - two)

  // The floor is low on purpose. A badly blurred photograph has no steep
  // slopes left anywhere, and a floor of two grey levels excluded every
  // transition it had — so the blurriest frames found no edges at all and were
  // reported as impossible to judge, which is the opposite of the truth.
  const strong = Math.max(0.6, magnitudes[Math.floor(magnitudes.length * 0.95)])

  /**
   * How far a transition may run before the picture has simply moved on.
   *
   * Generous, because the whole point is to measure transitions that have been
   * smeared wide. At ten pixels a badly blurred frame ran off the end of every
   * edge and produced nothing.
   */
  const MAX_REACH = 16
  /** The slope still counts as part of this edge above this share of its peak. */
  const STILL_THIS_EDGE = 0.35

  const widths: number[] = []

  const scan = (horizontal: boolean) => {
    const outer = horizontal ? height : width
    const inner = horizontal ? width : height
    const at = (along: number, across: number) =>
      horizontal ? luma[across * width + along] : luma[along * width + across]
    const slope = (along: number, across: number) =>
      Math.abs(at(along + 1, across) - at(along - 1, across)) / 2

    for (let across = 1; across < outer - 1; across += 1) {
      for (let along = 2; along < inner - 2; along += 1) {
        const peak = slope(along, across)
        if (peak < strong) continue
        // Only the crest of the slope, so one edge is counted once.
        // Allowing a plateau: blur flattens the crest of a slope, and
        // demanding a strict maximum threw those away.
        if (peak < slope(along - 1, across) || peak < slope(along + 1, across)) continue

        const floor = peak * STILL_THIS_EDGE

        let start = along
        while (start > 2 && along - start < MAX_REACH && slope(start - 1, across) >= floor) {
          start -= 1
        }

        let end = along
        while (end < inner - 3 && end - along < MAX_REACH && slope(end + 1, across) >= floor) {
          end += 1
        }

        widths.push(end - start + 1)
      }
    }
  }

  scan(true)
  scan(false)

  if (widths.length < 30) {
    // Almost no edges. Two very different pictures look like this, and telling
    // them apart is what stops the blurriest photographs going unmentioned: fog
    // and a blank wall carry no tonal range either, while a badly blurred
    // photograph still has dark and light in it — it simply has no crisp
    // transition between them. A frame with real tone and no measurable edge is
    // as blurred as this can report.
    return strong > 1.5 ? MAX_REACH : null
  }

  // The crispest quarter of the edges, not the average of all of them.
  //
  // Same reasoning that protects a portrait against a deliberately blurred
  // background: most of that frame's edges belong to the background and are
  // wide on purpose, so an average calls the photograph blurred. What decides
  // whether a photograph came out is how crisp its crispest edges are. Averaged
  // over the whole frame, that portrait measured exactly on the line.
  widths.sort((one, two) => one - two)
  const counted = Math.max(1, Math.round(widths.length * 0.25))

  let total = 0
  for (let index = 0; index < counted; index += 1) total += widths[index]

  return total / counted
}
