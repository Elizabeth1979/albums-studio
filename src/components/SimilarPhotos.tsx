import { useState } from 'react'
import type { Photo } from '../lib/photos'
import { compareSharpness, type SharpnessReading, type SimilarGroup } from '../lib/similarity'

type SimilarPhotosProps = {
  groups: SimilarGroup[]
  /** Signed thumbnail URLs, by storage path. */
  thumbnails: Map<string, string>
  /**
   * Detail readings measured from the thumbnails, by photo id.
   *
   * Used only to rank within a group, where every frame is the same picture and
   * the reading therefore says something about focus rather than about subject.
   */
  readings?: Map<string, number>
  onRemove: (photos: Photo[]) => Promise<void>
}

/** What each focus reading says out loud. */
const READING_TEXT: Record<SharpnessReading, string> = {
  sharpest: 'Sharpest',
  close: 'Nearly as sharp',
  softer: 'A little softer',
  blurrier: 'Noticeably softer',
  unmeasured: 'Focus not measured',
}

/**
 * Near-duplicates, side by side, for the owner to decide about.
 *
 * Deliberately not a cleanup that runs itself. The grouping is arithmetic on a
 * perceptual hash and the suggestion is a focus measurement, and neither knows
 * which frame someone was smiling in. So nothing is preselected, the suggestion
 * is only ever a starting point, and removing anything takes two deliberate
 * actions.
 *
 * The wording carries that: every tick box says "Remove" beside it rather than
 * sitting unlabelled on the picture, and the measurement is spoken as a
 * comparison ("nearly as sharp") instead of the raw variance, which read as a
 * score nobody could act on.
 */
export function SimilarPhotos({
  groups,
  thumbnails,
  readings = new Map(),
  onRemove,
}: SimilarPhotosProps) {
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

  /** Ticks everything in a group except the sharpest, as a starting point. */
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
      <h2 id="similar-title">Photos that look the same</h2>
      <p className="album-note">
        {groups.length === 1
          ? 'One set of photographs looks like the same picture taken more than once.'
          : `${groups.length} sets of photographs look like the same picture taken more than once.`}{' '}
        Tick the ones you do not want to keep, then remove them — nothing goes until you say
        so. Sharpness is measured automatically and only compares how well each frame is in
        focus, so the last word is yours.
      </p>

      {groups.map((group) => (
        <div className="similar-group" key={group.photos[0].id}>
          <div className="similar-group-heading">
            <h3>{group.photos.length} of the same picture</h3>
            <button
              className="text-button similar-shortcut"
              type="button"
              onClick={() => markRest(group)}
              disabled={busy}
            >
              Tick all but the sharpest
            </button>
          </div>

          <ul className="similar-row">
            {group.photos.map((photo) => {
              const url = photo.thumbnailPath ? thumbnails.get(photo.thumbnailPath) : undefined
              const reading = compareSharpness(photo, group, readings)
              const isMarked = marked.has(photo.id)

              return (
                <li className={`similar-item${isMarked ? ' marked' : ''}`} key={photo.id}>
                  {url ? (
                    <img className="similar-thumb" src={url} alt="" loading="lazy" />
                  ) : (
                    <span className="similar-thumb empty" aria-hidden="true" />
                  )}

                  <p className="similar-meta">
                    <span
                      className={reading === 'sharpest' ? 'similar-badge' : 'similar-sharpness'}
                    >
                      {READING_TEXT[reading]}
                    </span>
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
            {chosen.length === 1
              ? 'Remove 1 ticked photo'
              : `Remove ${chosen.length} ticked photos`}
          </button>
        ))}
    </section>
  )
}
