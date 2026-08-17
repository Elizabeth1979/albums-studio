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
