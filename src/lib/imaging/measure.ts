import { toLuma } from './luma'
import { fitWithin } from './process'
import { focusScore } from './sharpness'

/** Focus is judged at this size, matching what upload-time measurement uses. */
const ANALYSIS_SIZE = 256

/**
 * Measures how well the best-focused part of an already-stored photograph is
 * focused, from the thumbnail the album has just drawn.
 *
 * Measured here rather than kept in the database on purpose. Every photograph
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
      const size = fitWithin(bitmap.width, bitmap.height, ANALYSIS_SIZE)
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
