import { type FormEvent, useState } from 'react'
import type { Album } from '../lib/albums'
import {
  STORY_PHOTO_LIMIT,
  type StoryDraft,
  draftAlbumStory,
  settleDraft,
  spreadAcross,
} from '../lib/albumStory'
import { type Photo, listPhotos, signedUrls } from '../lib/photos'
import { joinDictated } from '../lib/dictation'
import { DictateButton } from './DictateButton'
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

/** The album's photographs to choose from, or why there are none to show. */
type Choice =
  | { kind: 'loading' }
  | { kind: 'ready'; photos: Photo[]; thumbnails: Map<string, string> }
  | { kind: 'unavailable' }

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
  // What just happened, said once: a story appearing on the page is silent otherwise.
  const [done, setDone] = useState('')
  const [choice, setChoice] = useState<Choice>({ kind: 'loading' })
  const [chosen, setChosen] = useState<Set<string>>(new Set())

  /**
   * Opens the form, and loads the photographs to choose from as it does: on
   * first use rather than on mount, so an album nobody drafts for costs nothing.
   * Twenty are chosen to start with, spread from the first photograph to the
   * last, which is also what the server would pick on its own.
   */
  async function openForm() {
    setStage({ kind: 'asking' })
    setChoice({ kind: 'loading' })
    try {
      const photos = await listPhotos(album.id)
      const paths = photos.flatMap((photo) => (photo.thumbnailPath ? [photo.thumbnailPath] : []))
      const urls = await signedUrls(paths)
      const thumbnails = new Map<string, string>()
      for (const photo of photos) {
        const url = photo.thumbnailPath ? urls.get(photo.thumbnailPath) : undefined
        if (url) thumbnails.set(photo.id, url)
      }
      setChoice({ kind: 'ready', photos, thumbnails })
      setChosen(new Set(spreadAcross(photos).map((photo) => photo.id)))
    } catch {
      // Drafting still works without the picker: the server spreads its own pick.
      setChoice({ kind: 'unavailable' })
      setChosen(new Set())
    }
  }

  function toggle(id: string) {
    setChosen((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else if (next.size < STORY_PHOTO_LIMIT) next.add(id)
      return next
    })
  }

  async function handleDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setDone('')
    setStage({ kind: 'drafting' })

    try {
      // In album order, whatever order they were ticked in.
      const photoIds =
        choice.kind === 'ready'
          ? choice.photos.filter((photo) => chosen.has(photo.id)).map((photo) => photo.id)
          : []
      const draft = await draftAlbumStory(album.id, notes, photoIds)
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
      setDone(text.trim() ? 'The story is on the album.' : 'The story was removed from the album.')
      setStage({ kind: 'idle' })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the story.')
    } finally {
      setSaving(false)
    }
  }

  async function discard(draft: StoryDraft) {
    setError(null)
    setDone('Draft discarded. The album is unchanged.')
    setStage({ kind: 'idle' })
    // Recorded, not deleted. A failure here costs nothing the owner can see.
    await settleDraft(draft.id, 'rejected').catch(() => {})
  }

  const status =
    stage.kind === 'drafting'
      ? 'Drafting the story from your photos and notes. This takes up to a minute.'
      : stage.kind === 'reviewing'
        ? `A draft is ready to edit. ${allowance ?? ''}`
        : stage.kind === 'idle'
          ? done
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
            <button className="secondary-button" type="button" onClick={() => void openForm()}>
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
          <DictateButton
            target="what the story should say"
            onWords={(words) => setNotes((current) => joinDictated(current, words).slice(0, 2000))}
            disabled={stage.kind === 'drafting'}
          />
          <fieldset className="story-photos" disabled={stage.kind === 'drafting'}>
            <legend>Photos for the story</legend>
            {choice.kind === 'loading' && <p className="field-hint">Loading your photos…</p>}
            {choice.kind === 'unavailable' && (
              <p className="field-hint">
                Your photos could not be shown here, so the draft will use {STORY_PHOTO_LIMIT} spread
                across the album.
              </p>
            )}
            {choice.kind === 'ready' && choice.photos.length === 0 && (
              <p className="field-hint">Add photos to the album first.</p>
            )}
            {choice.kind === 'ready' && choice.photos.length > 0 && (
              <>
                <p className="field-hint" aria-live="polite">
                  {chosen.size} of up to {STORY_PHOTO_LIMIT} chosen
                  {choice.photos.length > STORY_PHOTO_LIMIT
                    ? `, from ${choice.photos.length}. Spread across the album to start with.`
                    : '.'}
                </p>
                <div className="story-photo-actions">
                  <button className="text-button" type="button" onClick={() => setChosen(new Set())}>
                    Choose none
                  </button>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => setChosen(new Set(spreadAcross(choice.photos).map((photo) => photo.id)))}
                  >
                    {choice.photos.length > STORY_PHOTO_LIMIT ? 'Spread across the album' : 'Choose all'}
                  </button>
                </div>
                <ul className="story-photo-grid">
                  {choice.photos.map((photo, index) => {
                    const isChosen = chosen.has(photo.id)
                    const url = choice.thumbnails.get(photo.id)
                    return (
                      <li key={photo.id}>
                        <label className="story-photo">
                          <input
                            type="checkbox"
                            checked={isChosen}
                            disabled={!isChosen && chosen.size >= STORY_PHOTO_LIMIT}
                            onChange={() => toggle(photo.id)}
                          />
                          {url ? (
                            <img src={url} alt={photo.alt ?? `Photo ${index + 1}`} loading="lazy" />
                          ) : (
                            <span className="story-photo-missing">{photo.alt ?? `Photo ${index + 1}`}</span>
                          )}
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </fieldset>
          <p className="field-hint">
            The draft reads the photos you choose and everything you have written about them,
            including notes kept to yourself. It is only a draft: nothing appears on the album until
            you use it.
          </p>
          <div className="rename-actions">
            <button
              className="primary-button"
              type="submit"
              disabled={
                stage.kind === 'drafting' ||
                (choice.kind === 'ready' && (choice.photos.length === 0 || chosen.size === 0))
              }
            >
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
