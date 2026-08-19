/**
 * Grouping photographs that are nearly the same picture.
 *
 * Everything here is arithmetic on signals the browser already computed at
 * upload time, so reviewing a batch of near-duplicates costs nothing and sends
 * nothing anywhere.
 */
import type { Photo } from './photos'

/**
 * How many of the 64 bits may differ before two photographs are treated as
 * separate pictures.
 *
 * The hash sets the bits above the median of the DCT, so exactly 32 of 64 are
 * always set — which means the distance between any two hashes is always even,
 * and this threshold really offers six steps rather than eleven. Ten is the
 * usual line for "the same picture, moments apart"; a real album of unrelated
 * photographs measured 24 apart at its closest.
 */
export const NEAR_DUPLICATE_DISTANCE = 10

/** The length of the hash the processor writes, in bits. */
const HASH_BITS = 64

export type SimilarGroup = {
  /** Photographs that belong together, in album order. */
  photos: Photo[]
  /** The one to keep, if nothing else is known: the sharpest of them. */
  suggested: Photo
  /** The widest gap inside the group, as a rough "how alike" reading. */
  spread: number
}

/** True when a value is a hash this module can actually compare. */
function isHash(value: string | null): value is string {
  return typeof value === 'string' && value.length === HASH_BITS && /^[01]+$/.test(value)
}

/**
 * How many bits differ between two hashes.
 *
 * Compared as the strings of ones and zeroes the database hands over. Sixty-four
 * bits does not fit in a JavaScript number, and turning them into a pair of
 * 32-bit halves buys nothing at this size.
 */
export function hammingDistance(a: string, b: string): number {
  if (!isHash(a) || !isHash(b)) return HASH_BITS

  let distance = 0
  for (let index = 0; index < HASH_BITS; index += 1) {
    if (a[index] !== b[index]) distance += 1
  }

  return distance
}

/**
 * Groups photographs that are within `distance` of one another.
 *
 * Grouping is transitive: a burst where each frame differs slightly from the
 * last should arrive as one run to choose from, not as a chain of overlapping
 * pairs the owner has to reconcile. That does mean a long enough burst can drift
 * beyond the threshold end to end, which is the intended trade — the owner is
 * comparing them side by side and deciding, not accepting an automatic verdict.
 */
export function groupSimilar(
  photos: Photo[],
  distance: number = NEAR_DUPLICATE_DISTANCE,
): SimilarGroup[] {
  const usable = photos.filter((photo) => isHash(photo.phash))
  const parent = usable.map((_, index) => index)

  function find(index: number): number {
    let root = index
    while (parent[root] !== root) root = parent[root]
    // Path compression, so a long burst does not walk the chain every time.
    for (let step = index; parent[step] !== root; ) {
      const next = parent[step]
      parent[step] = root
      step = next
    }
    return root
  }

  for (let a = 0; a < usable.length; a += 1) {
    for (let b = a + 1; b < usable.length; b += 1) {
      if (hammingDistance(usable[a].phash as string, usable[b].phash as string) <= distance) {
        parent[find(a)] = find(b)
      }
    }
  }

  const byRoot = new Map<number, Photo[]>()
  for (let index = 0; index < usable.length; index += 1) {
    const root = find(index)
    byRoot.set(root, [...(byRoot.get(root) ?? []), usable[index]])
  }

  return [...byRoot.values()]
    // A photograph on its own is not a decision to make.
    .filter((group) => group.length > 1)
    .map((group) => ({
      photos: group,
      suggested: sharpest(group),
      spread: widestGap(group),
    }))
    .sort((one, two) => one.photos[0].sortOrder - two.photos[0].sortOrder)
}

/**
 * The sharpest of a group, as a suggestion only.
 *
 * Laplacian variance is a decent proxy for focus and a poor one for whether a
 * photograph is any good, so this is offered as a starting point and never
 * acted on without the owner saying so. Ties keep album order, which makes the
 * suggestion stable rather than dependent on how the rows arrived.
 */
export function sharpest(photos: Photo[]): Photo {
  return photos.reduce((best, photo) =>
    (photo.sharpness ?? -1) > (best.sharpness ?? -1) ? photo : best,
  )
}

/** The largest distance between any two photographs in a group. */
function widestGap(photos: Photo[]): number {
  let widest = 0

  for (let a = 0; a < photos.length; a += 1) {
    for (let b = a + 1; b < photos.length; b += 1) {
      widest = Math.max(
        widest,
        hammingDistance(photos[a].phash as string, photos[b].phash as string),
      )
    }
  }

  return widest
}
