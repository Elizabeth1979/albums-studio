/**
 * Perceived brightness per pixel. Both the perceptual hash and the sharpness
 * score work on brightness alone, so colour is discarded once, here, rather
 * than twice in two slightly different ways.
 *
 * Coefficients are Rec. 601 luma, which is what image tooling conventionally
 * uses for this kind of grey conversion.
 */
export function toLuma(pixels: Uint8ClampedArray): Float64Array {
  const luma = new Float64Array(pixels.length / 4)

  for (let index = 0; index < luma.length; index += 1) {
    const offset = index * 4

    luma[index] =
      0.299 * pixels[offset] + 0.587 * pixels[offset + 1] + 0.114 * pixels[offset + 2]
  }

  return luma
}

/**
 * Box-samples a luma plane down to `size` x `size`. Averaging every source
 * pixel that falls in a cell, rather than picking one, keeps fine detail from
 * turning into hash noise.
 */
export function downsampleLuma(
  luma: Float64Array,
  width: number,
  height: number,
  size: number,
): Float64Array {
  const out = new Float64Array(size * size)

  for (let row = 0; row < size; row += 1) {
    const top = Math.floor((row * height) / size)
    const bottom = Math.max(top + 1, Math.floor(((row + 1) * height) / size))

    for (let column = 0; column < size; column += 1) {
      const left = Math.floor((column * width) / size)
      const right = Math.max(left + 1, Math.floor(((column + 1) * width) / size))

      let total = 0
      let counted = 0

      for (let y = top; y < bottom && y < height; y += 1) {
        for (let x = left; x < right && x < width; x += 1) {
          total += luma[y * width + x]
          counted += 1
        }
      }

      out[row * size + column] = counted > 0 ? total / counted : 0
    }
  }

  return out
}
