import { type FormEvent, useState } from 'react'
import { type Photo, type TextVisibility } from '../lib/photos'
import type { Story } from '../lib/stories'
import { StoryNotes } from './StoryNotes'

type PhotoEditorProps = {
  photo: Photo
  position: number
  thumbnail: string | undefined
  stories: Story[]
  onSave: (patch: {
    caption?: string
    captionVisibility?: TextVisibility
    alt?: string
  }) => Promise<void>
  onAddStory: (input: { body: string; visibility: TextVisibility }) => Promise<void>
  onEditStory: (
    id: string,
    patch: { body?: string; visibility?: TextVisibility },
  ) => Promise<void>
  onDeleteStory: (id: string) => Promise<void>
  /** Whether this photograph is the one on the album's card in the library. */
  isCover: boolean
  onUseAsCover: () => Promise<void>
  /** Absent at the ends of the album, where there is nowhere to move. */
  onMoveEarlier: (() => Promise<void>) | null
  onMoveLater: (() => Promise<void>) | null
  onDelete: () => Promise<void>
  onClose: () => void
}

/**
 * A capture time, in the reader's own conventions.
 *
 * Formatted without a time zone on purpose. EXIF records wall-clock time with
 * no offset, so the hour written here is the hour the camera showed — applying
 * a zone would move a photograph taken at dawn into the previous night.
 */
function formatTakenAt(takenAt: string): string {
  const at = new Date(takenAt)
  if (Number.isNaN(at.getTime())) return takenAt

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(at)
}

