import type { AlbumLayout } from '../lib/albums'
import type { Photo } from '../lib/photos'

type PhotoGalleryProps = {
  layout: AlbumLayout
  photos: Photo[]
  /** Signed URLs by storage path; absent while they are still being minted. */
  thumbnails: Map<string, string>
}

export function PhotoGallery({ layout, photos, thumbnails }: PhotoGalleryProps) {
  return (
    <ul className={`photo-gallery layout-${layout}`}>
      {photos.map((photo) => {
        const source = photo.thumbnailPath ? thumbnails.get(photo.thumbnailPath) : undefined

        return (
          <li className="photo-tile" key={photo.id}>
            {source ? (
              <img
                src={source}
                // Alt text is Phase 4's subject. Until an owner has written any,
                // an empty alt is correct: it marks the image as decorative to a
                // screen reader rather than reading out a filename that carries
                // no meaning.
                alt={photo.alt ?? ''}
                width={photo.width ?? undefined}
                height={photo.height ?? undefined}
                loading="lazy"
                decoding="async"
              />
            ) : (
              <span className="photo-placeholder" aria-hidden="true" />
            )}
          </li>
        )
      })}
    </ul>
  )
}
