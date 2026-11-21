import { useEffect, useMemo, useState } from 'react'
import type { Photo } from '../lib/photos'
import { advance, hasStory, resumeFrom, slideCount, slideDuration } from '../lib/slideshow'
import { toLightboxPhoto } from './ExpandableThumb'
import { type LightboxPhoto, PhotoLightbox } from './PhotoLightbox'

/** A photograph as the slideshow takes it: false for one the owner left out. */
export type SlideshowPhoto = LightboxPhoto & { inSlideshow?: boolean }

type SlideshowProps = {
  /** In album order, with only the text this viewer may see. */
  photos: SlideshowPhoto[]
  title: string
  story: string | null | undefined
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/**
 * The owner's photographs as a slideshow shows them: the stored image, and the
 * caption only where it is published.
 *
 * Published only, although the owner may read her hidden captions anywhere
 * else. A slideshow is put on a screen for other people to watch, and a caption
 * she chose to keep private should not appear on the television because she
 * pressed Play.
 */
export function ownerSlideshowPhotos(photos: Photo[], urls: Map<string, string>): SlideshowPhoto[] {
  return photos.map((photo) => ({
    ...toLightboxPhoto(photo, urls, photo.captionVisibility === 'visible' ? photo.caption : null),
    inSlideshow: photo.inSlideshow,
  }))
}

/**
 * A "Play slideshow" button and the slideshow it opens: the album's story, then
 * each photograph in album order, a few seconds each.
 *
 * Plays in the photo viewer rather than in a second one. It starts paused for
 * anyone who has asked their device for reduced motion, and stops on the last
 * photograph.
 */
export function Slideshow({ photos, title, story }: SlideshowProps) {
  // Only what can be drawn, and without per-photo story notes: a timed slide is
  // gone before a paragraph under it could be read, so the caption is the text.
  const shown = useMemo(
    () =>
      photos
        // Only what the owner chose (absent means chosen), and only what can
        // be drawn.
        .filter((photo) => photo.inSlideshow !== false && (photo.fullUrl ?? photo.thumbnailUrl))
        .map((photo) => ({ ...photo, stories: [] })),
    [photos],
  )
  const count = slideCount(shown.length, story)
  const [index, setIndex] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  // The viewer is created on the first press and kept: an album page that is
  // never played carries no second dialog.
  const [used, setUsed] = useState(false)

  useEffect(() => {
    if (index === null || !playing) return

    // Restarted on every change of slide, so stepping by hand gives the new
    // slide its full time rather than whatever the old one had left.
    const timer = window.setTimeout(() => {
      const next = advance(index, count)
      setIndex(next.index)
      setPlaying(next.playing)
    }, slideDuration(index, story))

    return () => window.clearTimeout(timer)
  }, [index, playing, count, story])

  if (shown.length === 0) return null

  function start() {
    setUsed(true)
    setIndex(0)
    // Read at the moment of pressing, not on mount: the setting can change
    // while the page is open, and it is this press it has to answer.
    setPlaying(!prefersReducedMotion())
  }

  function togglePlay() {
    if (index === null) return
    if (playing) {
      setPlaying(false)
      return
    }
    setIndex(resumeFrom(index, count))
    setPlaying(true)
  }

  return (
    <>
      <button className="secondary-button slideshow-start" type="button" onClick={start}>
        <span aria-hidden="true">▶ </span>Play slideshow
      </button>
      {used && (
        <PhotoLightbox
          photos={shown}
          index={index}
          onClose={() => {
            setIndex(null)
            setPlaying(false)
          }}
          onGoTo={setIndex}
          playback={{
            playing,
            onTogglePlay: togglePlay,
            intro: hasStory(story) ? { title, text: story } : null,
          }}
        />
      )}
    </>
  )
}
