import { toLuma } from './luma'
import { fitWithin } from './process'
import { blurRatio } from './reblur'
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
 * at 800px rather than 400.
 *
 * **Exported because the calibration harness must reduce to exactly this
 * number.** It did not for two rounds: the size moved here in #53 and the
 * harness went on building 400px frames, so the threshold, the denoise width
 * and the re-blur span were every one of them fitted at a size this code had
 * stopped using. The same frame reads 0.390 at 400px and 0.458 at 800px — the
 * re-blur span is a fixed count of pixels, so halving the frame doubles it
 * relative to the picture — and nothing failed, because no test ever called
 * this function. A constant that decides what a measurement means belongs in
 * one place, and the tests must read it from here rather than restate it.
 */
export const ANALYSIS_CEILING = 800

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
       * How much of the picture's detail survives being blurred again, between
       * 0 and 1, higher being blurrier. **This is what the advice acts on.**
       *
       * It is the only reading here that does not depend on what the photograph
       * is of, because it compares the frame against itself rather than against
       * a number: sharp texture reads 0.358 and sharp faces 0.363, while blur
       * moves either of them to 0.77.
       */
      blur: number | null
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
 * Measured at `ANALYSIS_CEILING`, and measured when the album opens rather than
 * kept in the database, both on purpose. Every
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
      : {
          kind: 'measured',
          edgeWidth: width,
          blur: blurRatio(luma, size.width, size.height),
          texture: focusScore(luma, size.width, size.height),
        }
  } catch (error) {
    return { kind: 'failed', detail: describe(error) }
  } finally {
    bitmap.close()
  }
}
