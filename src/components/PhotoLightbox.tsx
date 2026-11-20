import { useCallback, useEffect, useRef } from 'react'
import type { SharedPhoto } from '../lib/sharing'
import { swipeStep } from '../lib/slideshow'
import { useModalDialog } from './useModalDialog'

/** What the lightbox reads from a photograph; a shared one is already this shape. */
export type LightboxPhoto = Pick<
  SharedPhoto,
  'id' | 'alt' | 'caption' | 'thumbnailUrl' | 'fullUrl' | 'stories'
>

/** The controls a slideshow adds to the viewer. */
export type LightboxPlayback = {
  playing: boolean
  onTogglePlay: () => void
  /** The album's story, shown as the first slide, before any photograph. */
  intro?: { title: string; text: string } | null
}

type PhotoLightboxProps = {
  photos: LightboxPhoto[]
  /**
   * Which slide is open; the dialog is closed when this is null. Without an
   * intro, a slide is a photograph; with one, slide 0 is the intro.
   */
  index: number | null
  onClose: () => void
  onGoTo: (index: number) => void
  /** Present when the viewer is playing a slideshow rather than showing one photograph. */
  playback?: LightboxPlayback
}

function sourceOf(photo: LightboxPhoto | undefined): string | null {
  // The stored image before the thumbnail: it is the best copy already signed,
  // and a 400px thumbnail stretched over a screen is visibly soft.
  return photo ? (photo.fullUrl ?? photo.thumbnailUrl) : null
}

/**
 * One photograph, filling the screen, with whatever its owner wrote about it.
 *
 * A native <dialog> rather than a div: showModal gives a focus trap, Escape,
 * inert content behind, and focus returned to the thumbnail on close, all of
 * which are laborious and easy to get subtly wrong by hand.
 *
 * The same viewer plays a slideshow: `playback` adds a pause control, the
 * story as an opening slide, and Space to pause. Stepping, swiping and the
 * look-ahead below serve both.
 */
