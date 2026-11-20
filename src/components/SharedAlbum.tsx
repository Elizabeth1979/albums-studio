import { useEffect, useState } from 'react'
import { TILE_SIZES, tileSrcSet } from '../lib/tiles'
import { type SharedAlbum as Shared, loadSharedAlbum, sharedOriginal } from '../lib/sharing'
import { PhotoLightbox } from './PhotoLightbox'
import { Slideshow } from './Slideshow'

type SharedAlbumProps = { token: string }

/**
 * An album as a visitor sees it.
 *
 * No account, no sign-in, and nothing on this screen that edits anything. What
 * arrives has already been filtered by the database and the Edge Function:
 * hidden captions and unpublished stories are not withheld here, they were
 * never sent. This component could not reveal them if it tried.
 */
/** Hands the visitor a file to keep, under the name the server gave it. */
function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  // After the browser has taken it; revoking at once can cancel the save.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/**
 * Downloads one photograph at full quality.
 *
 * Only offered where an original exists. The file arrives with the location
 * the camera recorded already removed, which the label says, because a visitor
 * passing a photograph on should know what it carries.
 */
function DownloadOriginal({ token, photoId, position }: { token: string; photoId: string; position: number }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setBusy(true)
    setError(null)
    try {
      const { blob, name } = await sharedOriginal(token, photoId)
      save(blob, name)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The download could not start.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button className="text-button shared-download" type="button" onClick={handleClick} disabled={busy}>
        {busy ? 'Preparing download…' : 'Download full quality'}
        <span className="visually-hidden"> of photograph {position}</span>
      </button>
      {error && (
        <p className="form-message error" role="alert">
          {error}
        </p>
      )}
    </>
  )
}

export function SharedAlbum({ token }: SharedAlbumProps) {
  const [album, setAlbum] = useState<Shared | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openPhoto, setOpenPhoto] = useState<number | null>(null)

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
        {album.album.story && (
          <div className="shared-story-text">
            {album.album.story
              .split(/\n\s*\n/)
              .map((paragraph) => paragraph.trim())
              .filter(Boolean)
              .map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
          </div>
        )}
        <Slideshow photos={album.photos} title={album.album.title} story={album.album.story} />
      </header>

      {album.photos.length === 0 ? (
        <p className="library-status">This album has no photographs yet.</p>
      ) : (
        <ul className="shared-photos">
          {album.photos.map((photo, index) => {
            const source = photo.displayUrl ?? photo.fullUrl ?? photo.thumbnailUrl
            const srcSet = tileSrcSet({
              thumbnail: photo.thumbnailUrl ?? undefined,
              display: photo.displayUrl ?? undefined,
              full: photo.fullUrl ?? undefined,
            })

            return (
              <li className="shared-photo" key={photo.id}>
                {source && (
                  <button
                    className="shared-photo-open"
                    type="button"
                    // The button takes its name from the alt text inside it, which
                    // keeps the description on the image where it belongs. A
                    // photograph with none still needs a name for the control.
                    aria-label={
                      photo.alt ? undefined : `Photograph ${index + 1} of ${album.photos.length}`
                    }
                    onClick={() => setOpenPhoto(index)}
                  >
                    <img
                      // Every copy that could be signed, so the browser takes the
                      // smallest that fills the tile — normally the 1080px display
                      // copy rather than the 2000px image.
                      src={source}
                      srcSet={srcSet}
                      sizes={srcSet ? TILE_SIZES : undefined}
                      // The owner's own words when they wrote them. An empty alt is
                      // correct otherwise: it marks the image decorative rather
                      // than reading out something invented.
                      alt={photo.alt ?? ''}
                      loading="lazy"
                      decoding="async"
                    />
                  </button>
                )}
                {photo.caption && <p className="shared-caption">{photo.caption}</p>}
                {photo.hasOriginal && (
                  <DownloadOriginal token={token} photoId={photo.id} position={index + 1} />
                )}
                {photo.stories.map((story, index) => (
                  <p className="shared-story" key={index}>
                    {story}
                  </p>
                ))}
              </li>
            )
          })}
        </ul>
      )}

      <footer className="shared-footer">
        <p>Shared from Albums Studio.</p>
      </footer>

      <PhotoLightbox
        photos={album.photos}
        index={openPhoto}
        onClose={() => setOpenPhoto(null)}
        onGoTo={setOpenPhoto}
      />
    </main>
  )
}
