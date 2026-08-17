import { type FormEvent, useState } from 'react'
import type { TextVisibility } from '../lib/photos'
import type { Story } from '../lib/stories'

type StoryNotesProps = {
  stories: Story[]
  onAdd: (input: { body: string; visibility: TextVisibility }) => Promise<void>
  onEdit: (id: string, patch: { body?: string; visibility?: TextVisibility }) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

const VISIBILITY_LABELS: Record<TextVisibility, string> = {
  hidden: 'Kept to yourself',
  visible: 'Shown with the album',
}

/**
 * Longer memories attached to one photograph. Kept apart from the caption
 * because they are a different act: a caption labels a picture, a story records
 * what the picture does not show.
 */
export function StoryNotes({ stories, onAdd, onEdit, onDelete }: StoryNotesProps) {
  const [body, setBody] = useState('')
  const [visibility, setVisibility] = useState<TextVisibility>('hidden')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)

  async function run(action: () => Promise<void>, fallback: string) {
    setPending(true)
    setError(null)

    try {
      await action()
      return true
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : fallback)
      return false
    } finally {
      setPending(false)
    }
  }

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!body.trim()) {
      setError('Write the story before saving it.')
      return
    }

    const added = await run(() => onAdd({ body, visibility }), 'Could not save the story.')

    if (added) {
      setBody('')
      setVisibility('hidden')
    }
  }

  async function handleEdit(id: string) {
    if (!draft.trim()) {
      setError('Write the story before saving it.')
      return
    }

    const edited = await run(() => onEdit(id, { body: draft }), 'Could not save the story.')
    if (edited) setEditingId(null)
  }

  return (
    <section className="story-notes" aria-labelledby="story-notes-title">
      <h4 id="story-notes-title">Story notes</h4>
      <p className="field-hint">
        The longer version: what happened, who was there, why it mattered. A photo can
        hold several.
      </p>

      {stories.length > 0 && (
        <ul className="story-list">
          {stories.map((story) => (
            <li className="story-item" key={story.id}>
              {editingId === story.id ? (
                <>
                  <label htmlFor={`story-${story.id}`}>
                    <span className="visually-hidden">Edit this story note</span>
                    <textarea
                      id={`story-${story.id}`}
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      maxLength={5000}
                      rows={4}
                    />
                  </label>
                  <div className="story-actions">
                    <button
                      className="primary-button"
                      type="button"
                      disabled={pending}
                      onClick={() => handleEdit(story.id)}
                    >
                      {/* Not "Save story": the add form below has a button by
                          that name, and while an edit is open both are on
                          screen at once. */}
                      {pending ? 'Saving…' : 'Save changes'}
                    </button>
                    <button
                      className="text-button"
                      type="button"
                      disabled={pending}
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="story-body">{story.body}</p>
                  <div className="story-actions">
                    <span className="visibility-badge">
                      {VISIBILITY_LABELS[story.visibility]}
                    </span>
                    <button
                      className="text-button"
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        run(
                          () =>
                            onEdit(story.id, {
                              visibility: story.visibility === 'hidden' ? 'visible' : 'hidden',
                            }),
                          'Could not change who can read this.',
                        )
                      }
                    >
                      {story.visibility === 'hidden' ? 'Show with album' : 'Keep to myself'}
                    </button>
                    <button
                      className="text-button"
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        setEditingId(story.id)
                        setDraft(story.body)
                        setError(null)
                      }}
                    >
                      Edit
                    </button>
                    {confirmingDelete === story.id ? (
                      <>
                        <button
                          className="danger-button"
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            run(() => onDelete(story.id), 'Could not delete the story.')
                          }
                        >
                          Delete for good
                        </button>
                        <button
                          className="text-button"
                          type="button"
                          disabled={pending}
                          onClick={() => setConfirmingDelete(null)}
                        >
                          Keep it
                        </button>
                      </>
                    ) : (
                      <button
                        className="text-button"
                        type="button"
                        disabled={pending}
                        onClick={() => setConfirmingDelete(story.id)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <form className="story-form" onSubmit={handleAdd}>
        <label htmlFor="new-story">
          <span>{stories.length > 0 ? 'Add another story' : 'Add a story'}</span>
          <textarea
            id="new-story"
            name="new-story"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={5000}
            rows={4}
            placeholder="We had been walking since six and nobody wanted to admit they were tired."
          />
        </label>

        <fieldset className="visibility-choice">
          <legend>Who is this for?</legend>
          <label className="visibility-option">
            <input
              type="radio"
              name="story-visibility"
              value="hidden"
              checked={visibility === 'hidden'}
              onChange={() => setVisibility('hidden')}
            />
            <span>Just me</span>
          </label>
          <label className="visibility-option">
            <input
              type="radio"
              name="story-visibility"
              value="visible"
              checked={visibility === 'visible'}
              onChange={() => setVisibility('visible')}
            />
            <span>Anyone I share the album with</span>
          </label>
        </fieldset>

        <button className="secondary-button" type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save story'}
        </button>
      </form>

      {error && (
        <p className="form-message error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
