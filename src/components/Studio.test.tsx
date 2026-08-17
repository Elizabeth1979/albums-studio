import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Studio } from './Studio'
import type { Album } from '../lib/albums'

const { albumsApi, photosApi, processorApi } = vi.hoisted(() => ({
  albumsApi: {
    listAlbums: vi.fn(),
    createAlbum: vi.fn(),
    renameAlbum: vi.fn(),
    updateAlbumDetails: vi.fn(),
    setAlbumCover: vi.fn(),
    deleteAlbum: vi.fn(),
  },
  photosApi: {
    listPhotos: vi.fn(),
    storePhoto: vi.fn(),
    signedUrls: vi.fn(),
    thumbnailsByPhotoId: vi.fn(),
  },
  processorApi: { process: vi.fn(), dispose: vi.fn() },
}))

// jsdom has neither Worker nor a canvas, so the real processor would fall back
// to the main thread and then fail to decode. What a photograph becomes is
// AlbumPhotos' subject and the end-to-end suite's; these tests are about how an
// upload reaches the library.
vi.mock('../lib/imaging/processor', () => ({
  createImageProcessor: () => processorApi,
}))

vi.mock('../lib/albums', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/albums')>()),
  ...albumsApi,
}))

vi.mock('../lib/photos', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/photos')>()),
  ...photosApi,
}))

function album(overrides: Partial<Album> = {}): Album {
  return {
    id: 'album-1',
    title: 'Summer by the lake',
    slug: 'summer-by-the-lake',
    layout: 'masonry',
    description: null,
    coverPhotoId: null,
    createdAt: '2026-08-16T10:00:00Z',
    ...overrides,
  }
}

function renderStudio(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Studio identity={{ email: 'person@example.com' }} onSignOut={vi.fn()} />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  albumsApi.listAlbums.mockResolvedValue([])
  photosApi.listPhotos.mockResolvedValue([])
  photosApi.signedUrls.mockResolvedValue(new Map())
  photosApi.thumbnailsByPhotoId.mockResolvedValue(new Map())
  processorApi.process.mockResolvedValue({
    full: new Blob(['full']),
    thumbnail: new Blob(['thumb']),
    width: 2000,
    height: 1500,
    phash: '0'.repeat(64),
    sharpness: 120,
  })
})

