import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Photo } from '../lib/photos'
import { PHOTO_MS, STORY_MIN_MS } from '../lib/slideshow'
import type { LightboxPhoto } from './PhotoLightbox'
import { Slideshow, ownerSlideshowPhotos } from './Slideshow'

function shot(id: string, overrides: Partial<LightboxPhoto> = {}): LightboxPhoto {
  return {
    id,
    alt: `Alt for ${id}`,
    caption: null,
    thumbnailUrl: `https://signed/${id}-thumb`,
    fullUrl: `https://signed/${id}-full`,
    stories: [],
    ...overrides,
  }
}

const PHOTOS = [shot('a', { caption: 'First caption' }), shot('b'), shot('c')]

function reducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: reduce }) as typeof window.matchMedia
}

function open() {
  fireEvent.click(screen.getByRole('button', { name: 'Play slideshow' }))
  return screen.getByRole('dialog', { hidden: true })
}

beforeEach(() => {
  vi.useFakeTimers()
  reducedMotion(false)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Slideshow', () => {
  it('plays the photographs in order, a few seconds each, and stops on the last', () => {
    render(<Slideshow photos={PHOTOS} title="Lake" story={null} />)
    const dialog = open()

    expect(within(dialog).getByRole('img')).toHaveAttribute('alt', 'Alt for a')
    act(() => vi.advanceTimersByTime(PHOTO_MS))
    expect(within(dialog).getByRole('img')).toHaveAttribute('alt', 'Alt for b')
    act(() => vi.advanceTimersByTime(PHOTO_MS))
    expect(dialog).toHaveTextContent('3 of 3')

    act(() => vi.advanceTimersByTime(PHOTO_MS * 3))
    expect(dialog).toHaveTextContent('3 of 3')
    expect(within(dialog).getByRole('button', { name: 'Play slideshow' })).toBeInTheDocument()
  })

  it('shows the stored image, not the thumbnail', () => {
    render(<Slideshow photos={PHOTOS} title="Lake" story={null} />)
    expect(within(open()).getByRole('img')).toHaveAttribute('src', 'https://signed/a-full')
  })

  it('opens on the story when the album has one, and gives it time to be read', () => {
    render(<Slideshow photos={PHOTOS} title="Lake" story="We drove up on Friday." />)
    const dialog = open()

    expect(dialog).toHaveTextContent('We drove up on Friday.')
    expect(within(dialog).queryByRole('img')).toBeNull()

    act(() => vi.advanceTimersByTime(PHOTO_MS))
    expect(within(dialog).queryByRole('img')).toBeNull()
    act(() => vi.advanceTimersByTime(STORY_MIN_MS - PHOTO_MS))
    expect(within(dialog).getByRole('img')).toHaveAttribute('alt', 'Alt for a')
  })

  it('pauses and plays from its own button, which is announced by name', () => {
    render(<Slideshow photos={PHOTOS} title="Lake" story={null} />)
    const dialog = open()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Pause slideshow' }))
    act(() => vi.advanceTimersByTime(PHOTO_MS * 2))
    expect(dialog).toHaveTextContent('1 of 3')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Play slideshow' }))
    act(() => vi.advanceTimersByTime(PHOTO_MS))
    expect(dialog).toHaveTextContent('2 of 3')
  })

  it('pauses on Space', () => {
    render(<Slideshow photos={PHOTOS} title="Lake" story={null} />)
    const dialog = open()

    fireEvent.keyDown(dialog, { key: ' ' })
    expect(within(dialog).getByRole('button', { name: 'Play slideshow' })).toBeInTheDocument()
  })

  it('starts paused for someone who asked for reduced motion', () => {
    reducedMotion(true)
    render(<Slideshow photos={PHOTOS} title="Lake" story={null} />)
    const dialog = open()

    act(() => vi.advanceTimersByTime(PHOTO_MS * 2))
    expect(dialog).toHaveTextContent('1 of 3')
    expect(within(dialog).getByRole('button', { name: 'Play slideshow' })).toBeInTheDocument()
  })

  it('steps by swipe on a touch screen', () => {
    reducedMotion(true)
    render(<Slideshow photos={PHOTOS} title="Lake" story={null} />)
    const dialog = open()

    fireEvent.pointerDown(dialog, { pointerType: 'touch', clientX: 300, clientY: 400 })
    fireEvent.pointerUp(dialog, { pointerType: 'touch', clientX: 150, clientY: 410 })
    expect(dialog).toHaveTextContent('2 of 3')
  })

  it('announces a slide stepped to by hand, and stays quiet while playing', () => {
    render(<Slideshow photos={PHOTOS} title="Lake" story={null} />)
    const dialog = open()
    const slide = dialog.querySelector('.lightbox-slide')

    expect(slide).toHaveAttribute('aria-live', 'off')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Pause slideshow' }))
    expect(slide).toHaveAttribute('aria-live', 'polite')
  })

  it('shows the caption and leaves out per-photo story notes', () => {
    render(
      <Slideshow
        photos={[shot('a', { caption: 'First caption', stories: ['A long note'] })]}
        title="Lake"
        story={null}
      />,
    )
    const dialog = open()

    expect(dialog).toHaveTextContent('First caption')
    expect(dialog).not.toHaveTextContent('A long note')
  })

  it('fetches the next photograph ahead, and only that one', () => {
    // Not checked end to end: a visitor's grid already loads every image, so
    // a request seen there proves nothing about the slideshow.
    const fetched: string[] = []
    const RealImage = window.Image
    window.Image = class {
      set src(url: string) {
        fetched.push(url)
      }
      decode() {
        return Promise.resolve()
      }
    } as unknown as typeof Image
    try {
      reducedMotion(true)
      render(<Slideshow photos={PHOTOS} title="Lake" story="A story first." />)
      open()
      expect(fetched).toEqual(['https://signed/a-full'])

      fireEvent.keyDown(screen.getByRole('dialog', { hidden: true }), { key: 'ArrowRight' })
      expect(fetched).toEqual(['https://signed/a-full', 'https://signed/b-full'])
    } finally {
      window.Image = RealImage
    }
  })

  it('skips a photograph the owner left out, for owner and visitor alike', () => {
    reducedMotion(true)
    render(
      <Slideshow
        photos={[shot('a'), { ...shot('b'), inSlideshow: false }, shot('c')]}
        title="Lake"
        story={null}
      />,
    )
    const dialog = open()

    expect(dialog).toHaveTextContent('1 of 2')
    fireEvent.keyDown(dialog, { key: 'ArrowRight' })
    expect(within(dialog).getByRole('img')).toHaveAttribute('alt', 'Alt for c')
  })

  it('offers nothing when every photograph was left out', () => {
    render(
      <Slideshow photos={[{ ...shot('a'), inSlideshow: false }]} title="Lake" story="A story." />,
    )
    expect(screen.queryByRole('button', { name: 'Play slideshow' })).toBeNull()
  })

  it('offers nothing when no photograph can be drawn yet', () => {
    render(
      <Slideshow photos={[shot('a', { fullUrl: null, thumbnailUrl: null })]} title="Lake" story={null} />,
    )
    expect(screen.queryByRole('button', { name: 'Play slideshow' })).toBeNull()
  })
})

