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

      scores.push(variance(detail) / contrast)
    }
  }

  if (scores.length === 0) return null

  scores.sort((one, two) => two - one)
  const counted = Math.max(1, Math.round(scores.length * FOCUS_SHARE))

  let total = 0
  for (let index = 0; index < counted; index += 1) total += scores[index]

  return total / counted
}