export function PhotoEditor({
  photo,
  position,
  thumbnail,
  stories,
  onSave,
  onAddStory,
  onEditStory,
  onDeleteStory,
  isCover,
  onUseAsCover,
  onMoveEarlier,
  onMoveLater,
  onDelete,
  onClose,
}: PhotoEditorProps) {
  const [caption, setCaption] = useState(photo.caption ?? '')
  const [captionVisibility, setCaptionVisibility] = useState(photo.captionVisibility)
  const [alt, setAlt] = useState(photo.alt ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [settingCover, setSettingCover] = useState(false)
  const [coverError, setCoverError] = useState<string | null>(null)
  const [moving, setMoving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [placeError, setPlaceError] = useState<string | null>(null)

  async function move(action: () => Promise<void>) {
    setMoving(true)
    setPlaceError(null)

    try {
      await action()
    } catch (caughtError) {
      setPlaceError(
        caughtError instanceof Error ? caughtError.message : 'Could not move the photo.',
      )
    } finally {
      setMoving(false)
    }
  }

  async function handleUseAsCover() {
    setSettingCover(true)
    setCoverError(null)

    try {
      await onUseAsCover()
    } catch (caughtError) {
      // Unlike the cover chosen automatically for a new album, this one was
      // asked for. Failing quietly would leave the owner tapping a button that
      // appears to do nothing.
      setCoverError(
        caughtError instanceof Error ? caughtError.message : 'Could not set the cover.',
      )
    } finally {
      setSettingCover(false)
    }
  }

  // No effect resyncs these from the photo. Choosing a different photograph
  // remounts this component (AlbumPhotos keys it by photo id), so the initial
  // state above already follows the selection. An effect that also fired when
  // the photo changed would fire on every save too, because saving replaces the
  // photo — and it would clear the confirmation the owner is waiting to see.

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError(null)

    try {
      await onSave({ caption, captionVisibility, alt })
      setSaved(true)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="photo-editor" aria-labelledby="photo-editor-title">
      <div className="photo-editor-heading">
        <div>
          <p className="eyebrow">Photo {position}</p>
          <h3 id="photo-editor-title">What do you want to remember?</h3>
        </div>
        <button className="text-button" type="button" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="photo-editor-body">
        <div className="photo-editor-aside">
          {thumbnail && (
            <img
              className="photo-editor-preview"
              src={thumbnail}
              // Whatever the owner has written is already on screen beside this,
              // and until they write something there is nothing truthful to say.
              alt=""
            />
          )}

          {photo.takenAt && (
            <p className="photo-taken">Taken {formatTakenAt(photo.takenAt)}</p>
          )}

          {isCover ? (
            <p className="cover-state">
              <span className="visibility-badge">Album cover</span>
              <em>Shown on this album in your library.</em>
            </p>
          ) : (
            <button
              className="secondary-button use-as-cover"
              type="button"
              disabled={settingCover}
              onClick={handleUseAsCover}
            >
              {settingCover ? 'Setting…' : 'Use as album cover'}
            </button>
          )}

          {coverError && (
            <p className="form-message error" role="alert">
              {coverError}
            </p>
          )}

          {/* Buttons rather than dragging. A drag is awkward on a phone and
              genuinely hard to make work with a keyboard or a screen reader;
              two buttons work the same way for everyone. */}
          <div className="photo-place" role="group" aria-label="Position in the album">
            <button
              className="text-button"
              type="button"
              disabled={moving || !onMoveEarlier}
              onClick={() => onMoveEarlier && move(onMoveEarlier)}
            >
              ← Move earlier
            </button>
            <button
              className="text-button"
              type="button"
              disabled={moving || !onMoveLater}
              onClick={() => onMoveLater && move(onMoveLater)}
            >
              Move later →
            </button>
          </div>

          {placeError && (
            <p className="form-message error" role="alert">
              {placeError}
            </p>
          )}
        </div>

        <form className="photo-editor-form" onSubmit={handleSubmit}>
          <label htmlFor="photo-caption">
            <span>Caption</span>
            <textarea
              id="photo-caption"
              name="photo-caption"
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              maxLength={2000}
              rows={2}
              placeholder="Dinner on the last night"
            />
          </label>

          <fieldset className="visibility-choice">
            <legend>Who can see this caption?</legend>
            <label className="visibility-option">
              <input
                type="radio"
                name="caption-visibility"
                value="hidden"
                checked={captionVisibility === 'hidden'}
                onChange={() => setCaptionVisibility('hidden')}
              />
              <span>
                Keep it to myself
                <em>Still used to organise and search your album.</em>
              </span>
            </label>
            <label className="visibility-option">
              <input
                type="radio"
                name="caption-visibility"
                value="visible"
                checked={captionVisibility === 'visible'}
                onChange={() => setCaptionVisibility('visible')}
              />
              <span>
                Show it under the photo
                <em>Visitors to a shared album will read it.</em>
              </span>
            </label>
          </fieldset>

          <label htmlFor="photo-alt">
            <span>Alt text</span>
            <textarea
              id="photo-alt"
              name="photo-alt"
              value={alt}
              onChange={(event) => setAlt(event.target.value)}
              maxLength={1000}
              rows={2}
              placeholder="Two children on a jetty at sunset, feet in the water"
              aria-describedby="photo-alt-hint"
            />
          </label>
          <p className="field-hint" id="photo-alt-hint">
            Describes the picture for anyone using a screen reader. Say what is in it,
            not that it is a photo. Always shown to people who need it, whatever you
            chose for the caption.
          </p>

          <div className="photo-editor-actions">
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            {saved && !saving && (
              <p className="form-message success" role="status">
                Saved.
              </p>
            )}
          </div>

          {error && (
            <p className="form-message error" role="alert">
              {error}
            </p>
          )}
        </form>
      </div>

      <StoryNotes
        stories={stories}
        onAdd={onAddStory}
        onEdit={onEditStory}
        onDelete={onDeleteStory}
      />

      <section className="photo-danger" aria-labelledby="remove-photo-title">
        <h4 id="remove-photo-title">Remove this photo</h4>
        {confirmingDelete ? (
          <>
            <p className="field-hint">
              The photograph and everything written about it go for good. Nothing here is
              recoverable afterwards.
            </p>
            <div className="story-actions">
              <button
                className="danger-button"
                type="button"
                disabled={moving}
                onClick={() => move(onDelete)}
              >
                Yes, remove it
              </button>
              <button
                className="text-button"
                type="button"
                disabled={moving}
                onClick={() => setConfirmingDelete(false)}
              >
                Keep it
              </button>
            </div>
          </>
        ) : (
          <button
            className="secondary-button"
            type="button"
            onClick={() => setConfirmingDelete(true)}
          >
            Remove photo
          </button>
        )}
      </section>
    </section>
  )
}
