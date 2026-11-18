/**
 * Which photographs a story draft looks at.
 *
 * Shared by the `story-draft` Edge Function and the album page, so the number
 * the owner is told and the number the server reads are one constant, and the
 * photographs chosen for her by default are the ones the server would choose.
 * Plain TypeScript with no imports, so Deno and the browser can both use it.
 */

/** The most photographs one draft looks at. About 1,150 tokens each, measured. */
export const STORY_PHOTO_LIMIT = 20

/**
 * Up to `limit` items spread evenly from the first to the last, in order.
 *
 * Taking the first twenty of a two-hundred-photo album wrote a story about its
 * first afternoon. Spreading them covers the whole of it, first and last
 * included. An album that fits is returned whole.
 */
export function spreadAcross<T>(items: readonly T[], limit = STORY_PHOTO_LIMIT): T[] {
  if (limit <= 0) return []
  if (items.length <= limit) return [...items]
  if (limit === 1) return [items[0]]

  const step = (items.length - 1) / (limit - 1)
  return Array.from({ length: limit }, (_, index) => items[Math.round(index * step)])
}
