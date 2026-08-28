/**
 * Photographs that are out of focus on their own terms.
 *
 * Near-duplicate review already ranks focus, but only *within* a group: it can
 * say which of four frames of the same picture is sharpest, and says nothing at
 * all about a blurred photograph that was taken only once. That is the common
 * case — a phone fired while someone was still moving, and one soft frame sits
 * in the album with nothing to compare it to. This module is the other half:
 * a reading against an absolute floor rather than against a sibling.
 */
import type { Photo } from './photos'
import type { SimilarGroup } from './similarity'

/**
 * Below this Laplacian variance, a photograph is soft enough to be worth
 * mentioning.
 *
 * The measurement happens at a fixed 256px analysis size (see `imaging/process`),
 * which is what makes an absolute line meaningful at all: the same photograph
 * always produces the same reading regardless of what the camera wrote. Real
 * photographs carry texture everywhere — sand, foliage, hair, water — and in
 * focus they measure in the hundreds or thousands; a visibly blurred frame
 * collapses to single or low double digits.
 *
 * The line sits well under any plausible in-focus reading rather than at the
 * midpoint, because the two mistakes are not equal. Missing a soft photograph
 * costs nothing — the owner scrolls past it exactly as she does today. Calling
 * a deliberately soft photograph blurred asks her to consider deleting a
 * picture she meant to keep, and a suggestion that does that twice stops being
 * read. A low-contrast subject shot through fog can measure low while being
 * perfectly in focus, which is the other reason to stay conservative.
 */
export const SOFT_SHARPNESS = 60

/**
 * How far below the floor a photograph sits, spoken rather than numbered.
 *
 * Same reasoning as the near-duplicate readings: a variance of 7 means nothing
 * to the person looking at the picture, and the picture itself is the evidence.
 * The words only say how confident the measurement is.
 */
export type FocusReading = 'blurred' | 'soft'

export type SoftPhoto = {
  photo: Photo
  reading: FocusReading
}

/** True when this photograph reads as out of focus on its own. */
export function isSoft(photo: Photo): boolean {
  return photo.sharpness !== null && photo.sharpness < SOFT_SHARPNESS
}

function read(photo: Photo): FocusReading {
  // Half the floor and below is not a marginal call: nothing in the frame has
  // an edge. Between there and the floor, "soft" is the honest word.
  return (photo.sharpness as number) < SOFT_SHARPNESS / 2 ? 'blurred' : 'soft'
}

/**
 * The photographs worth asking about, in album order.
 *
 * Anything already sitting in a near-duplicate group is left out: it is on the
 * same screen a few centimetres above, with a comparison that says more than
 * this one does. Being asked about the same photograph twice, in two different
 * words, reads as two separate problems.
 */
export function findSoftPhotos(photos: Photo[], groups: SimilarGroup[] = []): SoftPhoto[] {
  const grouped = new Set(groups.flatMap((group) => group.photos).map((photo) => photo.id))

  return photos
    .filter((photo) => !grouped.has(photo.id) && isSoft(photo))
    .sort((one, two) => one.sortOrder - two.sortOrder)
    .map((photo) => ({ photo, reading: read(photo) }))
}
