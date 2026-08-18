import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SharedAlbum } from './SharedAlbum'

const { sharingApi } = vi.hoisted(() => ({
  sharingApi: { loadSharedAlbum: vi.fn() },
}))

vi.mock('../lib/sharing', () => sharingApi)

const ALBUM = {
  album: { title: 'Summer by the lake', description: 'A week by the water' },
  photos: [
    {
      id: 'photo-1',
      caption: 'Dinner on the last night',
      alt: 'A long table set for twelve',
      sortOrder: 0,
      thumbnailUrl: 'https://signed/1',
      stories: ['We had been walking since six.'],
    },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  sharingApi.loadSharedAlbum.mockResolvedValue(ALBUM)
})

describe('a visitor with no account', () => {
  it('sees the album, its published caption and its published story', async () => {
    render(<SharedAlbum token="the-token" />)

    expect(await screen.findByRole('heading', { name: 'Summer by the lake' })).toBeInTheDocument()
    expect(screen.getByText('A week by the water')).toBeInTheDocument()
    expect(screen.getByText('Dinner on the last night')).toBeInTheDocument()
    expect(screen.getByText('We had been walking since six.')).toBeInTheDocument()
  })

  it('gets the owner’s alt text on the picture', async () => {
    // Alt text is delivered whatever the owner chose for the caption, so this
    // is the one thing a visitor using a screen reader can rely on.
    render(<SharedAlbum token="the-token" />)

    expect(
      await screen.findByRole('img', { name: 'A long table set for twelve' }),
    ).toBeInTheDocument()
  })

  it('leaves an undescribed photo out of the accessibility tree', async () => {
    sharingApi.loadSharedAlbum.mockResolvedValue({
      ...ALBUM,
      photos: [{ ...ALBUM.photos[0], alt: null, caption: null, stories: [] }],
    })

    const { container } = render(<SharedAlbum token="the-token" />)

    await waitFor(() => expect(container.querySelectorAll('img')).toHaveLength(1))
    expect(screen.queryAllByRole('img')).toHaveLength(0)
  })

  it('is given nothing to edit', async () => {
    // Not a matter of hiding controls: this screen has none to hide.
    render(<SharedAlbum token="the-token" />)
    await screen.findByRole('heading', { name: 'Summer by the lake' })

    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
  })

  it('asks the Edge Function, not the database', async () => {
    // A visitor has no session and the bucket is private, so nothing in the
    // browser can mint an image URL. Only the function holds a key that can.
    render(<SharedAlbum token="the-token" />)
    await screen.findByRole('heading', { name: 'Summer by the lake' })

    expect(sharingApi.loadSharedAlbum).toHaveBeenCalledWith('the-token')
  })

  it('explains a link that no longer works, without saying why', async () => {
    // The same message for a wrong token, a rotated one, and an album whose
    // owner has stopped sharing: a visitor should not be able to tell them
    // apart, or a link becomes a way to probe for albums.
    sharingApi.loadSharedAlbum.mockRejectedValue(new Error('This album is not available.'))

    render(<SharedAlbum token="stale" />)

    expect(
      await screen.findByRole('heading', { name: 'This album is not available.' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Ask whoever sent it for a new link/)).toBeInTheDocument()
  })

  it('copes with an album that has no photographs yet', async () => {
    sharingApi.loadSharedAlbum.mockResolvedValue({ ...ALBUM, photos: [] })

    render(<SharedAlbum token="the-token" />)

    expect(await screen.findByText(/no photographs yet/)).toBeInTheDocument()
  })
})