export function PhotoLightbox({ photos, index, onClose, onGoTo, playback }: PhotoLightboxProps) {
  const open = index !== null
  const dialog = useModalDialog(open)
  const intro = playback?.intro ?? null
  const offset = intro ? 1 : 0
  const slides = photos.length + offset
  const showingIntro = open && intro !== null && index === 0
  const photo = open && !showingIntro ? photos[index - offset] : undefined
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  // React passes a dialog's close up its own tree, so a lightbox opened from
  // inside another dialog would close that one too without this.
  function closed(event: React.SyntheticEvent<HTMLDialogElement>) {
    event.stopPropagation()
    onClose()
  }

  const goBy = useCallback(
    (step: number) => {
      if (index === null || slides === 0) return

      // Wraps, so neither end is a dead button on a phone where the only way
      // back is a small arrow.
      onGoTo((index + step + slides) % slides)
    },
    [index, onGoTo, slides],
  )

  // Fetches and decodes the next photograph while this one is on screen, so
  // stepping on — by hand or by the timer — never lands on a blank frame. One
  // ahead only: a whole album of 2000px images decoded at once is what takes a
  // phone's browser tab down.
  const nextSource = open && slides > 1 ? sourceOf(photos[((index + 1) % slides) - offset]) : null
  useEffect(() => {
    if (!nextSource) return
    const ahead = new Image()
    ahead.src = nextSource
    ahead.decode?.().catch(() => {
      // A failed look-ahead costs nothing: the slide loads normally when shown.
    })
  }, [nextSource])

  function handleKeyDown(event: React.KeyboardEvent<HTMLDialogElement>) {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      goBy(1)
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      goBy(-1)
    }
    // On a button, Space presses that button, as it should everywhere else.
    if (playback && event.key === ' ' && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault()
      playback.onTogglePlay()
    }
  }

  function handlePointerDown(event: React.PointerEvent) {
    touchStart.current = event.pointerType === 'mouse' ? null : { x: event.clientX, y: event.clientY }
  }

  function handlePointerUp(event: React.PointerEvent) {
    const start = touchStart.current
    touchStart.current = null
    if (!start) return
    const step = swipeStep(event.clientX - start.x, event.clientY - start.y)
    if (step !== 0) goBy(step)
  }

  if (!photo && !showingIntro) {
    // Rendered but empty: the element has to exist for showModal to be callable
    // on the render that opens it.
    return <dialog className="lightbox" ref={dialog} onClose={closed} />
  }

  const source = sourceOf(photo)
  const photoNumber = (index as number) - offset + 1
  const position = showingIntro ? 'The story' : `${photoNumber} of ${photos.length}`
  const label = showingIntro
    ? (intro as { title: string }).title
    : photo?.alt || `Photograph ${position}`

  return (
    <dialog
      className={playback ? 'lightbox slideshow' : 'lightbox'}
      ref={dialog}
      onClose={closed}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => (touchStart.current = null)}
      aria-label={label}
      aria-roledescription={playback ? 'slideshow' : undefined}
      onClick={(event) => {
        // Clicking the backdrop closes. The dialog element covers the whole
        // screen, so the target is the dialog itself only outside the figure.
        if (event.target === dialog.current) onClose()
      }}
    >
      <div className="lightbox-frame">
        <div className="lightbox-bar">
          {playback && (
            // First in the dialog, so showModal puts focus on it: moving content
            // has to be stoppable before anything else (WCAG 2.2.2).
            <button className="lightbox-close lightbox-play" type="button" onClick={playback.onTogglePlay}>
              {/* Short on screen so the bar fits a phone on one line; the full
                  name for a screen reader, which starts with the visible word. */}
              {playback.playing ? 'Pause' : 'Play'}{' '}
              <span className="visually-hidden">slideshow</span>
            </button>
          )}
          <span className="lightbox-position">{position}</span>
          <button className="lightbox-close" type="button" onClick={onClose}>
            Close
            {playback && (
              <>
                {' '}
                <span className="visually-hidden">slideshow</span>
              </>
            )}
          </button>
        </div>

        <div
          className="lightbox-slide"
          // Announced when someone steps by hand; silent while it plays by
          // itself, where a new announcement every few seconds would talk over
          // everything else. The pattern the WAI carousel guidance gives.
          aria-live={playback ? (playback.playing ? 'off' : 'polite') : undefined}
        >
          {showingIntro && intro && (
            <div className="lightbox-intro">
              <p className="lightbox-intro-title">{intro.title}</p>
              {intro.text
                .split(/\n\s*\n/)
                .map((paragraph) => paragraph.trim())
                .filter(Boolean)
                .map((paragraph, paragraphIndex) => (
                  <p key={paragraphIndex}>{paragraph}</p>
                ))}
            </div>
          )}

          {photo && source && (
            <img
              // Keyed so each photograph is a fresh element: the fade in the
              // stylesheet replays per slide, and never runs mid-swap.
              key={photo.id}
              className="lightbox-image"
              src={source}
              alt={photo.alt ?? ''}
              decoding="async"
            />
          )}

          {photo && (photo.caption || photo.stories.length > 0) && (
            <div className="lightbox-words">
              {photo.caption && <p className="lightbox-caption">{photo.caption}</p>}
              {photo.stories.map((story, storyIndex) => (
                <p className="lightbox-story" key={storyIndex}>
                  {story}
                </p>
              ))}
            </div>
          )}
        </div>

        {slides > 1 && (
          <div className="lightbox-steps">
            <button className="lightbox-step" type="button" onClick={() => goBy(-1)}>
              ← Previous
            </button>
            <button className="lightbox-step" type="button" onClick={() => goBy(1)}>
              Next →
            </button>
          </div>
        )}
      </div>
    </dialog>
  )
}
