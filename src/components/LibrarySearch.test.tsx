import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LibrarySearch } from './LibrarySearch'
import type { SearchResult } from '../lib/search'

const photoResult: SearchResult = {
  key: 'photo:photo-1',
  albumSlug: 'usa-2026',
  albumTitle: 'Usa 2026',
  photoId: 'photo-1',
  thumbnailPath: 'owner/a/1-thumb.jpg',
  matches: [{ field: 'caption', text: 'Carving pumpkins at Eva’s house' }],
}

const albumResult: SearchResult = {
  key: 'album:album-1',
  albumSlug: 'usa-2026',
  albumTitle: 'Usa 2026',
  photoId: null,
  thumbnailPath: null,
  matches: [{ field: 'album_story', text: 'The pumpkins were enormous.' }],
}

function searchFor(text: string) {
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search your words' }), {
    target: { value: text },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Search' }))
}

describe('LibrarySearch', () => {
  it('shows each result with its album, where it matched, and the words found', async () => {
    const search = vi.fn().mockResolvedValue({
      results: [photoResult, albumResult],
      thumbnails: new Map([['owner/a/1-thumb.jpg', 'https://signed/1']]),
    })
    render(<LibrarySearch onOpen={vi.fn()} search={search} />)

    searchFor('pumpkins')

    expect(await screen.findByRole('status')).toHaveTextContent('2 results for “pumpkins”.')
    const list = screen.getByRole('list', { name: 'Results for pumpkins' })
    const [first, second] = within(list).getAllByRole('button')
    expect(first).toHaveTextContent('Photo in Usa 2026')
    expect(first).toHaveTextContent('Caption: Carving pumpkins at Eva’s house')
    expect(within(first).getByText('pumpkins', { selector: 'mark' })).toBeInTheDocument()
    expect(second).toHaveTextContent('Album: Usa 2026')
    expect(search).toHaveBeenCalledWith('pumpkins')
  })

  it('opens a photo in its album, and an album match at the album', async () => {
    const onOpen = vi.fn()
    const search = vi.fn().mockResolvedValue({
      results: [photoResult, albumResult],
      thumbnails: new Map(),
    })
    render(<LibrarySearch onOpen={onOpen} search={search} />)

    searchFor('pumpkins')
    const list = await screen.findByRole('list', { name: 'Results for pumpkins' })
    const [first, second] = within(list).getAllByRole('button')

    fireEvent.click(first)
    expect(onOpen).toHaveBeenLastCalledWith('usa-2026', 'photo-1')
    fireEvent.click(second)
    expect(onOpen).toHaveBeenLastCalledWith('usa-2026', null)
  })

  it('says so when nothing matches', async () => {
    const search = vi.fn().mockResolvedValue({ results: [], thumbnails: new Map() })
    render(<LibrarySearch onOpen={vi.fn()} search={search} />)

    searchFor('zebra')

    expect(await screen.findByText('Nothing you have written matches “zebra”.')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('never lets a failed search look like an empty one', async () => {
    const search = vi.fn().mockRejectedValue(new Error('network down'))
    render(<LibrarySearch onOpen={vi.fn()} search={search} />)

    searchFor('cake')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The search did not run: network down',
    )
    expect(screen.queryByText(/Nothing you have written/)).not.toBeInTheDocument()
  })

  it('does not search for a single letter', () => {
    const search = vi.fn()
    render(<LibrarySearch onOpen={vi.fn()} search={search} />)

    searchFor(' a ')

    expect(search).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('Type at least 2 letters.')
  })
})
