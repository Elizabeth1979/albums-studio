import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createStory, deleteStory, listStories, updateStory } from './stories'

const { auth, from } = vi.hoisted(() => ({
  auth: { getClaims: vi.fn() },
  from: vi.fn(),
}))

vi.mock('./supabase', () => ({ supabase: { auth, from } }))

const OWNER = '00000000-0000-4000-8000-000000000001'

const ROW = {
  id: 'story-1',
  photo_id: 'photo-1',
  body: 'The cake was my aunt’s recipe.',
  visibility: 'hidden',
  created_at: '2026-08-17T10:00:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.getClaims.mockResolvedValue({ data: { claims: { sub: OWNER } }, error: null })
})

describe('listStories', () => {
  it('asks for every photo at once, oldest first', async () => {
    // One request for the album rather than one per photograph: forty photos
    // would otherwise mean forty round trips to show a handful of notes.
    const order = vi.fn().mockResolvedValue({ data: [ROW], error: null })
    const inFilter = vi.fn(() => ({ order }))
    from.mockReturnValue({ select: () => ({ in: inFilter }) })

    const stories = await listStories(['photo-1', 'photo-2'])

    expect(inFilter).toHaveBeenCalledWith('photo_id', ['photo-1', 'photo-2'])
    expect(order).toHaveBeenCalledWith('created_at', { ascending: true })
    expect(stories[0]).toMatchObject({ id: 'story-1', photoId: 'photo-1' })
  })

  it('asks for nothing when the album is empty', async () => {
    expect(await listStories([])).toEqual([])
    expect(from).not.toHaveBeenCalled()
  })

  it('reports a failed read rather than pretending there are none', async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: { message: 'timeout' } })
    from.mockReturnValue({ select: () => ({ in: () => ({ order }) }) })

    await expect(listStories(['photo-1'])).rejects.toThrow('timeout')
  })
})

describe('createStory', () => {
  function insertBuilder(result: { data: unknown; error: unknown } = { data: ROW, error: null }) {
    const insert = vi.fn((_values: Record<string, unknown>) => ({
      select: () => ({ single: () => Promise.resolve(result) }),
    }))

    from.mockReturnValue({ insert })

    return insert
  }

  it('stores the trimmed text against the photo and the signed-in owner', async () => {
    const insert = insertBuilder()

    await createStory({ photoId: 'photo-1', body: '  A long day.  ', visibility: 'hidden' })

    expect(insert).toHaveBeenCalledWith({
      photo_id: 'photo-1',
      owner_id: OWNER,
      body: 'A long day.',
      visibility: 'hidden',
    })
  })

  it('refuses a blank story before reaching the database', async () => {
    // The check constraint would refuse it too, but the owner deserves a
    // sentence rather than the name of a constraint.
    insertBuilder()

    await expect(
      createStory({ photoId: 'photo-1', body: '   ', visibility: 'hidden' }),
    ).rejects.toThrow('Write the story before saving it.')

    expect(from).not.toHaveBeenCalled()
  })

  it('can publish a story with the album', async () => {
    const insert = insertBuilder()

    await createStory({ photoId: 'photo-1', body: 'A long day.', visibility: 'visible' })

    expect(insert.mock.calls[0][0].visibility).toBe('visible')
  })

  it('reports a refused insert', async () => {
    insertBuilder({ data: null, error: { message: 'violates foreign key constraint' } })

    await expect(
      createStory({ photoId: 'someone-elses-photo', body: 'x', visibility: 'hidden' }),
    ).rejects.toThrow('violates foreign key constraint')
  })
})

describe('updateStory', () => {
  function updateBuilder(row: object = ROW) {
    const update = vi.fn((_patch: Record<string, unknown>) => ({
      eq: () => ({
        select: () => ({ single: () => Promise.resolve({ data: row, error: null }) }),
      }),
    }))

    from.mockReturnValue({ update })

    return update
  }

  it('writes only the fields it was given', async () => {
    // Publishing a story must not rewrite its text, and vice versa.
    const update = updateBuilder()

    await updateStory('story-1', { visibility: 'visible' })

    expect(update).toHaveBeenCalledWith({ visibility: 'visible' })
  })

  it('trims edited text', async () => {
    const update = updateBuilder()

    await updateStory('story-1', { body: '  Edited.  ' })

    expect(update).toHaveBeenCalledWith({ body: 'Edited.' })
  })

  it('refuses to empty a story instead of deleting it', async () => {
    // Blanking the text would leave a row the database will not accept, and an
    // empty note is not what the owner meant.
    updateBuilder()

    await expect(updateStory('story-1', { body: '  ' })).rejects.toThrow(
      'Write the story before saving it.',
    )
    expect(from).not.toHaveBeenCalled()
  })
})

describe('deleteStory', () => {
  it('removes one story', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null })
    const del = vi.fn(() => ({ eq }))
    from.mockReturnValue({ delete: del })

    await deleteStory('story-1')

    expect(eq).toHaveBeenCalledWith('id', 'story-1')
  })

  it('reports a refused delete', async () => {
    const eq = vi.fn().mockResolvedValue({ error: { message: 'permission denied' } })
    from.mockReturnValue({ delete: () => ({ eq }) })

    await expect(deleteStory('story-1')).rejects.toThrow('permission denied')
  })
})
