import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Album } from '../lib/albums'
import { AlbumStory } from './AlbumStory'

const { draftAlbumStory, settleDraft } = vi.hoisted(() => ({
  draftAlbumStory: vi.fn(),
  settleDraft: vi.fn(),
}))

vi.mock('../lib/albumStory', () => ({ draftAlbumStory, settleDraft }))

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
})

async function askForDraft(notes = 'The rain on day two was the best part.') {
  fireEvent.click(screen.getByRole('button', { name: 'Draft the story with AI' }))
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

    expect(draftAlbumStory).toHaveBeenCalledWith('album-1', 'The rain on day two was the best part.')
    expect(draft).toHaveValue('We arrived in the rain.')
    expect(onChangeStory).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('1 of 5 story drafts used this month.')

    fireEvent.change(draft, { target: { value: 'We arrived in the rain, laughing.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Use this story' }))

    await waitFor(() =>
      expect(onChangeStory).toHaveBeenCalledWith('We arrived in the rain, laughing.', 'draft-1'),
    )
    expect(settleDraft).toHaveBeenCalledWith('draft-1', 'accepted')
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
  })

  it('says why a draft could not be made, in the server own words', async () => {
    draftAlbumStory.mockRejectedValue(new Error('You have used all 5 story drafts for this month.'))
    render(<AlbumStory album={album()} onChangeStory={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Draft the story with AI' }))
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
})
