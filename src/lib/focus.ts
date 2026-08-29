/**
 * Photographs that are out of focus on their own terms.
 *
 * Near-duplicate review already ranks focus, but only *within* a group: it can
 * say which of four frames of the same picture is sharpest, and says nothing at
 * all about a blurred photograph that was taken only once. That is the common
 * case — a phone fired while someone was still moving, and one soft frame sits
 * in the album with nothing to compare it to. This module is the other half.
 *
 * The reading it works from is `focusScore` in `imaging/sharpness`: how well the
 * best-focused part of the frame is focused, divided by that part's own
 * contrast. Both halves matter here. Judging the sharpest part rather than the
 * average is what lets a portrait with a deliberately blurred background pass,
 * and dividing by contrast is what stops a misty lake from being called a
 * mistake. Between them they make one number that means the same thing for a
 * landscape, a portrait and a close-up — which is what allows a single line to
 * be drawn at all.
 */
import type { Photo } from './photos'
import type { SimilarGroup } from './similarity'

/**
 * Below this reading, the sharpest part of the photograph is not sharp.
 *
 * Measured rather than guessed. Across scenes built to span the cases that
 * matter — textured landscapes, low-contrast fog, a portrait against a blurred
 * background, a small subject against a blurred background, and the same
 * scenes progressively blurred — everything in focus measured 0.72 and above
 * and everything blurred measured 0.17 and below. The line sits at 0.3: inside
 * that gap, and deliberately nearer the blurred end.
 *
 * Nearer the blurred end because the two mistakes are not equal. Missing a soft
 * photograph costs nothing — the owner scrolls past it exactly as she does
 * today. Calling a photograph she meant to keep blurred asks her to consider
 * deleting it, and a suggestion that does that twice stops being read.
 * `src/lib/focus.test.ts` holds the scenes; re-run it after changing anything
 * about how the reading is taken.
 */
export const SOFT_FOCUS = 0.3

export type SoftPhoto = {
  photo: Photo
  /** What the measurement said, kept so the interface can explain itself. */
  focus: number
}

/**
 * The photographs worth asking about, in album order.
 *
 * A photograph with no reading is left alone. That covers a thumbnail that
 * would not decode and a frame with too little contrast anywhere to judge —
 * fog, a blank wall, a photograph of the sky. Nothing can honestly be said
 * about those, so nothing is said.
 *
 * Anything already sitting in a near-duplicate group is left out too: it is on
 * the same screen a few centimetres above, with a comparison that says more
 * than this does. Being asked about the same photograph twice, in two different
 * words, reads as two separate problems.
 */
export function findSoftPhotos(
  photos: Photo[],
  readings: Map<string, number | null>,
  groups: SimilarGroup[] = [],
): SoftPhoto[] {
  const grouped = new Set(groups.flatMap((group) => group.photos).map((photo) => photo.id))

  return photos
    .filter((photo) => !grouped.has(photo.id))
    .flatMap((photo) => {
      const focus = readings.get(photo.id)

      return focus !== null && focus !== undefined && focus < SOFT_FOCUS
        ? [{ photo, focus }]
        : []
    })
    .sort((one, two) => one.photo.sortOrder - two.photo.sortOrder)
}
