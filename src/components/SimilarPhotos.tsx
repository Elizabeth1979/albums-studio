import { useState } from 'react'
import type { Photo } from '../lib/photos'
import type { SimilarGroup } from '../lib/similarity'
import { type FrameFaces, facesCamera, followPeople, framesWithBlinks, isSmiling } from '../lib/blinks'
import type { EyeReading } from '../lib/imaging/eyes'
import { PhotoLightbox } from './PhotoLightbox'
import { ExpandableThumb, toLightboxPhoto } from './ExpandableThumb'
import { useReturnFocus } from './useReturnFocus'

type SimilarPhotosProps = {
  groups: SimilarGroup[]
  /** Signed thumbnail URLs, by storage path. */
  thumbnails: Map<string, string>
  /** Eyes read in each photograph, by photo id. Shown, never acted on yet. */
  eyes?: Map<string, EyeReading>
  onRemove: (photos: Photo[]) => Promise<void>
}

/** What a face's eyes say, in words, against the same person in the other frames. */
function eyesText(closed: boolean | null): string {
  if (closed === true) return 'Eyes closed?'
  if (closed === false) return 'Eyes open'
  return 'Eyes not compared'
}

/** The rest of what a face says, in words, leaving out what could not be read. */
function faceText(face: Parameters<typeof isSmiling>[0]): string[] {
  const smiling = isSmiling(face)
  const facing = facesCamera(face)

  return [
    ...(smiling === null ? [] : [smiling ? 'Smiling' : 'Not smiling']),
    ...(facing === null ? [] : [facing ? 'Facing the camera' : 'Turned away']),
  ]
}

/**
 * The faces of one group, person by person, frame against frame.
 *
 * Shown so the owner can see a blink rather than trust a model with it, and so
 * the model's numbers can be checked against real photographs before anything
 * acts on them. The number beside each face is the model's eyes-closed score,
 * 0 open to 1 shut, and is temporary in the same way as the focus readings.
 */
function GroupFaces({ group, eyes }: { group: SimilarGroup; eyes: Map<string, EyeReading> }) {
  const frames: FrameFaces[] = group.photos.flatMap((photo) => {
    const reading = eyes.get(photo.id)
    if (reading?.kind !== 'read' || !photo.width || !photo.height) return []

    return [{ photoId: photo.id, width: photo.width, height: photo.height, faces: reading.faces }]
  })
  const failed = group.photos
    .map((photo) => eyes.get(photo.id))
    .find((reading) => reading?.kind === 'unavailable')

  // Only people seen in more than one frame: a face with nothing to compare
  // against has nothing to say here.
  const people = followPeople(frames).filter((person) => person.appearances.length > 1)
  const blinked = framesWithBlinks(people)
  const number = new Map(group.photos.map((photo) => [photo.id, photo.sortOrder + 1]))

  if (people.length === 0 && !failed) return null

  return (
    <div className="similar-faces">
      <h4>Faces</h4>
      {failed?.kind === 'unavailable' && (
        <p className="field-hint">The eyes could not be read: {failed.detail}</p>
      )}
      {people.length > 0 && (
        <p className="field-hint">
          {blinked.size === 0
            ? 'Nobody looks to have blinked.'
            : `Someone may have blinked in photo ${[...blinked].map((id) => number.get(id)).join(' and ')}.`}{' '}
          Smiles and where each person faces are shown too. Blinks are judged against the same
          person in the other photos. This is new and still being checked, so it does not change
          anything yet.
        </p>
      )}
      {people.map((person, personIndex) => (
        <ul className="face-row" aria-label={`Person ${personIndex + 1}`} key={personIndex}>
          {person.appearances.map((one) => (
            <li className={`face-item${one.closed ? ' closed' : ''}`} key={one.photoId}>
              {one.face.closeUp ? (
                <img className="face-close-up" src={one.face.closeUp} alt="" />
              ) : (
                <span className="face-close-up empty" aria-hidden="true" />
              )}
              <span className="face-label face-eyes">
                Photo {number.get(one.photoId)}: {eyesText(one.closed)}
                {one.face.blink !== null && (
                  <span className="face-score"> {one.face.blink.toFixed(2)}</span>
                )}
              </span>
              {faceText(one.face).map((line) => (
                <span className="face-label" key={line}>
                  {line}
                </span>
              ))}
              {(one.face.smile !== null || one.face.turn !== null) && (
                <span className="face-score face-numbers">
                  {[
                    one.face.smile === null ? null : `smile ${one.face.smile.toFixed(2)}`,
                    one.face.turn === null
                      ? null
                      : `turned ${Math.round(Math.max(Math.abs(one.face.turn.sideways), Math.abs(one.face.turn.upDown)))}°`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              )}
            </li>
          ))}
        </ul>
      ))}
    </div>
  )
}

/**
 * Near-duplicates, side by side, for the owner to decide about.
 *
 * Deliberately not a cleanup that runs itself. The grouping is arithmetic on a
 * perceptual hash, which knows nothing of who was smiling or moving. So nothing
 * is preselected, nothing is ticked on the owner's behalf (a "tick all but the
 * sharpest" shortcut was removed at her request), and removing anything takes
 * two deliberate actions. Every tick box says "Remove" beside it rather than
 * sitting unlabelled on the picture.
 *
 * No frame is called the sharpest. It used to be, from a whole-frame measure
 * that in a real burst read the lawn and the paving rather than the children,
 * named a different frame on a phone and on a laptop, and put a child smeared
 * by movement above two frames where everyone came out: see
 * `docs/sessions/2026-11-18-sharpest-read-the-lawn.md`.
 */
export function SimilarPhotos({
  groups,
  thumbnails,
  eyes = new Map(),
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
    ? viewedGroup.photos.map((photo) => toLightboxPhoto(photo, thumbnails, null))
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
        Tap a photo to see it full size, tick the ones you do not want to keep, then remove
        them — nothing goes until you say so.
      </p>

      {groups.map((group, groupIndex) => (
        <div className="similar-group" key={group.photos[0].id}>
          <h3>{group.photos.length} of the same picture</h3>

          <ul className="similar-row">
            {group.photos.map((photo, photoIndex) => {
              const isMarked = marked.has(photo.id)

              return (
                <li className={`similar-item${isMarked ? ' marked' : ''}`} key={photo.id}>
                  <ExpandableThumb
                    photo={photo}
                    urls={thumbnails}
                    onOpen={() => setViewing({ group: groupIndex, index: photoIndex })}
                  />

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

          <GroupFaces group={group} eyes={eyes} />
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
