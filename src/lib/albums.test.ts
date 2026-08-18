import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAlbum,
  deleteAlbum,
  listAlbums,
  renameAlbum,
  setAlbumCover,
  slugify,
  updateAlbumDetails,
} from './albums'

const { auth, from, storage } = vi.hoisted(() => ({
  auth: { getClaims: vi.fn() },
  from: vi.fn(),
  storage: { from: vi.fn() },
}))

// Deleting an album now reaches Storage as well as the tables, through the
// helpers in ./photos, which share this client.
vi.mock('./supabase', () => ({ supabase: { auth, from, storage } }))

const ROW = {
  id: 'album-1',
  title: 'Summer by the lake',
  slug: 'summer-by-the-lake',
  layout: 'masonry',
  description: null,
  cover_photo_id: null,
  visibility: 'private',
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
      description: null,
    })
    expect(created.id).toBe('album-1')
  })

  it('stores a trimmed description, or null when it is blank', async () => {
    const insert = insertBuilder([{ data: ROW, error: null }, { data: ROW, error: null }])

    await createAlbum({ title: 'Eilat', layout: 'masonry', description: '  Red sea  ' })
    expect(insert.mock.calls[0][0]).toMatchObject({ description: 'Red sea' })

    await createAlbum({ title: 'Eilat', layout: 'masonry', description: '   ' })
    expect(insert.mock.calls[1][0]).toMatchObject({ description: null })
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

function updateBuilder(row: object) {
  const update = vi.fn((_patch: Record<string, unknown>) => ({
    eq: () => ({
      select: () => ({ single: () => Promise.resolve({ data: row, error: null }) }),
    }),
  }))
  from.mockReturnValue({ update })
  return update
}

describe('updateAlbumDetails', () => {
  it('writes only the fields it was given', async () => {
    const update = updateBuilder({ ...ROW, layout: 'grid' })

    await updateAlbumDetails('album-1', { layout: 'grid' })

    expect(update).toHaveBeenCalledWith({ layout: 'grid' })
  })

  it('trims a description', async () => {
    const update = updateBuilder({ ...ROW, description: 'A week by the water' })

    await updateAlbumDetails('album-1', { description: '  A week by the water  ' })

    expect(update).toHaveBeenCalledWith({ description: 'A week by the water' })
  })

  it('stores a cleared description as null rather than an empty string', async () => {
    const update = updateBuilder({ ...ROW, description: null })

    await updateAlbumDetails('album-1', { description: '   ' })

    expect(update).toHaveBeenCalledWith({ description: null })
  })

  it('can change layout and description together', async () => {
    const update = updateBuilder({ ...ROW, layout: 'grid', description: 'Both' })

    await updateAlbumDetails('album-1', { layout: 'grid', description: 'Both' })

    expect(update).toHaveBeenCalledWith({ layout: 'grid', description: 'Both' })
  })
})

describe('setAlbumCover', () => {
  it('points the album at the chosen photo', async () => {
    const update = updateBuilder({ ...ROW, cover_photo_id: 'photo-7' })

    const album = await setAlbumCover('album-1', 'photo-7')

    expect(update).toHaveBeenCalledWith({ cover_photo_id: 'photo-7' })
    expect(album.coverPhotoId).toBe('photo-7')
  })

  it('reports a cover the database refused', async () => {
    // The composite foreign key rejects a photo from another album or owner.
    const update = vi.fn(() => ({
      eq: () => ({
        select: () => ({
          single: () =>
            Promise.resolve({
              data: null,
              error: { message: 'violates foreign key constraint' },
            }),
        }),
      }),
    }))
    from.mockReturnValue({ update })

    await expect(setAlbumCover('album-1', 'someone-elses-photo')).rejects.toThrow(
      'violates foreign key constraint',
    )
  })
})

describe('listAlbums', () => {
  it('carries the cover through, so the library can show one', async () => {
    // The column is easy to drop from the select list by accident, and nothing
    // else fails when it is: covers just quietly stop appearing.
    from.mockReturnValue({
      select: (columns: string) => {
        expect(columns).toContain('cover_photo_id')
        return {
          order: () =>
            Promise.resolve({ data: [{ ...ROW, cover_photo_id: 'photo-7' }], error: null }),
        }
      },
    })

    const albums = await listAlbums()

    expect(albums[0].coverPhotoId).toBe('photo-7')
  })
})

describe('deleteAlbum', () => {
  type Row = { storage_path: string; thumbnail_path: string | null }

  /**
   * Wires both tables and the bucket, and records the order things happened in.
   * The order is the whole point: bytes must go after the rows, never before.
   */
  function deletion(rows: Row[], failures: { onDelete?: string; onRemove?: string } = {}) {
    const order: string[] = []

    const remove = vi.fn(async (_paths: string[]) => {
      order.push('remove objects')
      if (failures.onRemove) throw new Error(failures.onRemove)
      return { error: null }
    })

    const eq = vi.fn(async () => {
      order.push('delete rows')
      return { error: failures.onDelete ? { message: failures.onDelete } : null }
    })

    from.mockImplementation((table: string) =>
      table === 'photos'
        ? {
            select: () => ({
              eq: () => {
                order.push('read paths')
                return Promise.resolve({ data: rows, error: null })
              },
            }),
          }
        : { delete: () => ({ eq }) },
    )
    storage.from.mockReturnValue({ remove })

    return { remove, order }
  }

  const ROWS: Row[] = [
    { storage_path: 'owner/a/1.jpg', thumbnail_path: 'owner/a/1-thumb.jpg' },
    { storage_path: 'owner/a/2.jpg', thumbnail_path: 'owner/a/2-thumb.jpg' },
  ]

  it('removes the stored bytes, not only the rows', async () => {
    // The rows cascade on their own; Storage has no foreign keys, so without
    // this the photographs stay in the bucket for good and the confirmation
    // that said otherwise was a lie.
    const { remove } = deletion(ROWS)

    await deleteAlbum('album-1')

    expect(remove).toHaveBeenCalledWith([
      'owner/a/1.jpg',
      'owner/a/1-thumb.jpg',
      'owner/a/2.jpg',
      'owner/a/2-thumb.jpg',
    ])
  })

  it('reads the paths before the rows go, and deletes bytes after', async () => {
    // Reversing the last two would, when the row delete fails, leave an album
    // whose every photo is a broken image — worse than the leak being fixed.
    const { order } = deletion(ROWS)

    await deleteAlbum('album-1')

    expect(order).toEqual(['read paths', 'delete rows', 'remove objects'])
  })

  it('destroys nothing when the album could not be deleted', async () => {
    const { remove } = deletion(ROWS, { onDelete: 'permission denied for table albums' })

    await expect(deleteAlbum('album-1')).rejects.toThrow('permission denied')
    expect(remove).not.toHaveBeenCalled()
  })

  it('still reports success when the bytes could not be removed', async () => {
    // The album is gone. Telling the owner the delete failed would be false,
    // and there is nothing they could do about it anyway.
    deletion(ROWS, { onRemove: 'storage unavailable' })

    await expect(deleteAlbum('album-1')).resolves.toBeUndefined()
  })

  it('asks Storage for nothing when the album held no photos', async () => {
    const { remove } = deletion([])

    await deleteAlbum('album-1')

    expect(remove).not.toHaveBeenCalled()
  })

  it('copes with a photo that never got a thumbnail', async () => {
    const { remove } = deletion([{ storage_path: 'owner/a/1.jpg', thumbnail_path: null }])

    await deleteAlbum('album-1')

    expect(remove).toHaveBeenCalledWith(['owner/a/1.jpg'])
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
