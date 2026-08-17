import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AlbumPhotos } from './AlbumPhotos'
import type { Album } from '../lib/albums'
import type { Photo } from '../lib/photos'

const { photosApi, processorApi, createImageProcessor } = vi.hoisted(() => ({
  photosApi: {
    listPhotos: vi.fn(),
    storePhoto: vi.fn(),
    signedUrls: vi.fn(),
  },
  processorApi: { process: vi.fn(), dispose: vi.fn() },
  createImageProcessor: vi.fn(),
}))

vi.mock('../lib/photos', () => photosApi)
vi.mock('../lib/imaging/processor', () => ({ createImageProcessor }))

const album: Album = {
  id: 'album-1',
  title: 'Eilat',
  slug: 'eilat',
  layout: 'masonry',
  description: null,
  coverPhotoId: null,
  createdAt: '2026-08-16T20:27:38Z',
}

const onCoverChosen = vi.fn()

function renderPhotos(overrides: Partial<Album> = {}) {
  return render(
    <AlbumPhotos album={{ ...album, ...overrides }} onCoverChosen={onCoverChosen} />,
  )
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
  createImageProcessor.mockReturnValue(processorApi)
  onCoverChosen.mockResolvedValue(undefined)
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
    renderPhotos()

    // A phone has nothing to drag, so the control has to be the file input.
    expect(await screen.findByLabelText('Choose photos')).toBeInTheDocument()
  })

  it('shows the empty album in its layout', async () => {
    renderPhotos()

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

    const { container } = renderPhotos()

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

    const { container } = renderPhotos()

    await waitFor(() => expect(container.querySelectorAll('img')).toHaveLength(1))
    expect(screen.queryAllByRole('img')).toHaveLength(0)
  })

  it('announces a photo that does have alt text', async () => {
    photosApi.listPhotos.mockResolvedValue([{ ...photo(0), alt: 'The reef at sunset' }])
    photosApi.signedUrls.mockResolvedValue(
      new Map([['owner/album-1/photo-0-thumb.jpg', 'https://signed/0']]),
    )

    renderPhotos()

    expect(await screen.findByRole('img', { name: 'The reef at sunset' })).toBeInTheDocument()
  })

  it('reports a failed load', async () => {
    photosApi.listPhotos.mockRejectedValue(new Error('Network unreachable'))

    renderPhotos()

    expect(await screen.findByRole('alert')).toHaveTextContent('Network unreachable')
  })

  it('uploads chosen files and counts them as they land', async () => {
    renderPhotos()
    await screen.findByLabelText('Choose photos')

    chooseFiles(['one.jpg', 'two.jpg'])

    await waitFor(() => expect(photosApi.storePhoto).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Added 2 of 2.')).toBeInTheDocument()
  })

  it('numbers new photos after the ones already in the album', async () => {
    photosApi.listPhotos.mockResolvedValue([photo(0), photo(1)])

    renderPhotos()
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

    renderPhotos()
    await screen.findByLabelText('Choose photos')

    chooseFiles(['one.jpg'])

    expect(await screen.findByText('one.jpg')).toBeInTheDocument()

    // Retries back off for real here, so allow for the full attempt budget.
    const alert = await screen.findByRole('alert', {}, { timeout: 5000 })
    expect(alert).toHaveTextContent('1 photo could not be added.')
    expect(alert).toHaveTextContent('Choosing them again will try once more.')
  })

  it('clears the upload list on request', async () => {
    renderPhotos()
    await screen.findByLabelText('Choose photos')

    chooseFiles(['one.jpg'])
    await screen.findByText('Added 1 of 1.')

    fireEvent.click(screen.getByRole('button', { name: 'Clear this list' }))

    expect(screen.queryByText('Added 1 of 1.')).not.toBeInTheDocument()
  })

  describe('the image processor', () => {
    it('is not built until there is a photo to process', () => {
      // It was built in an effect, and a file chosen before that effect ran was
      // dropped without a word: no upload, no error, nothing on screen. Building
      // it on demand is what removes that gap, so the timing is pinned here.
      renderPhotos()

      expect(createImageProcessor).not.toHaveBeenCalled()
    })

    it('is built once and reused across batches', async () => {
      // Starting a worker costs more than the first photo takes to process.
      renderPhotos()
      await screen.findByLabelText('Choose photos')

      chooseFiles(['one.jpg'])
      await screen.findByText('Added 1 of 1.')

      chooseFiles(['two.jpg'])
      await screen.findByText('Added 1 of 1.')

      expect(createImageProcessor).toHaveBeenCalledTimes(1)
    })

    it('is shut down when the screen goes away', async () => {
      const { unmount } = renderPhotos()
      await screen.findByLabelText('Choose photos')

      chooseFiles(['one.jpg'])
      await screen.findByText('Added 1 of 1.')

      unmount()

      expect(processorApi.dispose).toHaveBeenCalledOnce()
    })

    it('leaves nothing to shut down when no photo was ever chosen', () => {
      // The common case: opening an album to look at it. Nothing was started,
      // so there is nothing to tear down.
      const { unmount } = renderPhotos()
      unmount()

      expect(processorApi.dispose).not.toHaveBeenCalled()
    })
  })

  describe('choosing a cover', () => {
    it('makes the first photo the cover of an album that has none', async () => {
      renderPhotos()
      await screen.findByLabelText('Choose photos')

      chooseFiles(['one.jpg'])

      await waitFor(() => expect(onCoverChosen).toHaveBeenCalledWith('photo-0'))
    })

    it('picks the first by position, not the first to finish uploading', async () => {
      // Uploads run four at a time and settle out of order, so the photo that
      // returns first is not necessarily the one at the front of the album.
      photosApi.storePhoto.mockImplementation(async ({ sortOrder }: { sortOrder: number }) => {
        await new Promise((resolve) => setTimeout(resolve, sortOrder === 0 ? 20 : 0))
        return photo(sortOrder)
      })

      renderPhotos()
      await screen.findByLabelText('Choose photos')

      chooseFiles(['one.jpg', 'two.jpg'])

      await waitFor(() => expect(onCoverChosen).toHaveBeenCalledWith('photo-0'))
    })

    it('leaves an album that already has a cover alone', async () => {
      // A cover is a default for an empty album, not a rule that the newest
      // batch wins; otherwise every upload would overwrite a chosen cover.
      photosApi.listPhotos.mockResolvedValue([photo(0)])

      renderPhotos({ coverPhotoId: 'photo-0' })
      await screen.findByLabelText('Choose photos')

      chooseFiles(['two.jpg'])
      await screen.findByText('Added 1 of 1.')

      expect(onCoverChosen).not.toHaveBeenCalled()
    })

    it('asks for no cover when every upload failed', async () => {
      photosApi.storePhoto.mockRejectedValue(new Error('storage unavailable'))

      renderPhotos()
      await screen.findByLabelText('Choose photos')

      chooseFiles(['one.jpg'])
      await screen.findByRole('alert', {}, { timeout: 5000 })

      expect(onCoverChosen).not.toHaveBeenCalled()
    })

    it('keeps the photos when the cover cannot be saved', async () => {
      // The upload succeeded. A failed cover is a cosmetic loss and must not
      // read as though the photographs had not arrived.
      onCoverChosen.mockRejectedValue(new Error('permission denied for column cover_photo_id'))

      renderPhotos()
      await screen.findByLabelText('Choose photos')

      chooseFiles(['one.jpg'])

      expect(await screen.findByText('Added 1 of 1.')).toBeInTheDocument()
      await waitFor(() => expect(onCoverChosen).toHaveBeenCalled())
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })
})
