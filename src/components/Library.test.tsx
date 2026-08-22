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
    description: null,
    coverPhotoId: null,
    visibility: 'private',
    createdAt: '2026-08-16T10:00:00Z',
    ...overrides,
  }
}

/**
 * Opens the create-album form, which is behind a button now: the library's own
 * albums come first on the page, and the form pushed them off a phone screen.
 */
function startAlbum() {
  fireEvent.click(
    screen.getByRole('button', { name: /New album|Start your first album/ }),
  )
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
    startAlbum()
    fireEvent.change(screen.getByLabelText('Album title'), { target: { value: 'Wedding' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create album' }))

    await waitFor(() =>
      expect(onCreateAlbum).toHaveBeenCalledWith({
        title: 'Wedding',
            description: '',
      }),
    )
  })

  it('asks for no layout, and sends none', async () => {
    // The column keeps its own default. A form that chose one would be writing
    // a decision the product no longer offers.
    const onCreateAlbum = vi.fn().mockResolvedValue(undefined)

    renderLibrary({ onCreateAlbum })
    startAlbum()

    expect(screen.queryByRole('radio', { name: 'Masonry' })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Grid' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Album title'), { target: { value: 'School trip' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create album' }))

    await waitFor(() => expect(onCreateAlbum).toHaveBeenCalled())
    expect(onCreateAlbum.mock.calls[0][0]).not.toHaveProperty('layout')
  })

  it('creates an album with a description', async () => {
    const onCreateAlbum = vi.fn().mockResolvedValue(undefined)

    renderLibrary({ onCreateAlbum })
    startAlbum()
    fireEvent.change(screen.getByLabelText('Album title'), { target: { value: 'Eilat' } })
    fireEvent.change(screen.getByLabelText(/^Description/), {
      target: { value: 'Red sea, October' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create album' }))

    await waitFor(() =>
      expect(onCreateAlbum).toHaveBeenCalledWith({
        title: 'Eilat',
            description: 'Red sea, October',
      }),
    )
  })

  it('says the album was added, rather than leaving the page looking unchanged', async () => {
    // The form closes and the page does not move, so on a phone the new row can
    // be below the fold. Without this the only feedback is a field going blank.
    renderLibrary()
    startAlbum()
    fireEvent.change(screen.getByLabelText('Album title'), { target: { value: 'Wedding' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create album' }))

    const said = await screen.findByRole('status')
    expect(said).toHaveTextContent('Added Wedding to your library.')
  })

  it('puts the form away once the album exists', async () => {
    renderLibrary()
    startAlbum()
    fireEvent.change(screen.getByLabelText('Album title'), { target: { value: 'Wedding' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create album' }))

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Create album' })).not.toBeInTheDocument(),
    )
  })

  it('carries nothing over into the next album', async () => {
    renderLibrary()
    startAlbum()
    fireEvent.change(screen.getByLabelText('Album title'), { target: { value: 'Wedding' } })
    fireEvent.change(screen.getByLabelText(/^Description/), { target: { value: 'Notes' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create album' }))

    await screen.findByRole('status')
    startAlbum()

    expect(screen.getByLabelText('Album title')).toHaveValue('')
    expect(screen.getByLabelText(/^Description/)).toHaveValue('')
  })

  it('refuses a blank title without calling the server', async () => {
    const onCreateAlbum = vi.fn()

    renderLibrary({ onCreateAlbum })
    startAlbum()
    fireEvent.change(screen.getByLabelText('Album title'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create album' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Give the album a title.')
    expect(onCreateAlbum).not.toHaveBeenCalled()
  })

  it('keeps what was typed when creation fails', async () => {
    const onCreateAlbum = vi.fn().mockRejectedValue(new Error('Network unreachable'))

    renderLibrary({ onCreateAlbum })
    startAlbum()
    fireEvent.change(screen.getByLabelText('Album title'), { target: { value: 'Wedding' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create album' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Network unreachable')
    expect(screen.getByLabelText('Album title')).toHaveValue('Wedding')
  })

  it('lists albums and counts them', () => {
    renderLibrary({
      albums: [album(), album({ id: 'album-2', title: 'School trip' })],
    })

    expect(screen.getByRole('heading', { name: '2 albums' })).toBeInTheDocument()

    const list = within(screen.getByRole('list'))
    expect(list.getByText('Summer by the lake')).toBeInTheDocument()
    expect(list.getByText('School trip')).toBeInTheDocument()

    // No layout badge: a card cannot advertise a choice the album no longer has.
    expect(list.queryByText('Masonry')).not.toBeInTheDocument()
    expect(list.queryByText('Grid')).not.toBeInTheDocument()
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
