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
 * Measured, and measured the way the photograph actually reaches us, which is
 * the part the first version got wrong. Focus is a property of the frame the
 * camera wrote, and everything downstream of that destroys it: the stored image
 * is a fifth of the camera's width and the thumbnail a fifth of that again, and
 * blur shrinks along with everything else. Calibrating against images that were
 * blurred at the size they are measured at describes a photograph nobody owns,
 * and produced a threshold that flagged nothing in a real album.
 *
 * `imaging/focusScore.test.ts` now blurs at camera size and then shrinks the
 * way the app shrinks, which gives:
 *
 * - in focus: 0.86 and above
 * - a sharp subject against a deliberately blurred background: 0.63 to 0.78
 * - very slightly soft: 0.60 to 0.68
 * - soft enough to be worth mentioning: 0.29 to 0.33
 * - plainly blurred: 0.14 and below
 * - fog, a blank wall: no reading at all
 *
 * The line sits at 0.4: below the softness nobody would complain about and the
 * blurred-background case, above everything genuinely soft. Nearer the quiet
 * end than the middle, because missing a soft photograph costs nothing while
 * calling a photograph she meant to keep blurred asks her to consider deleting
 * it.
 */
export const SOFT_FOCUS = 0.4

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
