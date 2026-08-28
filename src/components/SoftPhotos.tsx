import { useState } from 'react'
import type { SoftPhoto } from '../lib/focus'
import type { Photo } from '../lib/photos'

type SoftPhotosProps = {
  soft: SoftPhoto[]
  /** Signed thumbnail URLs, by storage path. */
  thumbnails: Map<string, string>
  onRemove: (photos: Photo[]) => Promise<void>
}

/**
 * Photographs that are blurred on their own, offered for the owner to decide about.
 *
 * The near-duplicate review answers "which of these four is sharpest"; it has
 * nothing to say about the single soft frame that arrived with no sibling to be
 * compared against, which is how a plainly blurry photograph sat in an album
 * with the cleanup tools reporting nothing to do.
 *
 * Same posture as that review, for the same reason: a measurement does not know
 * that the blurred frame is the only photograph of someone who has since died,
 * or that the softness was the point. So nothing is preselected, the wording
 * offers rather than instructs, and removing anything takes two deliberate
 * actions.
 *
 * One wording, not a scale. The measurement separates "in focus" from "not"
 * cleanly and then flattens: past a certain blur it stops telling one degree
 * from the next, so grading these as "soft" and "very soft" would be inventing
 * a distinction the number cannot support.
 */
export function SoftPhotos({ soft, thumbnails, onRemove }: SoftPhotosProps) {
  const [marked, setMarked] = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (soft.length === 0) return null

  const chosen = soft.map((entry) => entry.photo).filter((photo) => marked.has(photo.id))

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
    <section className="similar soft" aria-labelledby="soft-title">
      <h2 id="soft-title">Photos that look out of focus</h2>
      <p className="album-note">
        {soft.length === 1
          ? 'One photograph measures as blurred.'
          : `${soft.length} photographs measure as blurred.`}{' '}
        Focus is measured automatically and it cannot tell a mistake from a
        choice, so these are only suggestions — tick the ones you do not want to
        keep, then remove them. Nothing goes until you say so.
      </p>

      <ul className="similar-row soft-row">
        {soft.map(({ photo }) => {
          const url = photo.thumbnailPath ? thumbnails.get(photo.thumbnailPath) : undefined
          const isMarked = marked.has(photo.id)

          return (
            <li className={`similar-item${isMarked ? ' marked' : ''}`} key={photo.id}>
              {url ? (
                <img className="similar-thumb" src={url} alt="" loading="lazy" />
              ) : (
                <span className="similar-thumb empty" aria-hidden="true" />
              )}

              <p className="similar-meta">
                <span className="similar-sharpness">Out of focus</span>
              </p>

              <label className="similar-choice">
                <input
                  type="checkbox"
                  checked={isMarked}
                  onChange={() => toggle(photo)}
                  disabled={busy}
                />
                <span>
                  Remove
                  <span className="visually-hidden"> photo {photo.sortOrder + 1}</span>
                </span>
              </label>
            </li>
          )
        })}
      </ul>

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
                  ? 'Yes, remove 1 blurred photo'
                  : `Yes, remove ${chosen.length} blurred photos`}
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
            {chosen.length === 1
              ? 'Remove 1 ticked photo'
              : `Remove ${chosen.length} ticked photos`}
          </button>
        ))}
    </section>
  )
}
