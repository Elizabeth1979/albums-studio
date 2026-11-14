import { DISPLAY_SIZE, FULL_SIZE, THUMBNAIL_SIZE } from '../lib/imaging/process'
import type { Photo } from '../lib/photos'

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

type PhotoGalleryProps = {
  photos: Photo[]
  /** Signed URLs by storage path; absent while they are still being minted. */
  thumbnails: Map<string, string>
  /** How many story notes each photo carries, by photo id. */
  storyCounts: Map<string, number>
  coverPhotoId: string | null
  selectedId: string | null
  onSelect: (photoId: string) => void
  /**
   * What the focus check read for each photograph, by photo id, shown on the
   * tile itself.
   *
   * Temporary, and here because of how long this took without it. The album
   * printed its readings as a sorted list — 2.9, 3.0, 3.2, 3.3 — with no way to
   * tell which number belonged to which picture, so the one question that
   * settles where the line goes ("what does the blurred one read?") could not
   * be answered from the screen. It comes out with the rest of the tuning line.
   */
  focusNotes?: Map<string, string>
}

/**
 * What a screen reader announces for the button around a photograph.
 *
 * The position is always there because it is the one thing that distinguishes
 * two photographs with nothing written about them yet. Alt text is added when
 * the owner has supplied it, so a list of buttons reads as a list of pictures
 * rather than "photo 1, photo 2, photo 3".
 */
function tileLabel(photo: Photo, index: number, isCover: boolean): string {
  const position = `photo ${index + 1}`
  const named = photo.alt ? `Edit ${position}: ${photo.alt}` : `Edit ${position}`

  // The cover is marked with a badge for anyone who can see it. Saying so in the
  // name is how that reaches everyone else.
  return isCover ? `${named} (album cover)` : named
}

export function PhotoGallery({
  photos,
  thumbnails,
  storyCounts,
  coverPhotoId,
  selectedId,
  onSelect,
  focusNotes,
}: PhotoGalleryProps) {
  return (
    <ul className="photo-gallery">
      {photos.map((photo, index) => {
        const thumbnail = photo.thumbnailPath ? thumbnails.get(photo.thumbnailPath) : undefined
        const display = photo.displayPath ? thumbnails.get(photo.displayPath) : undefined
        const full = thumbnails.get(photo.storagePath)
        const source = display ?? full ?? thumbnail
        const srcSet = tileSrcSet({ thumbnail, display, full })
        const stories = storyCounts.get(photo.id) ?? 0
        const written = Boolean(photo.caption) || Boolean(photo.alt) || stories > 0
        const isCover = photo.id === coverPhotoId

        return (
          <li className="photo-tile" key={photo.id}>
            <button
              className={selectedId === photo.id ? 'photo-open selected' : 'photo-open'}
              type="button"
              aria-expanded={selectedId === photo.id}
              onClick={() => onSelect(photo.id)}
            >
              {source ? (
                <img
                  // A tile is around a third of a 78rem canvas, so on a retina
                  // screen it asks for close to 800 device pixels. Offering
                  // every copy lets the browser take the smallest that fills
                  // it — normally the 1080px display copy, not the 2000px one.
                  src={source}
                  srcSet={srcSet}
                  sizes={srcSet ? TILE_SIZES : undefined}
                  // The button carries the description; repeating it on the
                  // image would make a screen reader read the photo twice.
                  alt=""
                  width={photo.width ?? undefined}
                  height={photo.height ?? undefined}
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <span className="photo-placeholder" aria-hidden="true" />
              )}
              <span className="visually-hidden">{tileLabel(photo, index, isCover)}</span>
              {selectedId === photo.id && (
                <span className="photo-editing-mark" aria-hidden="true">
                  Editing
                </span>
              )}
              {isCover && (
                <span className="photo-cover-mark" aria-hidden="true" title="Album cover">
                  Cover
                </span>
              )}
              {focusNotes?.get(photo.id) && (
                <span className="photo-focus-mark" aria-hidden="true" title="Focus reading">
                  {focusNotes.get(photo.id)}
                </span>
              )}
              {written && (
                <span className="photo-written" aria-hidden="true" title="Has written context">
                  ✎
                </span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
