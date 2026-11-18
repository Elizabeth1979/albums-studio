import { type FormEvent, useState } from 'react'
import type { Album } from '../lib/albums'
import { type StoryDraft, draftAlbumStory, settleDraft } from '../lib/albumStory'
import { LiveStatus } from './LiveStatus'

type AlbumStoryProps = {
  album: Album
  /** Saves the story on the album; the draft id when it began as one. */
  onChangeStory: (story: string, draftId: string | null) => Promise<void>
}

type Stage =
  | { kind: 'idle' }
  | { kind: 'asking' }
  | { kind: 'drafting' }
  | { kind: 'reviewing'; draft: StoryDraft; text: string }
  | { kind: 'editing'; text: string }

/** Paragraphs as the owner wrote them, one per blank line. */
function paragraphs(text: string): string[] {
  return text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean)
}

/**
 * The story at the top of an album: drafted by AI from the photographs and
 * everything the owner has written, edited by the owner, and only then used.
 *
 * Draft-first, always. The AI's words land in an editable box, never on the
 * album; "Use this story" is the only way onto the page, and a draft that is set
 * aside is recorded as such rather than deleted, so every story stays
 * traceable to what produced it.
 */
export function AlbumStory({ album, onChangeStory }: AlbumStoryProps) {
  const [stage, setStage] = useState<Stage>({ kind: 'idle' })
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [allowance, setAllowance] = useState<string | null>(null)

  async function handleDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setStage({ kind: 'drafting' })

    try {
      const draft = await draftAlbumStory(album.id, notes)
      setAllowance(`${draft.used} of ${draft.limit} story drafts used this month.`)
      setStage({ kind: 'reviewing', draft, text: draft.body })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The story could not be drafted.')
      setStage({ kind: 'asking' })
    }
  }

  async function save(text: string, draftId: string | null, outcome: StoryDraft | null) {
    setSaving(true)
    setError(null)

    try {
      await onChangeStory(text, draftId)
      if (outcome) await settleDraft(outcome.id, 'accepted')
      setStage({ kind: 'idle' })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the story.')
    } finally {
      setSaving(false)
    }
  }

  async function discard(draft: StoryDraft) {
    setError(null)
    setStage({ kind: 'idle' })
    // Recorded, not deleted. A failure here costs nothing the owner can see.
    await settleDraft(draft.id, 'rejected').catch(() => {})
  }

  const status =
    stage.kind === 'drafting'
      ? 'Drafting the story from your photos and notes. This takes up to a minute.'
      : stage.kind === 'reviewing'
        ? `A draft is ready to edit. ${allowance ?? ''}`
        : ''

  return (
    <section className="album-story" aria-labelledby="story-title">
      <h2 id="story-title">Story</h2>
      <LiveStatus>{status}</LiveStatus>

      {stage.kind === 'idle' && (
        <>
          {album.story ? (
            <div className="album-story-text">
              {paragraphs(album.story).map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          ) : (
            <p className="album-note">
              No story yet. A few paragraphs at the top of the album, drafted from your
              photos and what you have written about them, for you to edit.
            </p>
          )}
          <div className="album-story-actions">
            <button className="secondary-button" type="button" onClick={() => setStage({ kind: 'asking' })}>
              {album.story ? 'Draft a new story with AI' : 'Draft the story with AI'}
            </button>
            {album.story && (
              <button
                className="text-button"
                type="button"
                onClick={() => setStage({ kind: 'editing', text: album.story ?? '' })}
              >
                Edit story
              </button>
            )}
          </div>
        </>
      )}

      {(stage.kind === 'asking' || stage.kind === 'drafting') && (
        <form className="rename-form" onSubmit={handleDraft}>
          <label htmlFor="story-notes">
            <span>Anything the story should say? (optional)</span>
            <textarea
              id="story-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="Our first trip with the kids. The rain on day two was the best part."
              disabled={stage.kind === 'drafting'}
            />
          </label>
          <p className="field-hint">
            The draft uses up to 20 photos and everything you have written about them, including
            notes kept to yourself. It is only a draft: nothing appears on the album until you
            use it.
          </p>
          <div className="rename-actions">
            <button className="primary-button" type="submit" disabled={stage.kind === 'drafting'}>
              {stage.kind === 'drafting' ? 'Drafting…' : 'Draft the story'}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setStage({ kind: 'idle' })}
              disabled={stage.kind === 'drafting'}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {stage.kind === 'reviewing' && (
        <form
          className="rename-form"
          onSubmit={(event) => {
            event.preventDefault()
            void save(stage.text, stage.draft.id, stage.draft)
          }}
        >
          <label htmlFor="story-draft">
            <span>Draft — edit it as you like</span>
            <textarea
              id="story-draft"
              value={stage.text}
              onChange={(event) => setStage({ ...stage, text: event.target.value })}
              rows={10}
              maxLength={20000}
              autoFocus
            />
          </label>
          <div className="rename-actions">
            <button className="primary-button" type="submit" disabled={saving || !stage.text.trim()}>
              {saving ? 'Saving…' : 'Use this story'}
            </button>
            <button className="secondary-button" type="button" onClick={() => discard(stage.draft)} disabled={saving}>
              Discard draft
            </button>
          </div>
        </form>
      )}

      {stage.kind === 'editing' && (
        <form
          className="rename-form"
          onSubmit={(event) => {
            event.preventDefault()
            void save(stage.text, album.storyDraftId, null)
          }}
        >
          <label htmlFor="story-edit">
            <span>Edit the story</span>
            <textarea
              id="story-edit"
              value={stage.text}
              onChange={(event) => setStage({ kind: 'editing', text: event.target.value })}
              rows={10}
              maxLength={20000}
              autoFocus
            />
          </label>
          <div className="rename-actions">
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save story'}
            </button>
            <button className="secondary-button" type="button" onClick={() => setStage({ kind: 'idle' })} disabled={saving}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && (
        <p className="form-message error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
