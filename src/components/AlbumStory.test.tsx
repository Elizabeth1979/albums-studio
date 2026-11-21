import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Album } from '../lib/albums'
import type { Photo } from '../lib/photos'
import { AlbumStory } from './AlbumStory'

const { draftAlbumStory, settleDraft, listPhotos, signedUrls } = vi.hoisted(() => ({
  draftAlbumStory: vi.fn(),
  settleDraft: vi.fn(),
  listPhotos: vi.fn(),
  signedUrls: vi.fn(),
}))

// The limit and the spread are the real ones: they are what is under test.
vi.mock('../lib/albumStory', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/albumStory')>()),
  draftAlbumStory,
  settleDraft,
}))
vi.mock('../lib/photos', () => ({ listPhotos, signedUrls }))

function photos(count: number): Photo[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `photo-${index + 1}`,
    storagePath: `owner/a/${index + 1}.jpg`,
    thumbnailPath: `owner/a/${index + 1}-thumb.jpg`,
    displayPath: null,
    originalPath: null,
    width: 2000,
    height: 1500,
    caption: null,
    captionVisibility: 'hidden',
    alt: null,
    sortOrder: index,
    phash: null,
    sharpness: null,
    takenAt: null,
    inSlideshow: true,
  }))
}

function album(overrides: Partial<Album> = {}): Album {
  return {
    id: 'album-1',
    title: 'Summer by the lake',
    slug: 'summer-by-the-lake',
    description: null,
    coverPhotoId: null,
    visibility: 'private',
    createdAt: '2026-08-16T10:00:00Z',
    story: null,
    storyDraftId: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  settleDraft.mockResolvedValue(undefined)
  listPhotos.mockResolvedValue(photos(3))
  signedUrls.mockImplementation(async (paths: string[]) => new Map(paths.map((path) => [path, `https://signed/${path}`])))
})