describe('Studio', () => {
  it('loads the library on arrival', async () => {
    albumsApi.listAlbums.mockResolvedValue([album()])

    renderStudio()

    expect(await screen.findByText('Summer by the lake')).toBeInTheDocument()
  })

  it('reports a failed load without an empty-library claim', async () => {
    albumsApi.listAlbums.mockRejectedValue(new Error('Network unreachable'))

    renderStudio()

    expect(await screen.findByRole('alert')).toHaveTextContent('Network unreachable')
  })

  it('adds a created album to the list', async () => {
    albumsApi.createAlbum.mockResolvedValue(album({ id: 'new', title: 'Wedding' }))

    renderStudio()
    await screen.findByRole('heading', { name: 'No albums yet' })

    fireEvent.change(screen.getByLabelText('Album title'), { target: { value: 'Wedding' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create album' }))

    expect(await screen.findByText('Wedding')).toBeInTheDocument()
  })

  it('opens an album and comes back', async () => {
    albumsApi.listAlbums.mockResolvedValue([album()])

    renderStudio()
    fireEvent.click(await screen.findByRole('button', { name: /Summer by the lake/ }))

    expect(
      await screen.findByRole('heading', { name: 'Summer by the lake' }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '← All albums' }))
    expect(await screen.findByRole('heading', { name: '1 album' })).toBeInTheDocument()
  })

  it('shows a renamed album under its new title', async () => {
    albumsApi.listAlbums.mockResolvedValue([album()])
    albumsApi.renameAlbum.mockResolvedValue(album({ title: 'Lake days' }))

    renderStudio()
    fireEvent.click(await screen.findByRole('button', { name: /Summer by the lake/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Rename album' }))
    fireEvent.change(screen.getByLabelText('Album title'), { target: { value: 'Lake days' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save title' }))

    expect(await screen.findByRole('heading', { name: 'Lake days' })).toBeInTheDocument()
    expect(albumsApi.renameAlbum).toHaveBeenCalledWith('album-1', 'Lake days')
  })

  it('keeps a switched layout on the open album', async () => {
    albumsApi.listAlbums.mockResolvedValue([album()])
    albumsApi.updateAlbumDetails.mockResolvedValue(album({ layout: 'grid' }))

    renderStudio()
    fireEvent.click(await screen.findByRole('button', { name: /Summer by the lake/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Grid' }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Grid' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    )
    expect(albumsApi.updateAlbumDetails).toHaveBeenCalledWith('album-1', { layout: 'grid' })
  })

  it('opens an album straight from its address', async () => {
    albumsApi.listAlbums.mockResolvedValue([album()])

    renderStudio('/albums/summer-by-the-lake')

    expect(
      await screen.findByRole('heading', { name: 'Summer by the lake' }),
    ).toBeInTheDocument()
  })

  it('reports an address that matches no album', async () => {
    albumsApi.listAlbums.mockResolvedValue([album()])

    renderStudio('/albums/never-existed')

    expect(await screen.findByRole('heading', { name: 'Album not found' })).toBeInTheDocument()
  })

  it('saves an album description', async () => {
    albumsApi.listAlbums.mockResolvedValue([album()])
    albumsApi.updateAlbumDetails.mockResolvedValue(album({ description: 'A week by the water' }))

    renderStudio('/albums/summer-by-the-lake')
    fireEvent.click(await screen.findByRole('button', { name: 'Add a description' }))
    fireEvent.change(screen.getByLabelText('What is this album about?'), {
      target: { value: 'A week by the water' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save description' }))

    await waitFor(() =>
      expect(albumsApi.updateAlbumDetails).toHaveBeenCalledWith('album-1', {
        description: 'A week by the water',
      }),
    )
    expect(await screen.findByText('A week by the water')).toBeInTheDocument()
  })

  it('signs the covers of the albums it listed and shows them', async () => {
    albumsApi.listAlbums.mockResolvedValue([album({ coverPhotoId: 'photo-7' })])
    photosApi.thumbnailsByPhotoId.mockResolvedValue(
      new Map([['photo-7', 'https://signed/cover']]),
    )

    const { container } = renderStudio()

    await waitFor(() =>
      expect(container.querySelector('img.album-cover')).toHaveAttribute(
        'src',
        'https://signed/cover',
      ),
    )
    expect(photosApi.thumbnailsByPhotoId).toHaveBeenCalledWith(['photo-7'])
  })

  it('does not ask for covers when no album has one', async () => {
    albumsApi.listAlbums.mockResolvedValue([album()])

    renderStudio()
    await screen.findByRole('heading', { name: '1 album' })

    expect(photosApi.thumbnailsByPhotoId).not.toHaveBeenCalled()
  })

  it('keeps the library usable when covers cannot be signed', async () => {
    // Titles without pictures still work. An error banner here would be about
    // something the owner cannot act on.
    albumsApi.listAlbums.mockResolvedValue([album({ coverPhotoId: 'photo-7' })])
    photosApi.thumbnailsByPhotoId.mockRejectedValue(new Error('object not found'))

    renderStudio()

    expect(await screen.findByText('Summer by the lake')).toBeInTheDocument()
    await waitFor(() => expect(photosApi.thumbnailsByPhotoId).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not re-sign covers when an unrelated field changes', async () => {
    // Renaming replaces the album object. Signing is a round trip per library
    // view, and the picture on the card did not change.
    albumsApi.listAlbums.mockResolvedValue([album({ coverPhotoId: 'photo-7' })])
    albumsApi.renameAlbum.mockResolvedValue(
      album({ title: 'Lake days', coverPhotoId: 'photo-7' }),
    )
    photosApi.thumbnailsByPhotoId.mockResolvedValue(
      new Map([['photo-7', 'https://signed/cover']]),
    )

    renderStudio()
    fireEvent.click(await screen.findByRole('button', { name: /Summer by the lake/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Rename album' }))
    fireEvent.change(screen.getByLabelText('Album title'), { target: { value: 'Lake days' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save title' }))

    expect(await screen.findByRole('heading', { name: 'Lake days' })).toBeInTheDocument()
    expect(photosApi.thumbnailsByPhotoId).toHaveBeenCalledTimes(1)
  })

  it('shows a cover on the card after the album gets its first photo', async () => {
    // The whole chain: uploading in the album writes the cover, and the library
    // it returns to shows the picture without a page reload.
    albumsApi.listAlbums.mockResolvedValue([album()])
    albumsApi.setAlbumCover.mockResolvedValue(album({ coverPhotoId: 'photo-0' }))
    photosApi.storePhoto.mockResolvedValue({
      id: 'photo-0',
      storagePath: 'owner/album-1/photo-0.jpg',
      thumbnailPath: 'owner/album-1/photo-0-thumb.jpg',
      width: 2000,
      height: 1500,
      caption: null,
      alt: null,
      sortOrder: 0,
    })
    photosApi.thumbnailsByPhotoId.mockResolvedValue(
      new Map([['photo-0', 'https://signed/cover']]),
    )

    const { container } = renderStudio('/albums/summer-by-the-lake')

    const input = await screen.findByLabelText('Choose photos')
    fireEvent.change(input, {
      target: { files: [new File(['bytes'], 'one.jpg', { type: 'image/jpeg' })] },
    })

    await waitFor(() =>
      expect(albumsApi.setAlbumCover).toHaveBeenCalledWith('album-1', 'photo-0'),
    )

    fireEvent.click(screen.getByRole('button', { name: '← All albums' }))

    await waitFor(() =>
      expect(container.querySelector('img.album-cover')).toHaveAttribute(
        'src',
        'https://signed/cover',
      ),
    )
  })

  it('returns to an emptied library after a delete', async () => {
    albumsApi.listAlbums.mockResolvedValue([album()])
    albumsApi.deleteAlbum.mockResolvedValue(undefined)

    renderStudio()
    fireEvent.click(await screen.findByRole('button', { name: /Summer by the lake/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete album' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete this album' }))

    expect(await screen.findByRole('heading', { name: 'No albums yet' })).toBeInTheDocument()
    expect(albumsApi.deleteAlbum).toHaveBeenCalledWith('album-1')
  })
})
