import { useState } from 'react'
import type { Photo } from '../lib/photos'
import type { SimilarGroup } from '../lib/similarity'

type SimilarPhotosProps = {
  groups: SimilarGroup[]
  /** Signed thumbnail URLs, by storage path. */
  thumbnails: Map<string, string>
  onRemove: (photos: Photo[]) => Promise<void>
}

/**
 * Near-duplicates, side by side, for the owner to decide about.
 *
 * Deliberately not a cleanup that runs itself. The grouping is arithmetic on a
 * perceptual hash and the suggestion is a focus measurement, and neither knows
 * which frame someone was smiling in. So nothing is preselected, the suggestion
 * is only ever a starting point, and removing anything takes two deliberate
 * actions.
 */
export function SimilarPhotos({ groups, thumbnails, onRemove }: SimilarPhotosProps) {
  const [marked, setMarked] = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (groups.length === 0) return null

  const chosen = groups.flatMap((group) => group.photos).filter((photo) => marked.has(photo.id))

  function toggle(photo: Photo) {
    setConfirming(false)
    setError(null)
    setMarked((current) => {
      const next = new Set(current)
      if (next.has(photo.id)) next.delete(photo.id)
      else next.add(photo.id)
      return next
    })
  }

  /** Marks everything in a group except the sharpest, as a starting point. */
  function markRest(group: SimilarGroup) {
    setConfirming(false)
    setError(null)
    setMarked((current) => {
      const next = new Set(current)
      for (const photo of group.photos) {
        if (photo.id !== group.suggested.id) next.add(photo.id)
      }
      return next
    })
  }

  async function handleRemove() {
    setBusy(true)
    setError(null)

    try {
      await onRemove(chosen)
      setMarked(new Set())
      setConfirming(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not remove those photos.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="similar" aria-labelledby="similar-title">
      <h2 id="similar-title">Similar photos</h2>
      <p className="layout-hint">
        {groups.length === 1
          ? 'One set of photographs looks like the same picture.'
          : `${groups.length} sets of photographs look like the same picture.`}{' '}
        Nothing is removed until you choose it.
      </p>

      {groups.map((group) => (
        <div className="similar-group" key={group.photos[0].id}>
          <div className="similar-group-heading">
            <h3>{group.photos.length} alike</h3>
            <button
              className="text-button"
              type="button"
              onClick={() => markRest(group)}
              disabled={busy}
            >
              Mark all but the sharpest
            </button>
          </div>

          <ul className="similar-row">
            {group.photos.map((photo) => {
              const url = photo.thumbnailPath ? thumbnails.get(photo.thumbnailPath) : undefined
              const isSuggested = photo.id === group.suggested.id

              return (
                <li className="similar-item" key={photo.id}>
                  <label className="similar-choice">
                    <input
                      type="checkbox"
                      checked={marked.has(photo.id)}
                      onChange={() => toggle(photo)}
                      disabled={busy}
                    />
                    <span className="visually-hidden">
                      Remove photo {photo.sortOrder + 1}
                    </span>
                  </label>

                  {url ? (
                    <img className="similar-thumb" src={url} alt="" loading="lazy" />
                  ) : (
                    <span className="similar-thumb empty" aria-hidden="true" />
                  )}

                  <p className="similar-meta">
                    {isSuggested && <span className="similar-badge">Sharpest</span>}
                    <span className="similar-sharpness">
                      {photo.sharpness === null
                        ? 'Not measured'
                        : `Sharpness ${Math.round(photo.sharpness)}`}
                    </span>
                  </p>
                </li>
              )
            })}
          </ul>
        </div>
      ))}

      {error && <p className="form-message error" role="alert">{error}</p>}

      {chosen.length > 0 &&
        (confirming ? (
          <div className="danger-actions">
            <button
              className="danger-button"
              type="button"
              disabled={busy}
              onClick={handleRemove}
            >
              {busy
                ? 'Removing…'
                : chosen.length === 1
                  ? 'Yes, remove 1 photo'
                  : `Yes, remove ${chosen.length} photos`}
            </button>
            <button
              className="text-button"
              type="button"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Keep them
            </button>
          </div>
        ) : (
          <button
            className="secondary-button"
            type="button"
            onClick={() => setConfirming(true)}
          >
            {chosen.length === 1 ? 'Remove 1 photo' : `Remove ${chosen.length} photos`}
          </button>
        ))}
    </section>
  )
}