async function askForDraft(notes = 'The rain on day two was the best part.') {
  fireEvent.click(screen.getByRole('button', { name: 'Draft the story with AI' }))
  await screen.findByRole('group', { name: 'Photos for the story' })
  await screen.findAllByRole('checkbox')
  fireEvent.change(screen.getByLabelText(/Anything the story should say/), {
    target: { value: notes },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Draft the story' }))
  return screen.findByLabelText(/Draft — edit it as you like/)
}

describe('AlbumStory', () => {
  it('drafts from the owner notes, and puts nothing on the album until the owner uses it', async () => {
    draftAlbumStory.mockResolvedValue({ id: 'draft-1', body: 'We arrived in the rain.', used: 1, limit: 5 })
    const onChangeStory = vi.fn().mockResolvedValue(undefined)
    render(<AlbumStory album={album()} onChangeStory={onChangeStory} />)

    const draft = await askForDraft()

    expect(draftAlbumStory).toHaveBeenCalledWith('album-1', 'The rain on day two was the best part.', [
      'photo-1',
      'photo-2',
      'photo-3',
    ])
    expect(draft).toHaveValue('We arrived in the rain.')
    expect(onChangeStory).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('1 of 5 story drafts used this month.')

    fireEvent.change(draft, { target: { value: 'We arrived in the rain, laughing.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Use this story' }))

    await waitFor(() =>
      expect(onChangeStory).toHaveBeenCalledWith('We arrived in the rain, laughing.', 'draft-1'),
    )
    expect(settleDraft).toHaveBeenCalledWith('draft-1', 'accepted')
    // Said, not only shown: a screen reader hears nothing when text merely appears.
    expect(screen.getByRole('status')).toHaveTextContent('The story is on the album.')
  })

  it('puts the cursor in the form it opens, and gives focus back on Cancel', async () => {
    // The button pressed is replaced by the form; left alone, focus falls to
    // the page and nothing says a form has opened.
    render(<AlbumStory album={album()} onChangeStory={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Draft the story with AI' }))
    expect(screen.getByLabelText(/Anything the story should say/)).toHaveFocus()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Draft the story with AI' })).toHaveFocus()
  })

  it('sets a discarded draft aside without touching the album', async () => {
    draftAlbumStory.mockResolvedValue({ id: 'draft-2', body: 'Not quite right.', used: 2, limit: 5 })
    const onChangeStory = vi.fn()
    render(<AlbumStory album={album()} onChangeStory={onChangeStory} />)

    await askForDraft()
    fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }))

    await waitFor(() => expect(settleDraft).toHaveBeenCalledWith('draft-2', 'rejected'))
    expect(onChangeStory).not.toHaveBeenCalled()
    expect(screen.getByText(/No story yet/)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Draft discarded. The album is unchanged.')
  })

  it('says why a draft could not be made, in the server own words', async () => {
    draftAlbumStory.mockRejectedValue(new Error('You have used all 5 story drafts for this month.'))
    render(<AlbumStory album={album()} onChangeStory={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Draft the story with AI' }))
    await screen.findAllByRole('checkbox')
    fireEvent.click(screen.getByRole('button', { name: 'Draft the story' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('used all 5 story drafts')
    expect(screen.getByRole('button', { name: 'Draft the story' })).toBeEnabled()
  })

  it('shows an accepted story as paragraphs, and keeps its source when edited by hand', async () => {
    const onChangeStory = vi.fn().mockResolvedValue(undefined)
    render(
      <AlbumStory
        album={album({ story: 'First paragraph.\n\nSecond paragraph.', storyDraftId: 'draft-9' })}
        onChangeStory={onChangeStory}
      />,
    )

    expect(screen.getByText('First paragraph.')).toBeInTheDocument()
    expect(screen.getByText('Second paragraph.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Edit story' }))
    fireEvent.change(screen.getByLabelText('Edit the story'), { target: { value: 'Rewritten.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save story' }))

    await waitFor(() => expect(onChangeStory).toHaveBeenCalledWith('Rewritten.', 'draft-9'))
    expect(draftAlbumStory).not.toHaveBeenCalled()
  })

  describe('choosing the photos', () => {
    it('starts a long album with twenty spread from its first photo to its last', async () => {
      listPhotos.mockResolvedValue(photos(200))
      draftAlbumStory.mockResolvedValue({ id: 'draft-3', body: 'A long trip.', used: 1, limit: 5 })
      render(<AlbumStory album={album()} onChangeStory={vi.fn()} />)

      fireEvent.click(screen.getByRole('button', { name: 'Draft the story with AI' }))
      expect(await screen.findByText(/20 of up to 20 chosen, from 200/)).toBeInTheDocument()
      expect(screen.getByRole('checkbox', { name: 'Photo 1' })).toBeChecked()
      expect(screen.getByRole('checkbox', { name: 'Photo 200' })).toBeChecked()
      expect(screen.getByRole('checkbox', { name: 'Photo 2' })).not.toBeChecked()
      // At the limit, the rest cannot be added until one is taken out.
      expect(screen.getByRole('checkbox', { name: 'Photo 2' })).toBeDisabled()

      fireEvent.click(screen.getByRole('checkbox', { name: 'Photo 200' }))
      fireEvent.click(screen.getByRole('checkbox', { name: 'Photo 2' }))
      fireEvent.click(screen.getByRole('button', { name: 'Draft the story' }))

      await waitFor(() => expect(draftAlbumStory).toHaveBeenCalled())
      const sent = draftAlbumStory.mock.calls[0][2] as string[]
      expect(sent).toHaveLength(20)
      expect(sent).toContain('photo-2')
      expect(sent).not.toContain('photo-200')
      // In album order, not the order they were ticked.
      expect(sent.slice(0, 2)).toEqual(['photo-1', 'photo-2'])
    })

    it('will not draft from no photos at all', async () => {
      render(<AlbumStory album={album()} onChangeStory={vi.fn()} />)

      fireEvent.click(screen.getByRole('button', { name: 'Draft the story with AI' }))
      await screen.findAllByRole('checkbox')
      fireEvent.click(screen.getByRole('button', { name: 'Choose none' }))

      expect(screen.getByText(/0 of up to 20 chosen/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Draft the story' })).toBeDisabled()
    })

    it('still drafts when the photos cannot be shown, and says what it will use', async () => {
      listPhotos.mockRejectedValue(new Error('offline'))
      draftAlbumStory.mockResolvedValue({ id: 'draft-4', body: 'Anyway.', used: 1, limit: 5 })
      render(<AlbumStory album={album()} onChangeStory={vi.fn()} />)

      fireEvent.click(screen.getByRole('button', { name: 'Draft the story with AI' }))
      expect(await screen.findByText(/could not be shown here/)).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Draft the story' }))

      // No ids: the server spreads its own pick across the album.
      await waitFor(() => expect(draftAlbumStory).toHaveBeenCalledWith('album-1', '', []))
    })
  })
})
