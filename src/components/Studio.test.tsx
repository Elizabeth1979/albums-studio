import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Studio } from './Studio'
import type { Album } from '../lib/albums'

const { albumsApi } = vi.hoisted(() => ({
  albumsApi: {
    listAlbums: vi.fn(),
    createAlbum: vi.fn(),
    renameAlbum: vi.fn(),
    updateAlbumDetails: vi.fn(),
    deleteAlbum: vi.fn(),
  },
}))

vi.mock('../lib/albums', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/albums')>()),
  ...albumsApi,
}))

function album(overrides: Partial<Album> = {}): Album {
  return {
    id: 'album-1',
    title: 'Summer by the lake',
    slug: 'summer-by-the-lake',
    layout: 'masonry',
    description: null,
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
