import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAlbum, renameAlbum, slugify } from './albums'

const { auth, from } = vi.hoisted(() => ({
  auth: { getClaims: vi.fn() },
  from: vi.fn(),
}))

vi.mock('./supabase', () => ({ supabase: { auth, from } }))

const ROW = {
  id: 'album-1',
  title: 'Summer by the lake',
  slug: 'summer-by-the-lake',
  layout: 'masonry',
  description: null,
  created_at: '2026-08-16T10:00:00Z',
}

/** Mirrors the postgrest builder shape the module chains onto. */
function insertBuilder(results: { data: unknown; error: unknown }[]) {
  const insert = vi.fn((_values: Record<string, unknown>) => ({
    select: () => ({
      single: () => Promise.resolve(results.shift() ?? { data: null, error: null }),
    }),
  }))

  from.mockReturnValue({ insert })

  return insert
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.getClaims.mockResolvedValue({ data: { claims: { sub: 'owner-1' } }, error: null })
})

describe('slugify', () => {
  it('builds a slug from a plain title', () => {
    expect(slugify('Summer by the Lake')).toBe('summer-by-the-lake')
  })

  it('trims punctuation from the ends', () => {
    expect(slugify('  ¡Hola, mundo!  ')).toBe('hola-mundo')
  })

  it('keeps letters from other scripts instead of emptying the slug', () => {
    expect(slugify('חופשה בים')).toBe('חופשה-בים')
    expect(slugify('夏の思い出')).toBe('夏の思い出')
  })

  it('falls back when a title carries no letters or numbers', () => {
    expect(slugify('🎉🎉🎉')).toBe('album')
    expect(slugify('---')).toBe('album')
  })
})

describe('createAlbum', () => {
  it('stores a trimmed title with its derived slug', async () => {
    const insert = insertBuilder([{ data: ROW, error: null }])

    const created = await createAlbum({ title: '  Summer by the lake  ', layout: 'masonry' })

    expect(insert).toHaveBeenCalledWith({
      owner_id: 'owner-1',
      title: 'Summer by the lake',
      slug: 'summer-by-the-lake',
      layout: 'masonry',
    })
    expect(created.id).toBe('album-1')
  })

  it('finds a free slug when the first one is taken', async () => {
    const insert = insertBuilder([
      { data: null, error: { code: '23505', message: 'duplicate key' } },
      { data: ROW, error: null },
    ])

    await createAlbum({ title: 'Summer by the lake', layout: 'grid' })

    expect(insert).toHaveBeenCalledTimes(2)
    expect(insert.mock.calls[0][0]).toMatchObject({ slug: 'summer-by-the-lake' })
    expect(insert.mock.calls[1][0]).toMatchObject({ slug: 'summer-by-the-lake-2' })
  })

  it('gives up on an error that is not a slug collision', async () => {
    const insert = insertBuilder([
      { data: null, error: { code: '42501', message: 'permission denied' } },
    ])

    await expect(createAlbum({ title: 'Wedding', layout: 'masonry' })).rejects.toThrow(
      'permission denied',
    )
    expect(insert).toHaveBeenCalledOnce()
  })

  it('refuses a blank title before reaching the database', async () => {
    await expect(createAlbum({ title: '   ', layout: 'masonry' })).rejects.toThrow(
      'Give the album a title.',
    )
    expect(from).not.toHaveBeenCalled()
  })

  it('reports an expired session rather than inserting a null owner', async () => {
    auth.getClaims.mockResolvedValue({ data: null, error: null })

    await expect(createAlbum({ title: 'Wedding', layout: 'masonry' })).rejects.toThrow(
      'Your session has expired. Sign in again.',
    )
    expect(from).not.toHaveBeenCalled()
  })
})

describe('renameAlbum', () => {
  it('changes the title and leaves the slug alone', async () => {
    const update = vi.fn(() => ({
      eq: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: { ...ROW, title: 'Lake days' }, error: null }),
        }),
      }),
    }))
    from.mockReturnValue({ update })

    const renamed = await renameAlbum('album-1', '  Lake days  ')

    expect(update).toHaveBeenCalledWith({ title: 'Lake days' })
    expect(renamed.slug).toBe('summer-by-the-lake')
  })

  it('refuses a blank title', async () => {
    await expect(renameAlbum('album-1', '   ')).rejects.toThrow('Give the album a title.')
    expect(from).not.toHaveBeenCalled()
  })
})
