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
 * What came back from trying to judge one photograph.
 *
 * Three outcomes, not two, and the difference is the point. This used to return
 * null for both "nothing here to judge" and "could not read the picture at
 * all", and the album said nothing either way — which reads as "your
 * photographs are fine" when the truth may be that not one of them was ever
 * looked at. Silence is only honest when something was actually measured.
 */
export type FocusReading =
  | { kind: 'measured'; focus: number }
  /** Fog, a blank wall: real pixels, nothing in them to judge. */
  | { kind: 'unjudgeable' }
  /** The bytes could not be read or decoded. Nothing was measured. */
  | { kind: 'failed'; detail: string }

function describe(error: unknown): string {
  if (error instanceof Error) return error.message ? `${error.name}: ${error.message}` : error.name

  return String(error)
}

/**
 * Measures how well the best-focused part of an already-stored photograph is
 * focused, from the thumbnail the album has already downloaded.
 *
 * Measured at whatever size the thumbnail arrived at, and measured when the
 * album opens rather than kept in the database, both on purpose. Every
 * photograph uploaded before this existed would otherwise carry no reading, and
 * the albums that most need the advice are exactly the ones already full — so
 * the one design that helps nobody is the one that only measures new uploads.
 */
export async function measureFocus(source: Blob): Promise<FocusReading> {
  let bitmap: ImageBitmap

  try {
    bitmap = await createImageBitmap(source)
  } catch (error) {
    return { kind: 'failed', detail: describe(error) }
  }

  try {
    const size = fitWithin(bitmap.width, bitmap.height, ANALYSIS_CEILING)
    const canvas = new OffscreenCanvas(size.width, size.height)
    const context = canvas.getContext('2d')

    if (!context) return { kind: 'failed', detail: 'no 2D canvas' }

    context.drawImage(bitmap, 0, 0, size.width, size.height)
    const pixels = context.getImageData(0, 0, size.width, size.height)
    const focus = focusScore(toLuma(pixels.data), size.width, size.height)

    return focus === null ? { kind: 'unjudgeable' } : { kind: 'measured', focus }
  } catch (error) {
    return { kind: 'failed', detail: describe(error) }
  } finally {
    bitmap.close()
  }
}
