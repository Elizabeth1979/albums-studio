import { DISPLAY_SIZE, FULL_SIZE, THUMBNAIL_SIZE } from './imaging/process'

/*
 * One rule for which copy of a photograph fills an album tile, shared by the
 * owner's grid and the visitor's view: both draw the same square tiles.
 */

// Three columns on a wide screen and two on a narrow one, so a tile occupies
// roughly a third of the album canvas, then half of it. The canvas stops at
// 78rem, so past that a tile stops growing; saying 33vw there made a wide
// retina screen fetch the 2000px image for a 26rem tile.
export const TILE_SIZES = '(max-width: 720px) 50vw, min(33vw, 26rem)'

/** A `srcset` from whichever copies are signed, smallest first. */
export function tileSrcSet(copies: {
  thumbnail?: string
  display?: string
  full?: string
}): string | undefined {
  const candidates = [
    [copies.thumbnail, THUMBNAIL_SIZE],
    [copies.display, DISPLAY_SIZE],
    [copies.full, FULL_SIZE],
  ] as const
  const offered = candidates.filter(([url]) => url).map(([url, size]) => `${url} ${size}w`)

  return offered.length > 1 ? offered.join(', ') : undefined
}