describe('ownerSlideshowPhotos', () => {
  const base: Photo = {
    id: 'p',
    storagePath: 'owner/p.jpg',
    thumbnailPath: 'owner/p-thumb.jpg',
    displayPath: null,
    originalPath: null,
    width: null,
    height: null,
    caption: 'Private words',
    captionVisibility: 'hidden',
    alt: 'A dog',
    sortOrder: 0,
    phash: null,
    sharpness: null,
    takenAt: null,
    inSlideshow: true,
  }
  const urls = new Map([
    ['owner/p.jpg', 'https://signed/full'],
    ['owner/p-thumb.jpg', 'https://signed/thumb'],
  ])

  it('carries the owner\'s choice of what plays', () => {
    expect(ownerSlideshowPhotos([{ ...base, inSlideshow: false }], urls)[0].inSlideshow).toBe(false)
  })

  it('keeps a hidden caption off the screen, because a slideshow is shown to other people', () => {
    expect(ownerSlideshowPhotos([base], urls)[0].caption).toBeNull()
  })

  it('shows a published caption, the alt text and the stored image', () => {
    const [slide] = ownerSlideshowPhotos([{ ...base, captionVisibility: 'visible' }], urls)
    expect(slide).toMatchObject({ caption: 'Private words', alt: 'A dog', fullUrl: 'https://signed/full' })
  })
})
