import { useState } from 'react'
import type { Photo } from '../lib/photos'
import { compareSharpness, type SharpnessReading, type SimilarGroup } from '../lib/similarity'
import { PhotoLightbox } from './PhotoLightbox'
import { ReviewThumb, toLightboxPhoto } from './ReviewThumb'
import { useReturnFocus } from './useReturnFocus'

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
  close: 'Just as sharp',
  softer: 'Softer',
  blurrier: 'Blurry',
  unmeasured: 'Not measured',
}

/**
 * Near-duplicates, side by side, for the owner to decide about.
 *
 * Deliberately not a cleanup that runs itself. The grouping is arithmetic on a
 * perceptual hash and the suggestion is a focus measurement, and neither knows
 * which frame someone was smiling in. So nothing is preselected, nothing is
 * ticked on the owner's behalf (a "tick all but the sharpest" shortcut was
 * removed at her request), and removing anything takes two deliberate actions.
 *
 * The wording carries that: every tick box says "Remove" beside it rather than
 * sitting unlabelled on the picture, and the measurement is spoken as a
 * comparison ("just as sharp") instead of the raw variance, which read as a
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
  const removeOpener = useReturnFocus(confirming)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Previous and Next step through one group only: the point of opening a
  // frame here is to compare it with its siblings.
  const [viewing, setViewing] = useState<{ group: number; index: number } | null>(null)

  if (groups.length === 0) return null

  const viewedGroup = viewing ? groups[viewing.group] : undefined
  const viewedPhotos = viewedGroup
    ? viewedGroup.photos.map((photo) =>
        toLightboxPhoto(
          photo,
          thumbnails,
          READING_TEXT[compareSharpness(photo, viewedGroup, readings)],
        ),
      )
    : []

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

      {groups.map((group, groupIndex) => (
        <div className="similar-group" key={group.photos[0].id}>
          <h3>{group.photos.length} of the same picture</h3>

          <ul className="similar-row">
            {group.photos.map((photo, photoIndex) => {
              const reading = compareSharpness(photo, group, readings)
              const isMarked = marked.has(photo.id)

              return (
                <li className={`similar-item${isMarked ? ' marked' : ''}`} key={photo.id}>
                  <ReviewThumb
                    photo={photo}
                    urls={thumbnails}
                    onOpen={() => setViewing({ group: groupIndex, index: photoIndex })}
                  />

                  {/* Every frame wears its reading on the picture, as a short tag:
                      a line under each tile read as a caption. The sharpest is
                      the one in bold. */}
                  <span className={`similar-tag${reading === 'sharpest' ? ' best' : ''}`}>
                    {READING_TEXT[reading]}
                  </span>

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
            {/* Focus moves to the safe choice, since the button pressed has gone: see useConfirmation. */}
            <button
              className="text-button"
              type="button"
              disabled={busy}
              onClick={() => setConfirming(false)}
              autoFocus
            >
              Keep them
            </button>
          </div>
        ) : (
          <button
            className="secondary-button"
            type="button"
            onClick={() => setConfirming(true)}
            ref={removeOpener()}
          >
            {chosen.length === 1
              ? 'Remove 1 ticked photo'
              : `Remove ${chosen.length} ticked photos`}
          </button>
        ))}

      <PhotoLightbox
        photos={viewedPhotos}
        index={viewedGroup && viewing ? viewing.index : null}
        onClose={() => setViewing(null)}
        onGoTo={(index) => setViewing((current) => current && { ...current, index })}
      />
    </section>
  )
}
