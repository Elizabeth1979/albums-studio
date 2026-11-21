import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpc, createSignedUrls } = vi.hoisted(() => ({
  rpc: vi.fn(),
  createSignedUrls: vi.fn(),
}))

vi.mock('./supabase', () => ({
  supabase: { rpc, storage: { from: () => ({ createSignedUrls }) } },
}))

import { type SearchRow, groupResults, searchLibrary, searchTerms, snippet } from './search'

function row(overrides: Partial<SearchRow>): SearchRow {
  return {
    album_id: 'album-1',
    album_slug: 'usa-2026',
    album_title: 'Usa 2026',
    photo_id: 'photo-1',
    thumbnail_path: 'owner/a/1-thumb.jpg',
    field: 'caption',
    matched_text: 'Grandma at the cake',
    ...overrides,
  }
}

function joined(parts: ReturnType<typeof snippet>) {
  return parts.map((part) => (part.hit ? `[${part.text}]` : part.text)).join('')
}

describe('groupResults', () => {
  it('makes one result of a photo whose caption and story note both match', () => {
    const results = groupResults([
      row({ field: 'caption', matched_text: 'cake' }),
      row({ field: 'story_note', matched_text: 'more cake' }),
      row({ photo_id: 'photo-2', field: 'alt', matched_text: 'a cake' }),
    ])

    expect(results.map((result) => result.key)).toEqual(['photo:photo-1', 'photo:photo-2'])
    expect(results[0].matches.map((match) => match.field)).toEqual(['caption', 'story_note'])
  })

  it('opens the album, not its cover, for a match on the album itself', () => {
    const [result] = groupResults([
      row({ field: 'album_story', photo_id: 'cover-1', thumbnail_path: 'owner/a/c.jpg' }),
    ])

    expect(result.key).toBe('album:album-1')
    expect(result.photoId).toBeNull()
    // The cover is still the picture shown beside it.
    expect(result.thumbnailPath).toBe('owner/a/c.jpg')
  })

  it('keeps an album match apart from a match on its cover photo', () => {
    const results = groupResults([
      row({ field: 'album_title', photo_id: 'photo-1' }),
      row({ field: 'caption', photo_id: 'photo-1' }),
    ])

    expect(results.map((result) => result.key)).toEqual(['album:album-1', 'photo:photo-1'])
  })
})

describe('searchTerms', () => {
  it('splits on any run of whitespace, as the database does', () => {
    expect(searchTerms('  ruth \n cake ')).toEqual(['ruth', 'cake'])
  })
})

describe('snippet', () => {
  it('marks every word found, in any case', () => {
    expect(joined(snippet('Grandma Ruth at the cake', ['ruth', 'CAKE']))).toBe(
      'Grandma [Ruth] at the [cake]',
    )
  })

  it('marks a Hebrew word', () => {
    expect(joined(snippet('Party: יום הולדת שמח', ['הולדת']))).toBe('Party: יום [הולדת] שמח')
  })

  it('reads an answered question as one line', () => {
    expect(joined(snippet('Who lit the candles?\nUncle Avi', ['avi']))).toBe(
      'Who lit the candles? Uncle [Avi]',
    )
  })

  it('shows the part of a long story where the word is, without cutting words', () => {
    const story = `${'We walked along the shore. '.repeat(20)}Then the pumpkins came out. ${'Evening fell slowly. '.repeat(20)}`
    const text = joined(snippet(story, ['pumpkins'], 80))

    expect(text).toContain('[pumpkins]')
    expect(text.startsWith('… ')).toBe(true)
    expect(text.endsWith(' …')).toBe(true)
    // No half words at either edge.
    expect(text).not.toMatch(/^… [a-z]*[^ a-zA-Z.]/)
    expect(text.replace(/^… /, '').split(' ')[0]).toMatch(/^(We|walked|along|the|shore\.)$/)
  })

  it('shows the start of the text when the word is near the start', () => {
    expect(joined(snippet('Cake first, then everything else', ['cake'], 80))).toBe(
      '[Cake] first, then everything else',
    )
  })
})

describe('searchLibrary', () => {
  beforeEach(() => {
    rpc.mockReset()
    createSignedUrls.mockReset()
  })

  it('asks the database with the parameter name it declares, trimmed', async () => {
    rpc.mockResolvedValue({ data: [], error: null })

    await searchLibrary('  cake ')

    expect(rpc).toHaveBeenCalledWith('search_library', { search_text: 'cake' })
  })

  it('signs each picture once, however many results share it', async () => {
    rpc.mockResolvedValue({
      data: [
        row({ field: 'album_title', photo_id: 'photo-1' }),
        row({ field: 'caption', photo_id: 'photo-1' }),
      ],
      error: null,
    })
    createSignedUrls.mockResolvedValue({
      data: [{ path: 'owner/a/1-thumb.jpg', signedUrl: 'https://signed/1' }],
      error: null,
    })

    const { results, thumbnails } = await searchLibrary('usa')

    expect(results).toHaveLength(2)
    expect(createSignedUrls).toHaveBeenCalledWith(['owner/a/1-thumb.jpg'], expect.any(Number))
    expect(thumbnails.get('owner/a/1-thumb.jpg')).toBe('https://signed/1')
  })

  it('fails loudly rather than reporting nothing found', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } })

    await expect(searchLibrary('cake')).rejects.toThrow('permission denied')
  })
})
