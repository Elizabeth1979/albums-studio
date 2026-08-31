import { FULL_SIZE, THUMBNAIL_SIZE } from '../lib/imaging/process'
import type { Photo } from '../lib/photos'

// Three columns on a wide screen and two on a narrow one, so a tile occupies
// roughly a third of the album canvas, then half of it.
const TILE_SIZES = '(max-width: 720px) 50vw, 33vw'

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
        const full = thumbnails.get(photo.storagePath)
        const source = full ?? thumbnail
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
                  // screen it asks for close to 800 device pixels. The 400px
                  // thumbnail alone was being stretched to twice its size, and
                  // an album of photographs rendered visibly soft. Offering the
                  // stored image alongside it lets the browser take whichever
                  // one the tile actually needs.
                  src={source}
                  srcSet={
                    full && thumbnail
                      ? `${thumbnail} ${THUMBNAIL_SIZE}w, ${full} ${FULL_SIZE}w`
                      : undefined
                  }
                  sizes={full && thumbnail ? TILE_SIZES : undefined}
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
