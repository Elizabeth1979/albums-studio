import { type FormEvent, useCallback, useRef, useState } from 'react'
import { ALT_DRAFTS_PER_MONTH, type AltDraft, draftAlt, settleDraft } from '../lib/altDraft'
import { type Photo, type TextVisibility } from '../lib/photos'
import type { Story } from '../lib/stories'
import { ExpandableThumb, toLightboxPhoto } from './ExpandableThumb'
import { LiveStatus } from './LiveStatus'
import { PhotoLightbox } from './PhotoLightbox'
import { StoryNotes } from './StoryNotes'
import { useConfirmation } from './useConfirmation'
import { useReturnFocus } from './useReturnFocus'

type PhotoEditorProps = {
  photo: Photo
  position: number
  /** Signed URLs, by storage path. */
  urls: Map<string, string>
  stories: Story[]
  onSave: (patch: {
    caption?: string
    captionVisibility?: TextVisibility
    alt?: string
    /** The suggestion the owner chose to use, if she did: decides who wrote the alt text. */
    altDraft?: string
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
  /**
   * Starts the download of the file exactly as it was chosen. Null when there is
   * no original to download, which the editor says rather than hiding.
   */
  onDownloadOriginal: (() => Promise<void>) | null
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
  urls,
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
  onDownloadOriginal,
  onClose,
}: PhotoEditorProps) {
  const [caption, setCaption] = useState(photo.caption ?? '')
  const [captionVisibility, setCaptionVisibility] = useState(photo.captionVisibility)
  const [alt, setAlt] = useState(photo.alt ?? '')
  const altField = useRef<HTMLTextAreaElement>(null)
  // A suggestion waiting for a decision, and the one she chose to use, which
  // stays a draft until she saves.
  const [suggestion, setSuggestion] = useState<AltDraft | null>(null)
  const [usedDraft, setUsedDraft] = useState<AltDraft | null>(null)
  const [suggesting, setSuggesting] = useState(false)
  const [suggestError, setSuggestError] = useState<string | null>(null)
  const [allowance, setAllowance] = useState<{ used: number; limit: number } | null>(null)
  // Stable, so it runs when the suggestion appears and not on every keystroke after.
  const focusOnArrival = useCallback((panel: HTMLElement | null) => panel?.focus(), [])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [settingCover, setSettingCover] = useState(false)
  const [coverError, setCoverError] = useState<string | null>(null)
  // Set when the owner presses "Use as album cover", spent when the note that
  // replaces the button appears. Focus moves at that moment rather than after a
  // timer, which would race the album page marking this photo as the cover.
  const coverJustSet = useRef(false)
  const landOnCoverNote = useCallback((note: HTMLParagraphElement | null) => {
    if (note && coverJustSet.current) {
      coverJustSet.current = false
      note.focus()
    }
  }, [])
  const [moving, setMoving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const confirmation = useConfirmation()
  const removeOpener = useReturnFocus(confirmingDelete)
  const [placeError, setPlaceError] = useState<string | null>(null)
  const [viewing, setViewing] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  async function handleDownload(download: () => Promise<void>) {
    setDownloading(true)
    setDownloadError(null)

    try {
      await download()
    } catch (caughtError) {
      setDownloadError(
        caughtError instanceof Error ? caughtError.message : 'Could not start the download.',
      )
    } finally {
      setDownloading(false)
    }
  }

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

    // The button pressed is replaced by the note saying this is the cover.
    // Focus goes there, so a screen reader reads the result instead of falling
    // silent with focus lost to the page.
    coverJustSet.current = true

    try {
      await onUseAsCover()
    } catch (caughtError) {
      coverJustSet.current = false
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

    // Alt text is sent only when it changed, so saving a caption never touches
    // who wrote the description already there.
    const altChanged = alt.trim() !== (photo.alt ?? '')

    try {
      await onSave({
        caption,
        captionVisibility,
        ...(altChanged ? { alt } : {}),
        ...(altChanged && usedDraft ? { altDraft: usedDraft.body } : {}),
      })
      setSaved(true)
      if (altChanged && usedDraft && alt.trim()) {
        const accepted = usedDraft
        setUsedDraft(null)
        // Bookkeeping only: her words are saved either way. A draft left
        // unmarked loses its trace back to the save, not the description.
        settleDraft(accepted.id, 'accepted').catch(() => {})
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSuggest() {
    setSuggesting(true)
    setSuggestError(null)
    setSaved(false)

    try {
      const draft = await draftAlt(photo.id)
      setSuggestion(draft)
      setAllowance({ used: draft.used, limit: draft.limit })
    } catch (caughtError) {
      setSuggestError(
        caughtError instanceof Error ? caughtError.message : 'The photograph could not be described.',
      )
    } finally {
      setSuggesting(false)
    }
  }

  function handleUseSuggestion() {
    if (!suggestion) return
    setAlt(suggestion.body)
    setUsedDraft(suggestion)
    setSuggestion(null)
    setSaved(false)
    // Into the box, where it is read and changed like anything typed.
    altField.current?.focus()
  }

  function handleDiscardSuggestion() {
    if (!suggestion) return
    const discarded = suggestion
    setSuggestion(null)
    // Set aside, never deleted. Nothing she can see depends on it.
    settleDraft(discarded.id, 'rejected').catch(() => {})
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
          {/* The image inside has no alt: whatever the owner has written is
              already on screen beside it, and until they write something there
              is nothing truthful to say. */}
          <ExpandableThumb
            photo={photo}
            urls={urls}
            onOpen={() => setViewing(true)}
            imageClassName="photo-editor-preview"
          />

          {photo.takenAt && (
            <p className="photo-taken">Taken {formatTakenAt(photo.takenAt)}</p>
          )}

          {onDownloadOriginal ? (
            <button
              className="text-button download-original"
              type="button"
              onClick={() => handleDownload(onDownloadOriginal)}
              disabled={downloading}
            >
              {downloading ? 'Preparing download…' : 'Download full quality'}
            </button>
          ) : (
            // Said rather than hidden: an absent button reads as "not offered
            // here", when the truth is that this photograph has no original.
            <p className="field-hint">
              Full quality is not available for this photo. Only a 2000-pixel copy was kept.
            </p>
          )}
          {downloadError && (
            <p className="form-message error" role="alert">
              {downloadError}
            </p>
          )}

          {isCover ? (
            <p className="cover-state" ref={landOnCoverNote} tabIndex={-1}>
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
              ref={altField}
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

          <div className="alt-suggest">
            <button
              className="secondary-button"
              type="button"
              onClick={handleSuggest}
              disabled={suggesting}
            >
              {suggesting
                ? 'Describing…'
                : alt.trim()
                  ? 'Suggest a different description'
                  : 'Suggest a description'}
            </button>
            <span className="field-hint">
              Uses AI. Up to {ALT_DRAFTS_PER_MONTH} a month. Only text visitors can already see is
              sent with the photo.
            </span>
          </div>

          {suggestError && (
            <p className="form-message error" role="alert">
              {suggestError}
            </p>
          )}

          {suggestion && (
            // Focus comes here when the suggestion arrives: the button that asked
            // for it was disabled while it waited, so focus had nowhere to stay.
            // Landing on the panel reads its name and everything that describes
            // it, the description and what is left this month included, and puts
            // "Use this" one Tab away.
            <section
              className="alt-suggestion"
              aria-labelledby="alt-suggestion-title"
              aria-describedby="alt-suggestion-body alt-suggestion-hint"
              tabIndex={-1}
              ref={focusOnArrival}
            >
              <h4 id="alt-suggestion-title">Suggested description</h4>
              <p className="alt-suggestion-body" id="alt-suggestion-body">
                {suggestion.body}
              </p>
              <p className="field-hint" id="alt-suggestion-hint">
                Check that it says what you see. It is not saved yet.
                {allowance && ` ${allowance.limit - allowance.used} of ${allowance.limit} left this month.`}
              </p>
              <div className="alt-suggestion-actions">
                <button className="secondary-button" type="button" onClick={handleUseSuggestion}>
                  Use this
                </button>
                <button className="text-button" type="button" onClick={handleDiscardSuggestion}>
                  Discard
                </button>
              </div>
            </section>
          )}

          <div className="photo-editor-actions">
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <LiveStatus>
              {saved && !saving && <p className="form-message success">Saved.</p>}
            </LiveStatus>
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
            <p className="field-hint" {...confirmation.warning}>
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
                {...confirmation.keep}
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
            ref={removeOpener()}
          >
            Remove photo
          </button>
        )}
      </section>
      <PhotoLightbox
        photos={[toLightboxPhoto(photo, urls, null)]}
        index={viewing ? 0 : null}
        onClose={() => setViewing(false)}
        onGoTo={() => {}}
      />
    </section>
  )
}
