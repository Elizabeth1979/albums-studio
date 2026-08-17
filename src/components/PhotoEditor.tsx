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
  onClose: () => void
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
  onClose,
}: PhotoEditorProps) {
  const [caption, setCaption] = useState(photo.caption ?? '')
  const [captionVisibility, setCaptionVisibility] = useState(photo.captionVisibility)
  const [alt, setAlt] = useState(photo.alt ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        {thumbnail && (
          <img
            className="photo-editor-preview"
            src={thumbnail}
            // Whatever the owner has written is already on screen beside this,
            // and until they write something there is nothing truthful to say.
            alt=""
          />
        )}

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
            <legend>Show this caption to people you share the album with?</legend>
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
    </section>
  )
}
