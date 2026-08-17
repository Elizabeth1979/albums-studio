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
    coverPhotoId: null,
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
      covers={new Map()}
      loading={false}
      error={null}
      onCreateAlbum={vi.fn().mockResolvedValue(undefined)}
      onOpenAlbum={vi.fn()}
      {...props}
    />,
  )
}

describe('album covers', () => {
  it('shows the cover photo on the card', () => {
    const { container } = renderLibrary({
      albums: [album({ coverPhotoId: 'photo-7' })],
      covers: new Map([['photo-7', 'https://signed/cover']]),
    })

    const cover = container.querySelector('.album-cover')
    expect(cover?.tagName).toBe('IMG')
    expect(cover).toHaveAttribute('src', 'https://signed/cover')
  })

  it('does not announce the cover, which would repeat the title', () => {
    // The picture and the title live inside one button. Describing the cover
    // would make a screen reader read the album out twice.
    renderLibrary({
      albums: [album({ title: 'Eilat', coverPhotoId: 'photo-7' })],
      covers: new Map([['photo-7', 'https://signed/cover']]),
    })

    expect(screen.queryAllByRole('img')).toHaveLength(0)
    expect(screen.getByRole('button', { name: /Eilat/ })).toBeInTheDocument()
  })

  it('falls back to a placeholder for an album with no photos', () => {
    const { container } = renderLibrary({ albums: [album()] })

    expect(container.querySelector('img.album-cover')).toBeNull()
    expect(container.querySelector('.album-cover.empty')).toBeInTheDocument()
  })

  it('holds the shape of the card while the url is still being signed', () => {
    // Covers arrive one round trip after the albums do. Without a placeholder
    // in the gap the cards would resize under the reader's eye.
    const { container } = renderLibrary({
      albums: [album({ coverPhotoId: 'photo-7' })],
      covers: new Map(),
    })

    expect(container.querySelector('.album-cover.empty')).toBeInTheDocument()
  })

  it('gives each album its own cover', () => {
    const { container } = renderLibrary({
      albums: [
        album({ id: 'a', slug: 'a', title: 'Eilat', coverPhotoId: 'photo-a' }),
        album({ id: 'b', slug: 'b', title: 'Wedding', coverPhotoId: 'photo-b' }),
      ],
      covers: new Map([
        ['photo-a', 'https://signed/a'],
        ['photo-b', 'https://signed/b'],
      ]),
    })

    const covers = [...container.querySelectorAll('img.album-cover')]
    expect(covers.map((image) => image.getAttribute('src'))).toEqual([
      'https://signed/a',
      'https://signed/b',
    ])
  })
})

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
      expect(onCreateAlbum).toHaveBeenCalledWith({
        title: 'Wedding',
        layout: 'masonry',
        description: '',
      }),
    )
  })

  it('creates a grid album when grid is chosen', async () => {
    const onCreateAlbum = vi.fn().mockResolvedValue(undefined)

    renderLibrary({ onCreateAlbum })
    fireEvent.change(screen.getByLabelText('Album title'), { target: { value: 'School trip' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Grid' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create album' }))

    await waitFor(() =>
      expect(onCreateAlbum).toHaveBeenCalledWith({
        title: 'School trip',
        layout: 'grid',
        description: '',
      }),
    )
  })

  it('creates an album with a description', async () => {
    const onCreateAlbum = vi.fn().mockResolvedValue(undefined)

    renderLibrary({ onCreateAlbum })
    fireEvent.change(screen.getByLabelText('Album title'), { target: { value: 'Eilat' } })
    fireEvent.change(screen.getByLabelText(/^Description/), {
      target: { value: 'Red sea, October' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create album' }))

    await waitFor(() =>
      expect(onCreateAlbum).toHaveBeenCalledWith({
        title: 'Eilat',
        layout: 'masonry',
        description: 'Red sea, October',
      }),
    )
  })

  it('clears the form after a successful creation', async () => {
    renderLibrary()
    fireEvent.change(screen.getByLabelText('Album title'), { target: { value: 'Wedding' } })
    fireEvent.change(screen.getByLabelText(/^Description/), { target: { value: 'Notes' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Grid' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create album' }))

    await waitFor(() => expect(screen.getByLabelText('Album title')).toHaveValue(''))
    expect(screen.getByLabelText(/^Description/)).toHaveValue('')
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
