import type { Photo } from '../lib/photos'
import type { LightboxPhoto } from './PhotoLightbox'

type ReviewThumbProps = {
  photo: Photo
  /** Signed URLs, by storage path. */
  urls: Map<string, string>
  onOpen: () => void
}

/**
 * A tile in a cleanup review, which opens the photograph full size on a tap.
 *
 * Deciding which of three frames to keep comes down to an eye half-closed or a
 * face slightly soft, and neither is visible in a tile a few centimetres wide.
 */
export function ReviewThumb({ photo, urls, onOpen }: ReviewThumbProps) {
  const url = photo.thumbnailPath ? urls.get(photo.thumbnailPath) : undefined
  if (!url) return <span className="similar-thumb empty" aria-hidden="true" />

  return (
    <button
      className="similar-open"
      type="button"
      aria-label={`View photo ${photo.sortOrder + 1} larger`}
      onClick={onOpen}
    >
      <img className="similar-thumb" src={url} alt="" loading="lazy" />
    </button>
  )
}

/** The lightbox's view of a photograph under review, with the review's verdict as its caption. */
export function toLightboxPhoto(
  photo: Photo,
  urls: Map<string, string>,
  verdict: string,
): LightboxPhoto {
  return {
    id: photo.id,
    alt: photo.alt,
    caption: verdict,
    thumbnailUrl: photo.thumbnailPath ? (urls.get(photo.thumbnailPath) ?? null) : null,
    fullUrl: urls.get(photo.storagePath) ?? null,
    stories: [],
  }
}
