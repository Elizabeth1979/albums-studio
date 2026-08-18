import { type ComponentProps } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AlbumPage } from './AlbumPage'

// Photos load their own data and run a worker; AlbumPhotos has its own suite.
// Stubbing it keeps these tests about album metadata.
vi.mock('./AlbumPhotos', () => ({
  AlbumPhotos: () => <div data-testid="album-photos" />,
}))
// ShareAlbum fetches a token of its own; it has its own suite.
vi.mock('./ShareAlbum', () => ({ ShareAlbum: () => <div data-testid="share-album" /> }))
import type { Album } from '../lib/albums'

function album(overrides: Partial<Album> = {}): Album {
  return {
    id: 'album-1',
    title: 'Summer by the lake',
    slug: 'summer-by-the-lake',
    layout: 'masonry',
    description: null,
    coverPhotoId: null,
    visibility: 'private',
    createdAt: '2026-08-16T10:00:00Z',
    ...overrides,
  }
}

function renderAlbumPage(props: Partial<ComponentProps<typeof AlbumPage>> = {}) {
  return render(
    <AlbumPage
      identity={{ email: 'person@example.com' }}
      onSignOut={vi.fn()}
      album={album()}
      onBack={vi.fn()}
      onRename={vi.fn().mockResolvedValue(undefined)}
      onChangeLayout={vi.fn().mockResolvedValue(undefined)}
      onChangeDescription={vi.fn().mockResolvedValue(undefined)}
      onDelete={vi.fn().mockResolvedValue(undefined)}
      onCoverChosen={vi.fn().mockResolvedValue(undefined)}
      onChangeVisibility={vi.fn().mockResolvedValue(undefined)}
      {...props}
    />,
  )
}

describe('AlbumPage', () => {
  it('shows the album title and its current layout', () => {
    renderAlbumPage()

    expect(screen.getByRole('heading', { name: 'Summer by the lake' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Masonry' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByTestId('album-photos')).toBeInTheDocument()
  })

  it('returns to the library', () => {
    const onBack = vi.fn()

    renderAlbumPage({ onBack })
    fireEvent.click(screen.getByRole('button', { name: '← All albums' }))

    expect(onBack).toHaveBeenCalled()
  })

  it('renames the album', async () => {
    const onRename = vi.fn().mockResolvedValue(undefined)

    renderAlbumPage({ onRename })
    fireEvent.click(screen.getByRole('button', { name: 'Rename album' }))
    fireEvent.change(screen.getByLabelText('Album title'), { target: { value: 'Lake days' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save title' }))

    await waitFor(() => expect(onRename).toHaveBeenCalledWith('Lake days'))
  })

  it('refuses to save a blank title', async () => {
    const onRename = vi.fn()

    renderAlbumPage({ onRename })
    fireEvent.click(screen.getByRole('button', { name: 'Rename album' }))
    fireEvent.change(screen.getByLabelText('Album title'), { target: { value: '  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save title' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Give the album a title.')
    expect(onRename).not.toHaveBeenCalled()
  })

  it('stays open for another try when renaming fails', async () => {
    const onRename = vi.fn().mockRejectedValue(new Error('Network unreachable'))

    renderAlbumPage({ onRename })
    fireEvent.click(screen.getByRole('button', { name: 'Rename album' }))
    fireEvent.change(screen.getByLabelText('Album title'), { target: { value: 'Lake days' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save title' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Network unreachable')
    expect(screen.getByLabelText('Album title')).toHaveValue('Lake days')
  })

  it('abandons a rename without saving', () => {
    const onRename = vi.fn()

    renderAlbumPage({ onRename })
    fireEvent.click(screen.getByRole('button', { name: 'Rename album' }))
    fireEvent.change(screen.getByLabelText('Album title'), { target: { value: 'Discarded' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onRename).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Summer by the lake' })).toBeInTheDocument()
  })

  it('switches the layout', async () => {
    const onChangeLayout = vi.fn().mockResolvedValue(undefined)

    renderAlbumPage({ onChangeLayout })
    fireEvent.click(screen.getByRole('button', { name: 'Grid' }))

    await waitFor(() => expect(onChangeLayout).toHaveBeenCalledWith('grid'))
  })

  it('does not rewrite the layout that is already set', () => {
    const onChangeLayout = vi.fn()

    renderAlbumPage({ onChangeLayout })
    fireEvent.click(screen.getByRole('button', { name: 'Masonry' }))

    expect(onChangeLayout).not.toHaveBeenCalled()
  })

  it('describes the grid layout when the album uses it', () => {
    renderAlbumPage({ album: album({ layout: 'grid' }) })

    expect(screen.getByRole('button', { name: 'Grid' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/Equal tiles/)).toBeInTheDocument()
  })

  it('invites a description when the album has none', () => {
    renderAlbumPage()

    expect(screen.getByText('No description yet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add a description' })).toBeInTheDocument()
  })

  it('shows an existing description and offers to edit it', () => {
    renderAlbumPage({ album: album({ description: 'A week by the water' }) })

    expect(screen.getByText('A week by the water')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit description' })).toBeInTheDocument()
  })

  it('saves a description', async () => {
    const onChangeDescription = vi.fn().mockResolvedValue(undefined)

    renderAlbumPage({ onChangeDescription })
    fireEvent.click(screen.getByRole('button', { name: 'Add a description' }))
    fireEvent.change(screen.getByLabelText('What is this album about?'), {
      target: { value: 'A week by the water' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save description' }))

    await waitFor(() => expect(onChangeDescription).toHaveBeenCalledWith('A week by the water'))
  })

  it('allows a description to be cleared', async () => {
    const onChangeDescription = vi.fn().mockResolvedValue(undefined)

    renderAlbumPage({ album: album({ description: 'Remove me' }), onChangeDescription })
    fireEvent.click(screen.getByRole('button', { name: 'Edit description' }))
    fireEvent.change(screen.getByLabelText('What is this album about?'), {
      target: { value: '' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save description' }))

    await waitFor(() => expect(onChangeDescription).toHaveBeenCalledWith(''))
  })

  it('never deletes on a single click', () => {
    const onDelete = vi.fn()

    renderAlbumPage({ onDelete })
    fireEvent.click(screen.getByRole('button', { name: 'Delete album' }))

    expect(onDelete).not.toHaveBeenCalled()
    expect(
      screen.getByRole('button', { name: 'Yes, delete this album' }),
    ).toBeInTheDocument()
  })

  it('deletes once the confirmation is given', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined)

    renderAlbumPage({ onDelete })
    fireEvent.click(screen.getByRole('button', { name: 'Delete album' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete this album' }))

    await waitFor(() => expect(onDelete).toHaveBeenCalled())
  })

  it('backs out of a delete', () => {
    const onDelete = vi.fn()

    renderAlbumPage({ onDelete })
    fireEvent.click(screen.getByRole('button', { name: 'Delete album' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }))

    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Delete album' })).toBeInTheDocument()
  })
})
