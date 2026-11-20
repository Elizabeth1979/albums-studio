/**
 * Timing and ordering for a slideshow, kept apart from the screen so the rules
 * that are easy to get quietly wrong — when it stops, how long the story stays,
 * which way a swipe goes — have tests of their own.
 *
 * A slideshow is the album's story, when it has one, followed by its
 * photographs in album order. Slide 0 is the story whenever there is one.
 */

/** How long one photograph stays on screen while playing. */
export const PHOTO_MS = 5_000

/**
 * Reading pace for the story slide: about 180 words a minute, slower than
 * silent reading, because a slideshow is often read aloud or by a group.
 */
export const STORY_MS_PER_WORD = 330
export const STORY_MIN_MS = 6_000
/** A long story is not held for minutes; Next is always there. */
export const STORY_MAX_MS = 45_000

/** How far a finger must travel sideways before a swipe counts, in CSS pixels. */
export const SWIPE_MIN_PX = 50

export function slideCount(photoCount: number, story: string | null | undefined): number {
  if (photoCount === 0) return 0
  return photoCount + (hasStory(story) ? 1 : 0)
}

export function hasStory(story: string | null | undefined): story is string {
  return Boolean(story && story.trim())
}

/** How long a slide stays before the next, in milliseconds. */
export function slideDuration(index: number, story: string | null | undefined): number {
  if (index !== 0 || !hasStory(story)) return PHOTO_MS

  const words = story.trim().split(/\s+/).length
  return Math.min(STORY_MAX_MS, Math.max(STORY_MIN_MS, words * STORY_MS_PER_WORD))
}

/**
 * What the timer does when a slide's time is up.
 *
 * It stops on the last photograph rather than wrapping: a slideshow watched
 * together has an end, and starting over from the story unasked would replay
 * the words nobody was reading any more.
 */
export function advance(index: number, count: number): { index: number; playing: boolean } {
  if (index + 1 >= count) return { index: Math.max(count - 1, 0), playing: false }
  return { index: index + 1, playing: true }
}

/** Where Play starts from: the beginning again once the end has been reached. */
export function resumeFrom(index: number, count: number): number {
  return index >= count - 1 ? 0 : index
}

/**
 * Which way a finger moved: 1 for the next slide (dragged leftwards), -1 for
 * the previous one, 0 for a tap or a vertical scroll.
 */
export function swipeStep(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) <= Math.abs(dy)) return 0
  return dx < 0 ? 1 : -1
}
