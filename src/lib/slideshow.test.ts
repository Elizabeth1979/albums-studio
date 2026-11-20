import { describe, expect, it } from 'vitest'
import {
  PHOTO_MS,
  STORY_MAX_MS,
  STORY_MIN_MS,
  STORY_MS_PER_WORD,
  SWIPE_MIN_PX,
  advance,
  resumeFrom,
  slideCount,
  slideDuration,
  swipeStep,
} from './slideshow'

describe('slideCount', () => {
  it('puts the story before the photographs when there is one', () => {
    expect(slideCount(3, 'We went to the lake.')).toBe(4)
    expect(slideCount(3, null)).toBe(3)
  })

  it('does not count a story of only whitespace', () => {
    expect(slideCount(3, '  \n ')).toBe(3)
  })

  it('has nothing to play without photographs, story or not', () => {
    expect(slideCount(0, 'A story with no pictures.')).toBe(0)
  })
})

describe('slideDuration', () => {
  it('gives each photograph the same few seconds', () => {
    expect(slideDuration(0, null)).toBe(PHOTO_MS)
    expect(slideDuration(3, 'A story')).toBe(PHOTO_MS)
  })

  it('gives the story time to read, by its length', () => {
    const words = Array.from({ length: 40 }, () => 'word').join(' ')
    expect(slideDuration(0, words)).toBe(40 * STORY_MS_PER_WORD)
  })

  it('keeps a short story up long enough to notice and a long one from holding the room', () => {
    expect(slideDuration(0, 'Hello')).toBe(STORY_MIN_MS)
    expect(slideDuration(0, 'word '.repeat(1000))).toBe(STORY_MAX_MS)
  })
})

describe('advance', () => {
  it('moves on and keeps playing before the end', () => {
    expect(advance(0, 3)).toEqual({ index: 1, playing: true })
  })

  it('stops on the last photograph rather than starting over', () => {
    expect(advance(2, 3)).toEqual({ index: 2, playing: false })
  })
})

describe('resumeFrom', () => {
  it('carries on from where it was paused', () => {
    expect(resumeFrom(1, 3)).toBe(1)
  })

  it('starts again from the beginning once the end was reached', () => {
    expect(resumeFrom(2, 3)).toBe(0)
  })
})

describe('swipeStep', () => {
  it('goes forward for a drag to the left and back for one to the right', () => {
    expect(swipeStep(-SWIPE_MIN_PX, 0)).toBe(1)
    expect(swipeStep(SWIPE_MIN_PX, 0)).toBe(-1)
  })

  it('ignores a tap and a mostly vertical scroll', () => {
    expect(swipeStep(SWIPE_MIN_PX - 1, 0)).toBe(0)
    expect(swipeStep(-80, 120)).toBe(0)
  })
})
