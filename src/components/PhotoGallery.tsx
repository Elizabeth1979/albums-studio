import type { AlbumLayout } from '../lib/albums'
import type { Photo } from '../lib/photos'

type PhotoGalleryProps = {
  layout: AlbumLayout
  photos: Photo[]
  /** Signed URLs by storage path; absent while they are still being minted. */
  thumbnails: Map<string, string>
  /** How many story notes each photo carries, by photo id. */
  storyCounts: Map<string, number>
  coverPhotoId: string | null
  selectedId: string | null
  onSelect: (photoId: string) => void
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
  layout,
  photos,
  thumbnails,
  storyCounts,
  coverPhotoId,
  selectedId,
  onSelect,
}: PhotoGalleryProps) {
  return (
    <ul className={`photo-gallery layout-${layout}`}>
      {photos.map((photo, index) => {
        const source = photo.thumbnailPath ? thumbnails.get(photo.thumbnailPath) : undefined
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
                  src={source}
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
