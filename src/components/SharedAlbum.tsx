import { useEffect, useState } from 'react'
import { FULL_SIZE, THUMBNAIL_SIZE } from '../lib/imaging/process'
import { type SharedAlbum as Shared, loadSharedAlbum } from '../lib/sharing'

type SharedAlbumProps = { token: string }

// Both layouts are three columns on a wide screen and two on a narrow one, so
// a tile occupies roughly a third of the page, then half of it.
const TILE_SIZES = '(max-width: 720px) 50vw, 33vw'

/**
 * An album as a visitor sees it.
 *
 * No account, no sign-in, and nothing on this screen that edits anything. What
 * arrives has already been filtered by the database and the Edge Function:
 * hidden captions and unpublished stories are not withheld here, they were
 * never sent. This component could not reveal them if it tried.
 */
export function SharedAlbum({ token }: SharedAlbumProps) {
  const [album, setAlbum] = useState<Shared | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    loadSharedAlbum(token)
      .then((loaded) => {
        if (active) setAlbum(loaded)
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : 'This album is not available.')
        }
      })

    return () => {
      active = false
    }
  }, [token])

  if (error) {
    return (
      <main className="shared-main">
        <div className="shared-empty">
          <p className="eyebrow">Albums Studio</p>
          <h1>{error}</h1>
          <p>
            The link may have been withdrawn, or the album may no longer be shared. Ask
            whoever sent it for a new link.
          </p>
        </div>
      </main>
    )
  }

  if (!album) {
    return (
      <main className="shared-main" aria-live="polite">
        <p className="library-status">Opening the album…</p>
      </main>
    )
  }

  return (
    <main className="shared-main">
      <header className="shared-heading">
        <p className="eyebrow">A shared album</p>
        <h1>{album.album.title}</h1>
        {album.album.description && <p className="shared-description">{album.album.description}</p>}
      </header>

      {album.photos.length === 0 ? (
        <p className="library-status">This album has no photographs yet.</p>
      ) : (
        <ul className={`shared-photos layout-${album.album.layout}`}>
          {album.photos.map((photo) => (
            <li className="shared-photo" key={photo.id}>
              {(photo.fullUrl ?? photo.thumbnailUrl) && (
                <img
                  // The full image is what a phone at full width actually needs;
                  // the thumbnail is offered alongside it so a small screen can
                  // take the cheap one. Falling back keeps an album readable if
                  // only one of the two could be signed.
                  src={photo.fullUrl ?? (photo.thumbnailUrl as string)}
                  srcSet={
                    photo.fullUrl && photo.thumbnailUrl
                      ? `${photo.thumbnailUrl} ${THUMBNAIL_SIZE}w, ${photo.fullUrl} ${FULL_SIZE}w`
                      : undefined
                  }
                  sizes={TILE_SIZES}
                  // The owner's own words when they wrote them. An empty alt is
                  // correct otherwise: it marks the image decorative rather than
                  // reading out something invented.
                  alt={photo.alt ?? ''}
                  loading="lazy"
                  decoding="async"
                />
              )}
              {photo.caption && <p className="shared-caption">{photo.caption}</p>}
              {photo.stories.map((story, index) => (
                <p className="shared-story" key={index}>
                  {story}
                </p>
              ))}
            </li>
          ))}
        </ul>
      )}

      <footer className="shared-footer">
        <p>Shared from Albums Studio.</p>
      </footer>
    </main>
  )
}
