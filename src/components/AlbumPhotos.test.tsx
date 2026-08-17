import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AlbumPhotos } from './AlbumPhotos'
import type { Album } from '../lib/albums'
import type { Photo } from '../lib/photos'

const { photosApi, processorApi } = vi.hoisted(() => ({
  photosApi: {
    listPhotos: vi.fn(),
    storePhoto: vi.fn(),
    signedUrls: vi.fn(),
  },
  processorApi: { process: vi.fn(), dispose: vi.fn() },
}))

vi.mock('../lib/photos', () => photosApi)
vi.mock('../lib/imaging/processor', () => ({
  createImageProcessor: () => processorApi,
}))

const album: Album = {
  id: 'album-1',
  title: 'Eilat',
  slug: 'eilat',
  layout: 'masonry',
  description: null,
  createdAt: '2026-08-16T20:27:38Z',
}

function photo(index: number): Photo {
  return {
    id: `photo-${index}`,
    storagePath: `owner/album-1/photo-${index}.jpg`,
    thumbnailPath: `owner/album-1/photo-${index}-thumb.jpg`,
    width: 2000,
    height: 1500,
    caption: null,
    alt: null,
    sortOrder: index,
  }
}

function chooseFiles(names: string[]) {
  const input = screen.getByLabelText('Choose photos')
  const files = names.map((name) => new File(['bytes'], name, { type: 'image/jpeg' }))

  fireEvent.change(input, { target: { files } })
}

beforeEach(() => {
  vi.clearAllMocks()
  photosApi.listPhotos.mockResolvedValue([])
  photosApi.signedUrls.mockResolvedValue(new Map())
  processorApi.process.mockResolvedValue({
    full: new Blob(['full']),
    thumbnail: new Blob(['thumb']),
    width: 2000,
    height: 1500,
    phash: '0'.repeat(64),
    sharpness: 120,
  })
  photosApi.storePhoto.mockImplementation(async ({ sortOrder }: { sortOrder: number }) =>
    photo(sortOrder),
  )
})

describe('AlbumPhotos', () => {
  it('offers a way in that works without dragging', async () => {
    render(<AlbumPhotos album={album} />)

    // A phone has nothing to drag, so the control has to be the file input.
    expect(await screen.findByLabelText('Choose photos')).toBeInTheDocument()
  })

  it('shows the empty album in its layout', async () => {
    render(<AlbumPhotos album={album} />)

    expect(await screen.findByRole('heading', { name: 'No photos yet' })).toBeInTheDocument()
  })

  it('renders photos it loaded, using signed thumbnails', async () => {
    photosApi.listPhotos.mockResolvedValue([photo(0), photo(1)])
    photosApi.signedUrls.mockResolvedValue(
      new Map([
        ['owner/album-1/photo-0-thumb.jpg', 'https://signed/0'],
        ['owner/album-1/photo-1-thumb.jpg', 'https://signed/1'],
      ]),
    )

    const { container } = render(<AlbumPhotos album={album} />)

    // Queried through the DOM rather than by role: a photo with no alt text yet
    // is deliberately decorative, so it has no `img` role to find.
    await waitFor(() => expect(container.querySelectorAll('img')).toHaveLength(2))
    expect(container.querySelectorAll('img')[0]).toHaveAttribute('src', 'https://signed/0')
    expect(screen.queryByRole('heading', { name: 'No photos yet' })).not.toBeInTheDocument()
  })

  it('leaves a photo without alt text out of the accessibility tree', async () => {
    // Until Phase 4 lets an owner write alt text, an empty alt is the honest
    // answer: a screen reader should skip the image rather than announce a
    // filename that describes nothing.
    photosApi.listPhotos.mockResolvedValue([photo(0)])
    photosApi.signedUrls.mockResolvedValue(
      new Map([['owner/album-1/photo-0-thumb.jpg', 'https://signed/0']]),
    )

    const { container } = render(<AlbumPhotos album={album} />)

    await waitFor(() => expect(container.querySelectorAll('img')).toHaveLength(1))
    expect(screen.queryAllByRole('img')).toHaveLength(0)
  })

  it('announces a photo that does have alt text', async () => {
    photosApi.listPhotos.mockResolvedValue([{ ...photo(0), alt: 'The reef at sunset' }])
    photosApi.signedUrls.mockResolvedValue(
      new Map([['owner/album-1/photo-0-thumb.jpg', 'https://signed/0']]),
    )

    render(<AlbumPhotos album={album} />)

    expect(await screen.findByRole('img', { name: 'The reef at sunset' })).toBeInTheDocument()
  })

  it('reports a failed load', async () => {
    photosApi.listPhotos.mockRejectedValue(new Error('Network unreachable'))

    render(<AlbumPhotos album={album} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Network unreachable')
  })

  it('uploads chosen files and counts them as they land', async () => {
    render(<AlbumPhotos album={album} />)
    await screen.findByLabelText('Choose photos')

    chooseFiles(['one.jpg', 'two.jpg'])

    await waitFor(() => expect(photosApi.storePhoto).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Added 2 of 2.')).toBeInTheDocument()
  })

  it('numbers new photos after the ones already in the album', async () => {
    photosApi.listPhotos.mockResolvedValue([photo(0), photo(1)])

    render(<AlbumPhotos album={album} />)
    await screen.findByLabelText('Choose photos')

    chooseFiles(['three.jpg'])

    await waitFor(() =>
      expect(photosApi.storePhoto).toHaveBeenCalledWith(
        expect.objectContaining({ albumId: 'album-1', sortOrder: 2 }),
      ),
    )
  })

  it('names a file that could not be uploaded', async () => {
    photosApi.storePhoto.mockRejectedValue(new Error('storage unavailable'))

    render(<AlbumPhotos album={album} />)
    await screen.findByLabelText('Choose photos')

    chooseFiles(['one.jpg'])

    expect(await screen.findByText('one.jpg')).toBeInTheDocument()

    // Retries back off for real here, so allow for the full attempt budget.
    const alert = await screen.findByRole('alert', {}, { timeout: 5000 })
    expect(alert).toHaveTextContent('1 photo could not be added.')
    expect(alert).toHaveTextContent('Choosing them again will try once more.')
  })

  it('clears the upload list on request', async () => {
    render(<AlbumPhotos album={album} />)
    await screen.findByLabelText('Choose photos')

    chooseFiles(['one.jpg'])
    await screen.findByText('Added 1 of 1.')

    fireEvent.click(screen.getByRole('button', { name: 'Clear this list' }))

    expect(screen.queryByText('Added 1 of 1.')).not.toBeInTheDocument()
  })
})
