import { type ComponentProps } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Library } from './Library'
import type { Album } from '../lib/albums'

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

function renderLibrary(props: Partial<ComponentProps<typeof Library>> = {}) {
  return render(
    <Library
      identity={{ email: 'person@example.com' }}
      onSignOut={vi.fn()}
      albums={[]}
      loading={false}
      error={null}
      onCreateAlbum={vi.fn().mockResolvedValue(undefined)}
      onOpenAlbum={vi.fn()}
      {...props}
    />,
  )
}

describe('Library', () => {
  it('renders the protected empty state and signs out', async () => {
    const onSignOut = vi.fn().mockResolvedValue(undefined)

    renderLibrary({ onSignOut })

    expect(screen.getByRole('heading', { name: 'No albums yet' })).toBeInTheDocument()
    expect(screen.getByText('person@example.com')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(onSignOut).toHaveBeenCalledOnce())
  })

  it('creates a masonry album by default', async () => {
    const onCreateAlbum = vi.fn().mockResolvedValue(undefined)

    renderLibrary({ onCreateAlbum })
    fireEvent.change(screen.getByLabelText('Album title'), { target: { value: 'Wedding' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create album' }))

    await waitFor(() =>
      expect(onCreateAlbum).toHaveBeenCalledWith({ title: 'Wedding', layout: 'masonry' }),
    )
  })

  it('creates a grid album when grid is chosen', async () => {
    const onCreateAlbum = vi.fn().mockResolvedValue(undefined)

    renderLibrary({ onCreateAlbum })
    fireEvent.change(screen.getByLabelText('Album title'), { target: { value: 'School trip' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Grid' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create album' }))

    await waitFor(() =>
      expect(onCreateAlbum).toHaveBeenCalledWith({ title: 'School trip', layout: 'grid' }),
    )
  })

  it('clears the form after a successful creation', async () => {
    renderLibrary()
    fireEvent.change(screen.getByLabelText('Album title'), { target: { value: 'Wedding' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Grid' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create album' }))

    await waitFor(() => expect(screen.getByLabelText('Album title')).toHaveValue(''))
    expect(screen.getByRole('radio', { name: 'Masonry' })).toBeChecked()
  })

  it('refuses a blank title without calling the server', async () => {
    const onCreateAlbum = vi.fn()

    renderLibrary({ onCreateAlbum })
    fireEvent.change(screen.getByLabelText('Album title'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create album' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Give the album a title.')
    expect(onCreateAlbum).not.toHaveBeenCalled()
  })

  it('keeps what was typed when creation fails', async () => {
    const onCreateAlbum = vi.fn().mockRejectedValue(new Error('Network unreachable'))

    renderLibrary({ onCreateAlbum })
    fireEvent.change(screen.getByLabelText('Album title'), { target: { value: 'Wedding' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create album' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Network unreachable')
    expect(screen.getByLabelText('Album title')).toHaveValue('Wedding')
  })

  it('lists albums with their layout and count', () => {
    renderLibrary({
      albums: [
        album(),
        album({ id: 'album-2', title: 'School trip', layout: 'grid' }),
      ],
    })

    expect(screen.getByRole('heading', { name: '2 albums' })).toBeInTheDocument()

    // Scoped to the list: "Masonry" and "Grid" also label the create form's
    // layout radios.
    const list = within(screen.getByRole('list'))
    expect(list.getByText('Summer by the lake')).toBeInTheDocument()
    expect(list.getByText('Masonry')).toBeInTheDocument()
    expect(list.getByText('Grid')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'No albums yet' })).not.toBeInTheDocument()
  })

  it('counts a single album in the singular', () => {
    renderLibrary({ albums: [album()] })
    expect(screen.getByRole('heading', { name: '1 album' })).toBeInTheDocument()
  })

  it('opens an album when its card is clicked', () => {
    const onOpenAlbum = vi.fn()
    const only = album()

    renderLibrary({ albums: [only], onOpenAlbum })
    fireEvent.click(screen.getByRole('button', { name: /Summer by the lake/ }))

    expect(onOpenAlbum).toHaveBeenCalledWith(only)
  })

  it('reports a load failure', () => {
    renderLibrary({ error: 'Could not load your albums.' })
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load your albums.')
  })

  it('shows a loading state instead of an empty library', () => {
    renderLibrary({ loading: true })

    expect(screen.getByText('Opening your library…')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'No albums yet' })).not.toBeInTheDocument()
  })
})
