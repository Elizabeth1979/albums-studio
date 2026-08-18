import { useCallback } from 'react'
import type { SharedPhoto } from '../lib/sharing'
import { useModalDialog } from './useModalDialog'

type PhotoLightboxProps = {
  photos: SharedPhoto[]
  /** Which photograph is open; the dialog is closed when this is null. */
  index: number | null
  onClose: () => void
  onGoTo: (index: number) => void
}

/**
 * One photograph, filling the screen, with whatever its owner wrote about it.
 *
 * A native <dialog> rather than a div: showModal gives a focus trap, Escape,
 * inert content behind, and focus returned to the thumbnail on close, all of
 * which are laborious and easy to get subtly wrong by hand.
 */
export function PhotoLightbox({ photos, index, onClose, onGoTo }: PhotoLightboxProps) {
  const open = index !== null
  const dialog = useModalDialog(open)
  const photo = open ? photos[index] : undefined

  const goBy = useCallback(
    (step: number) => {
      if (index === null || photos.length === 0) return

      // Wraps, so neither end is a dead button on a phone where the only way
      // back is a small arrow.
      onGoTo((index + step + photos.length) % photos.length)
    },
    [index, onGoTo, photos.length],
  )

  function handleKeyDown(event: React.KeyboardEvent<HTMLDialogElement>) {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      goBy(1)
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      goBy(-1)
    }
  }

  if (!photo) {
    // Rendered but empty: the element has to exist for showModal to be callable
    // on the render that opens it.
    return <dialog className="lightbox" ref={dialog} onClose={onClose} />
  }

  const source = photo.fullUrl ?? photo.thumbnailUrl
  const position = `${(index as number) + 1} of ${photos.length}`

  return (
    <dialog
      className="lightbox"
      ref={dialog}
      onClose={onClose}
      onKeyDown={handleKeyDown}
      aria-label={photo.alt || `Photograph ${position}`}
      onClick={(event) => {
        // Clicking the backdrop closes. The dialog element covers the whole
        // screen, so the target is the dialog itself only outside the figure.
        if (event.target === dialog.current) onClose()
      }}
    >
      <div className="lightbox-frame">
        <div className="lightbox-bar">
          <span className="lightbox-position">{position}</span>
          <button className="lightbox-close" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        {source && (
          <img className="lightbox-image" src={source} alt={photo.alt ?? ''} decoding="async" />
        )}

        {(photo.caption || photo.stories.length > 0) && (
          <div className="lightbox-words">
            {photo.caption && <p className="lightbox-caption">{photo.caption}</p>}
            {photo.stories.map((story, storyIndex) => (
              <p className="lightbox-story" key={storyIndex}>
                {story}
              </p>
            ))}
          </div>
        )}

        {photos.length > 1 && (
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
