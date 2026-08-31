import { toLuma } from './luma'
import { fitWithin } from './process'
import { edgeWidth, focusScore } from './sharpness'

/**
 * The size focus is judged at.
 *
 * Twice wrong before, in opposite directions, and the owner's own album settled
 * it. This first shrank the 400px thumbnail to 256px, which hides blur —
 * **every reduction of a photograph halves its blur along with everything
 * else**, so a frame that is plainly soft on a phone arrives at 256px looking
 * almost sharp. That was fixed by measuring the thumbnail at its own size. But
 * the thumbnail is itself a tenfold reduction of what the camera wrote, and at
 * that size the whole of a real album lands within a pixel of itself: eight
 * photographs, one of them plainly blurred, read 2.9, 3.0, 3.2, 3.3, 3.5, 3.6,
 * 3.7, 3.8. Nothing can be drawn across a spread like that.
 *
 * So the stored image is measured instead of the thumbnail — the browser is
 * already downloading it for the tiles, so this costs no extra round trip — and
 * at 800px rather than 400. On the same scenes that separation doubles: a
 * lightly softened frame reads 5.65 against a sharp 4.73, where at 400px it
 * read 5.22 against 4.73.
 *
 * 800 and not larger: the transition search reaches sixteen pixels, and past
 * that a badly blurred frame's edges run off the end of the search and it
 * measures *narrow* again — at 1200px an 8px blur read 4.65, below a sharp
 * frame. The measure and the size it is used at go together.
 */
const ANALYSIS_CEILING = 800

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
  | {
      kind: 'measured'
      /**
       * How many pixels a transition takes. Higher is blurrier, and it means
       * roughly the same thing whatever the photograph is of, which is what
       * the blur advice needs.
       */
      edgeWidth: number
      /**
       * How much fine detail the frame carries, relative to its contrast.
       * Depends heavily on the subject, so it is worthless for comparing a
       * portrait against a seascape — and good for ranking the frames of one
       * burst, where the subject is held still.
       */
      texture: number | null
    }
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
 * focused, from the stored image the album has already downloaded.
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
    const luma = toLuma(pixels.data)

    const width = edgeWidth(luma, size.width, size.height)

    // No strong edges anywhere is not a verdict: a photograph of fog has no
    // transitions whose width could be measured.
    return width === null
      ? { kind: 'unjudgeable' }
      : { kind: 'measured', edgeWidth: width, texture: focusScore(luma, size.width, size.height) }
  } catch (error) {
    return { kind: 'failed', detail: describe(error) }
  } finally {
    bitmap.close()
  }
}
