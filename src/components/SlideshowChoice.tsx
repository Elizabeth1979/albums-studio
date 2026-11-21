import { useState } from 'react'
import type { Photo } from '../lib/photos'

type SlideshowChoiceProps = {
  photos: Photo[]
  /** Signed URLs, by storage path. */
  thumbnails: Map<string, string>
  /** Puts these photographs into the slideshow or leaves them out. Throws on failure. */
  onChange: (ids: string[], inSlideshow: boolean) => Promise<void>
}

/**
 * Which photographs the album's slideshow plays.
 *
 * Folded away by default: most albums play everything, and a second full grid
 * of the album would push everything after it a long way down. Below the
 * photographs, where the album's other settings sit, so the first screen on a
 * phone still starts with the pictures.
 *
 * Tick boxes rather than tapping the pictures: a box says what it does, reads
 * the same to a screen reader, and cannot be mistaken for opening the photo.
 */
export function SlideshowChoice({ photos, thumbnails, onChange }: SlideshowChoiceProps) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // The pictures are drawn only once it is opened: most owners never open it,
  // and an album of hundreds should not fetch every thumbnail twice.
  const [open, setOpen] = useState(false)

  const playing = photos.filter((photo) => photo.inSlideshow).length

  async function change(ids: string[], inSlideshow: boolean) {
    setError(null)
    setBusy(true)
    try {
      await onChange(ids, inSlideshow)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That choice could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  const ids = (inSlideshow: boolean) =>
    photos.filter((photo) => photo.inSlideshow !== inSlideshow).map((photo) => photo.id)

  return (
    <section className="similar slideshow-choice" aria-labelledby="slideshow-choice-title">
      <h2 id="slideshow-choice-title">Slideshow</h2>
      <details onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary>
          Choose which photos play ({playing} of {photos.length})
        </summary>

        <p className="album-note">
          A photo you leave out stays in the album; it just does not play. People you share the
          album with see the same slideshow.
          {playing === 0 && ' Nothing will play until at least one photo is ticked.'}
        </p>

        <div className="slideshow-choice-actions">
          <button
            className="text-button"
            type="button"
            disabled={busy || playing === photos.length}
            onClick={() => change(ids(true), true)}
          >
            Play all
          </button>
          <button
            className="text-button"
            type="button"
            disabled={busy || playing === 0}
            onClick={() => change(ids(false), false)}
          >
            Leave all out
          </button>
        </div>

        {open && (
          <ul className="slideshow-choice-grid">
            {photos.map((photo, index) => {
              const url = photo.thumbnailPath ? thumbnails.get(photo.thumbnailPath) : undefined

              return (
                <li
                  className={`similar-item${photo.inSlideshow ? '' : ' left-out'}`}
                  key={photo.id}
                >
                  {url ? (
                    <img className="similar-thumb" src={url} alt="" loading="lazy" />
                  ) : (
                    <span className="similar-thumb empty" aria-hidden="true" />
                  )}
                  <label className="similar-choice">
                    <input
                      type="checkbox"
                      checked={photo.inSlideshow}
                      disabled={busy}
                      onChange={(event) => change([photo.id], event.target.checked)}
                    />
                    <span>
                      Plays{' '}
                      <span className="visually-hidden">
                        photo {index + 1}
                        {photo.alt ? `: ${photo.alt}` : ''}
                      </span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
      </details>

      {error && (
        <p className="form-message error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
