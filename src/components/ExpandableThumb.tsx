import type { Photo } from '../lib/photos'
import type { LightboxPhoto } from './PhotoLightbox'

type ExpandableThumbProps = {
  photo: Photo
  /** Signed URLs, by storage path. */
  urls: Map<string, string>
  onOpen: () => void
  /** The image's own class, which sets its size where it sits. */
  imageClassName?: string
}

/**
 * A small picture of a photograph that opens it full size on a tap.
 *
 * Deciding which of three frames to keep, or what to write about one, comes
 * down to an eye half-closed or a face in the background, and neither is
 * visible in a tile a few centimetres wide.
 */
export function ExpandableThumb({
  photo,
  urls,
  onOpen,
  imageClassName = 'similar-thumb',
}: ExpandableThumbProps) {
  const url = photo.thumbnailPath ? urls.get(photo.thumbnailPath) : undefined
  if (!url) return <span className={`${imageClassName} empty`} aria-hidden="true" />

  return (
    <button
      className="thumb-open"
      type="button"
      aria-label={`View photo ${photo.sortOrder + 1} larger`}
      onClick={onOpen}
    >
      <img className={imageClassName} src={url} alt="" loading="lazy" />
    </button>
  )
}

/** The lightbox's view of a photograph, at the full stored size, with a line under it. */
export function toLightboxPhoto(
  photo: Photo,
  urls: Map<string, string>,
  caption: string | null,
): LightboxPhoto {
  return {
    id: photo.id,
    alt: photo.alt,
    caption,
    thumbnailUrl: photo.thumbnailPath ? (urls.get(photo.thumbnailPath) ?? null) : null,
    fullUrl: urls.get(photo.storagePath) ?? null,
    stories: [],
  }
}
