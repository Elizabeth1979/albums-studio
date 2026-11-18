import { useState } from 'react'
import type { Photo } from '../lib/photos'
import type { SimilarGroup } from '../lib/similarity'
import { type Appearance, type FrameFaces, facesCamera, followPeople, framesWithBlinks, isSmiling } from '../lib/blinks'
import { type BodyAppearance, type FrameBodies, contains, followBodies, framesWithBlur } from '../lib/bodies'
import type { BodyReading } from '../lib/imaging/bodies'
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
  /** People found whole in each photograph, with their blur. Shown, never acted on yet. */
  bodies?: Map<string, BodyReading>
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

/** One person in one frame: their face if one was found, their whole body if one was. */
type Sighting = { photoId: string; face?: Appearance; body?: BodyAppearance }

/** What a person's sharpness says, against the same person in the other frames. */
function sharpnessText(blurred: boolean | null): string {
  if (blurred === true) return 'Blurred'
  if (blurred === false) return 'Sharp'
  return 'Sharpness not compared'
}

/**
 * Each person in one group, frame against frame, with whatever could be read.
 *
 * People are followed whole first, because a body is found where a small or
 * smeared face is not, and a face is joined to the body it sits inside. A face
 * the body detector missed still gets its own row. Each person's frames are
 * compared only with that person's other frames — a blink, or blur, means
 * something only against the same child a second earlier.
 *
 * Shown so the owner can see a blink or a smear rather than trust a model with
 * it, and so the numbers can be checked against real photographs before
 * anything acts on them. The number beside each reading is the model's own:
 * eyes-closed 0 open to 1 shut, blur 0 crisp to 1 smeared.
 */
function GroupPeople({
  group,
  eyes,
  bodies,
}: {
  group: SimilarGroup
  eyes: Map<string, EyeReading>
  bodies: Map<string, BodyReading>
}) {
  const sized = group.photos.filter((photo) => photo.width && photo.height)
  const faceFrames: FrameFaces[] = sized.flatMap((photo) => {
    const reading = eyes.get(photo.id)
    if (reading?.kind !== 'read') return []

    return [{ photoId: photo.id, width: photo.width!, height: photo.height!, faces: reading.faces }]
  })
  const bodyFrames: FrameBodies[] = sized.flatMap((photo) => {
    const reading = bodies.get(photo.id)
    if (reading?.kind !== 'read') return []

    return [{ photoId: photo.id, width: photo.width!, height: photo.height!, bodies: reading.bodies }]
  })
  const failures = group.photos.flatMap((photo) => {
    const eye = eyes.get(photo.id)
    const body = bodies.get(photo.id)

    return [
      ...(eye?.kind === 'unavailable' ? [`The eyes could not be read: ${eye.detail}`] : []),
      ...(body?.kind === 'unavailable' ? [`People could not be found: ${body.detail}`] : []),
    ]
  })

  const facePeople = followPeople(faceFrames)
  const tracks = followBodies(bodyFrames)
  const joined = new Set<Appearance>()
  const faces = facePeople.flatMap((person) => person.appearances)

  const fromBodies: Sighting[][] = tracks.map((track) =>
    track.appearances.map((body) => {
      const face = faces.find(
        (one) => one.photoId === body.photoId && !joined.has(one) && contains(body.body, one.face),
      )
      if (face) joined.add(face)

      return { photoId: body.photoId, body, face }
    }),
  )
  const fromFaces: Sighting[][] = facePeople.map((person) =>
    person.appearances.filter((one) => !joined.has(one)).map((face) => ({ photoId: face.photoId, face })),
  )

  // Only people seen in more than one frame: with nothing to compare against,
  // a person has nothing to say here.
  const order = new Map(group.photos.map((photo, index) => [photo.id, index]))
  const people = [...fromBodies, ...fromFaces]
    .filter((sightings) => sightings.length > 1)
    .map((sightings) => [...sightings].sort((one, two) => (order.get(one.photoId) ?? 0) - (order.get(two.photoId) ?? 0)))
  const blinked = framesWithBlinks(facePeople)
  const blurred = framesWithBlur(tracks)
  const number = new Map(group.photos.map((photo) => [photo.id, photo.sortOrder + 1]))
  const photosIn = (ids: Set<string>) => [...ids].map((id) => number.get(id)).join(' and ')
  const unique = [...new Set(failures)]

  if (people.length === 0 && unique.length === 0) return null

  return (
    <div className="similar-faces">
      <h4>People</h4>
      {unique.map((line) => (
        <p className="field-hint" key={line}>
          {line}
        </p>
      ))}
      {people.length > 0 && (
        <p className="field-hint">
          {blinked.size > 0 && `Someone may have blinked in photo ${photosIn(blinked)}. `}
          {blurred.size > 0 && `Someone looks blurred in photo ${photosIn(blurred)}. `}
          {blinked.size === 0 && blurred.size === 0 && 'Nobody looks to have blinked or blurred. '}
          Each person is judged against themselves in the other photos. This is new and still
          being checked, so it does not change anything yet.
        </p>
      )}
      {people.map((sightings, personIndex) => (
        <ul className="face-row" aria-label={`Person ${personIndex + 1}`} key={personIndex}>
          {sightings.map(({ photoId, face, body }) => {
            const faceCloseUp = face?.face.closeUp ?? null
            const closeUp = faceCloseUp ?? body?.body.closeUp ?? null
            const flagged = face?.closed === true || body?.blurred === true

            return (
              <li className={`face-item${flagged ? ' closed' : ''}`} key={photoId}>
                {closeUp ? (
                  <img className={`face-close-up${faceCloseUp ? '' : ' body'}`} src={closeUp} alt="" />
                ) : (
                  <span className="face-close-up empty" aria-hidden="true" />
                )}
                <span className="face-label face-eyes">
                  Photo {number.get(photoId)}
                  {face && (
                    <>
                      : {eyesText(face.closed)}
                      {face.face.blink !== null && (
                        <span className="face-score"> {face.face.blink.toFixed(2)}</span>
                      )}
                    </>
                  )}
                </span>
                {body && (
                  <span className={`face-label${body.blurred ? ' face-eyes' : ''}`}>
                    {sharpnessText(body.blurred)}
                    {body.body.blur !== null && (
                      <span className="face-score"> {body.body.blur.toFixed(2)}</span>
                    )}
                  </span>
                )}
                {face &&
                  faceText(face.face).map((line) => (
                    <span className="face-label" key={line}>
                      {line}
                    </span>
                  ))}
                {face && (face.face.smile !== null || face.face.turn !== null) && (
                  <span className="face-score face-numbers">
                    {[
                      face.face.smile === null ? null : `smile ${face.face.smile.toFixed(2)}`,
                      face.face.turn === null
                        ? null
                        : `turned ${Math.round(Math.max(Math.abs(face.face.turn.sideways), Math.abs(face.face.turn.upDown)))}°`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                )}
              </li>
            )
          })}
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
  bodies = new Map(),
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

          <GroupPeople group={group} eyes={eyes} bodies={bodies} />
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
