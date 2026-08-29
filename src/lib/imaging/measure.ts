import { toLuma } from './luma'
import { fitWithin } from './process'
import { focusScore } from './sharpness'

/**
 * A ceiling on the size focus is judged at, not a target.
 *
 * The thumbnail is 400px, so in practice it is measured exactly as it arrived.
 * That "exactly" is the whole point, and it was got wrong the first time: this
 * shrank the thumbnail to 256px first, and **shrinking a photograph destroys
 * the evidence of blur**. A camera blurs a frame thousands of pixels wide; every
 * halving of the size halves the blur along with it, so a photograph that is
 * plainly soft at full size arrives at 256px looking almost sharp. Measured
 * there, a genuinely soft frame read 0.65 against 1.23 for a sharp one — the
 * two are barely told apart, and nothing was ever flagged. Measured at 400px
 * the same pair reads 0.33 against 0.98.
 *
 * The ceiling exists only so an unexpectedly large image cannot make this
 * expensive; `fitWithin` never enlarges, so a smaller thumbnail is left alone.
 */
const ANALYSIS_CEILING = 512

/**
 * Measures how well the best-focused part of an already-stored photograph is
 * focused, from the thumbnail the album has just drawn.
 *
 * Measured at whatever size the thumbnail arrived at, and measured here rather
 * than kept in the database, both on purpose. Every photograph
 * uploaded before this existed would otherwise carry no reading, and the
 * albums that most need the advice are exactly the ones already full — so the
 * one design that helps nobody is the one that only measures new uploads. The
 * thumbnail is already signed and already fetched to be drawn, so the reading
 * costs a decode and some arithmetic and reaches every photograph equally.
 *
 * Returns null when the frame carries too little contrast to judge, or when the
 * bytes cannot be read at all. Both mean the same thing to the owner: nothing
 * worth saying about this one.
 */
export async function measureFocus(url: string): Promise<number | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null

    const bitmap = await createImageBitmap(await response.blob())

    try {
      const size = fitWithin(bitmap.width, bitmap.height, ANALYSIS_CEILING)
      const canvas = new OffscreenCanvas(size.width, size.height)
      const context = canvas.getContext('2d')
      if (!context) return null

      context.drawImage(bitmap, 0, 0, size.width, size.height)
      const pixels = context.getImageData(0, 0, size.width, size.height)

      return focusScore(toLuma(pixels.data), size.width, size.height)
    } finally {
      bitmap.close()
    }
  } catch {
    // A thumbnail that will not decode is a display problem, not a focus
    // verdict. The album already shows its own placeholder for that.
    return null
  }
}
