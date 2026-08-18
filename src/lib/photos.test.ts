import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type Photo,
  deletePhoto,
  listPhotos,
  signedUrls,
  storePhoto,
  swapPhotoOrder,
  thumbnailsByPhotoId,
  updatePhotoText,
} from './photos'

const { auth, from, storage } = vi.hoisted(() => ({
  auth: { getClaims: vi.fn() },
  from: vi.fn(),
  storage: { from: vi.fn() },
}))

vi.mock('./supabase', () => ({ supabase: { auth, from, storage } }))

const OWNER = '00000000-0000-4000-8000-000000000001'

const ROW = {
  id: 'photo-1',
  storage_path: `${OWNER}/album-1/abc.jpg`,
  thumbnail_path: `${OWNER}/album-1/abc-thumb.jpg`,
  width: 2000,
  height: 1500,
  caption: null,
  caption_visibility: 'hidden',
  alt: null,
  sort_order: 0,
}

const image = {
  full: new Blob(['full']),
  thumbnail: new Blob(['thumb']),
  width: 2000,
  height: 1500,
  phash: '1'.repeat(64),
  sharpness: 143.5,
}

/** Mirrors the Storage client surface `storePhoto` chains onto. */
function bucket(overrides: { uploads?: { error: unknown }[] } = {}) {
  const queued = [...(overrides.uploads ?? [])]
  // Parameters are declared so mock.calls stays typed rather than a bare tuple.
  const upload = vi.fn(async (_path: string, _body: Blob, _options?: unknown) =>
    queued.shift() ?? { error: null },
  )
  const remove = vi.fn(async (_paths: string[]) => ({ error: null }))
  const createSignedUrls = vi.fn()

  storage.from.mockReturnValue({ upload, remove, createSignedUrls })

  return { upload, remove, createSignedUrls }
}

function table(result: { data: unknown; error: unknown }) {
  const insert = vi.fn((_values: Record<string, unknown>) => ({
    select: () => ({ single: () => Promise.resolve(result) }),
  }))

  from.mockReturnValue({ insert })

  return insert
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.getClaims.mockResolvedValue({ data: { claims: { sub: OWNER } }, error: null })
})

describe('storePhoto', () => {
  it('writes both objects under the owner prefix and records the measurements', async () => {
    const { upload } = bucket()
    const insert = table({ data: ROW, error: null })

    const stored = await storePhoto({ albumId: 'album-1', image, sortOrder: 3 })

    expect(upload).toHaveBeenCalledTimes(2)
    for (const [path] of upload.mock.calls) {
      expect(path.startsWith(`${OWNER}/album-1/`)).toBe(true)
    }

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        album_id: 'album-1',
        owner_id: OWNER,
        mime: 'image/jpeg',
        width: 2000,
        height: 1500,
        phash: '1'.repeat(64),
        sharpness: 143.5,
        sort_order: 3,
      }),
    )
    expect(stored.id).toBe('photo-1')
  })

  it('removes the full image when the thumbnail cannot be written', async () => {
    // Otherwise a retry leaves a full-size object behind that nothing references.
    const { upload, remove } = bucket({
      uploads: [{ error: null }, { error: { message: 'thumbnail rejected' } }],
    })

    await expect(storePhoto({ albumId: 'album-1', image, sortOrder: 0 })).rejects.toThrow(
      'thumbnail rejected',
    )

    expect(upload).toHaveBeenCalledTimes(2)
    expect(remove).toHaveBeenCalledOnce()
    expect(remove.mock.calls[0][0]).toHaveLength(1)
    expect(from).not.toHaveBeenCalled()
  })

  it('removes both objects when the row is refused', async () => {
    const { remove } = bucket()
    table({ data: null, error: { message: 'permission denied for table photos' } })

    await expect(storePhoto({ albumId: 'album-1', image, sortOrder: 0 })).rejects.toThrow(
      'permission denied',
    )

    expect(remove).toHaveBeenCalledOnce()
    expect(remove.mock.calls[0][0]).toHaveLength(2)
  })

  it('does not upload anything without a session', async () => {
    auth.getClaims.mockResolvedValue({ data: null, error: null })
    const { upload } = bucket()

    await expect(storePhoto({ albumId: 'album-1', image, sortOrder: 0 })).rejects.toThrow(
      'session has expired',
    )
    expect(upload).not.toHaveBeenCalled()
  })

  it('gives each photo its own object key', async () => {
    const { upload } = bucket()
    table({ data: ROW, error: null })

    await storePhoto({ albumId: 'album-1', image, sortOrder: 0 })
    const first = upload.mock.calls[0][0]

    upload.mockClear()
    await storePhoto({ albumId: 'album-1', image, sortOrder: 1 })
    const second = upload.mock.calls[0][0]

    expect(first).not.toBe(second)
  })
})

describe('signedUrls', () => {
  it('maps each path to its url', async () => {
    const { createSignedUrls } = bucket()
    createSignedUrls.mockResolvedValue({
      data: [
        { path: 'a.jpg', signedUrl: 'https://signed/a' },
        { path: 'b.jpg', signedUrl: 'https://signed/b' },
      ],
      error: null,
    })

    const urls = await signedUrls(['a.jpg', 'b.jpg'])

    expect(urls.get('a.jpg')).toBe('https://signed/a')
    expect(urls.get('b.jpg')).toBe('https://signed/b')
  })

  it('asks for nothing when there is nothing to sign', async () => {
    const { createSignedUrls } = bucket()

    expect((await signedUrls([])).size).toBe(0)
    expect(createSignedUrls).not.toHaveBeenCalled()
  })

  it('skips an entry the service could not sign', async () => {
    const { createSignedUrls } = bucket()
    createSignedUrls.mockResolvedValue({
      data: [
        { path: 'a.jpg', signedUrl: 'https://signed/a' },
        { path: 'b.jpg', signedUrl: null },
      ],
      error: null,
    })

    const urls = await signedUrls(['a.jpg', 'b.jpg'])

    expect(urls.size).toBe(1)
    expect(urls.has('b.jpg')).toBe(false)
  })

  it('reports a failure rather than returning an empty map', async () => {
    const { createSignedUrls } = bucket()
    createSignedUrls.mockResolvedValue({ data: null, error: { message: 'object not found' } })

    await expect(signedUrls(['a.jpg'])).rejects.toThrow('object not found')
  })
})

describe('updatePhotoText', () => {
  /** Mirrors the `.update().eq().select().single()` chain. */
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
    // The alt-text field and the caption field are saved by the same form today,
    // but a partial patch must never blank the half it was not shown.
    const update = updateBuilder()

    await updatePhotoText('photo-1', { caption: 'Dinner on the last night' })

    expect(update).toHaveBeenCalledWith({ caption: 'Dinner on the last night' })
  })

  it('stores cleared text as null rather than an empty string', async () => {
    // Otherwise "never written" and "deleted" are two states that read alike.
    const update = updateBuilder()

    await updatePhotoText('photo-1', { caption: '   ' })

    expect(update).toHaveBeenCalledWith({ caption: null })
  })

  it('trims surrounding whitespace', async () => {
    const update = updateBuilder()

    await updatePhotoText('photo-1', { caption: '  Dinner  ' })

    expect(update).toHaveBeenCalledWith({ caption: 'Dinner' })
  })

  it('records that a person wrote the alt text', async () => {
    // Phase 5 drafts alt text with AI. The two have to stay distinguishable, or
    // a suggestion will one day overwrite a sentence someone chose carefully.
    const update = updateBuilder()

    await updatePhotoText('photo-1', { alt: 'Two children on a jetty' })

    expect(update).toHaveBeenCalledWith({
      alt: 'Two children on a jetty',
      alt_source: 'human',
    })
  })

  it('clears the authorship when the alt text is removed', async () => {
    const update = updateBuilder()

    await updatePhotoText('photo-1', { alt: '' })

    expect(update).toHaveBeenCalledWith({ alt: null, alt_source: null })
  })

  it('changes caption visibility without touching the caption', async () => {
    // Publishing a caption you already wrote should not require retyping it.
    const update = updateBuilder()

    await updatePhotoText('photo-1', { captionVisibility: 'visible' })

    expect(update).toHaveBeenCalledWith({ caption_visibility: 'visible' })
  })

  it('returns the stored photo, including its visibility', async () => {
    updateBuilder({ ...ROW, caption: 'Dinner', caption_visibility: 'visible' })

    const photo = await updatePhotoText('photo-1', { caption: 'Dinner' })

    expect(photo.caption).toBe('Dinner')
    expect(photo.captionVisibility).toBe('visible')
  })

  it('reports a refused write', async () => {
    const update = vi.fn(() => ({
      eq: () => ({
        select: () => ({
          single: () =>
            Promise.resolve({
              data: null,
              error: { message: 'permission denied for column caption_visibility' },
            }),
        }),
      }),
    }))
    from.mockReturnValue({ update })

    await expect(updatePhotoText('photo-1', { caption: 'x' })).rejects.toThrow(
      'permission denied',
    )
  })
})

describe('thumbnailsByPhotoId', () => {
  /** Mirrors the `.select().in()` chain, and reports the ids it was asked for. */
  function photosIn(rows: { id: string; thumbnail_path: string | null }[]) {
    const inFilter = vi.fn(async (_column: string, _ids: string[]) => ({
      data: rows,
      error: null,
    }))

    from.mockReturnValue({ select: () => ({ in: inFilter }) })

    return inFilter
  }

  it('keys signed urls by photo id rather than storage path', async () => {
    // The library holds cover ids; it never sees a storage path, so a map keyed
    // the other way would be unusable to it.
    const { createSignedUrls } = bucket()
    photosIn([
      { id: 'photo-a', thumbnail_path: 'owner/a-thumb.jpg' },
      { id: 'photo-b', thumbnail_path: 'owner/b-thumb.jpg' },
    ])
    createSignedUrls.mockResolvedValue({
      data: [
        { path: 'owner/a-thumb.jpg', signedUrl: 'https://signed/a' },
        { path: 'owner/b-thumb.jpg', signedUrl: 'https://signed/b' },
      ],
      error: null,
    })

    const urls = await thumbnailsByPhotoId(['photo-a', 'photo-b'])

    expect(urls.get('photo-a')).toBe('https://signed/a')
    expect(urls.get('photo-b')).toBe('https://signed/b')
  })

  it('asks for the ids it was given', async () => {
    bucket().createSignedUrls.mockResolvedValue({ data: [], error: null })
    const inFilter = photosIn([])

    await thumbnailsByPhotoId(['photo-a'])

    expect(inFilter).toHaveBeenCalledWith('id', ['photo-a'])
  })

  it('touches nothing when there are no covers to look up', async () => {
    // Every album in an empty library has a null cover; that must not become a
    // request for the whole photo table.
    const { createSignedUrls } = bucket()

    expect((await thumbnailsByPhotoId([])).size).toBe(0)
    expect(from).not.toHaveBeenCalled()
    expect(createSignedUrls).not.toHaveBeenCalled()
  })

  it('leaves out a photo that has no thumbnail', async () => {
    const { createSignedUrls } = bucket()
    photosIn([{ id: 'photo-a', thumbnail_path: null }])

    const urls = await thumbnailsByPhotoId(['photo-a'])

    expect(urls.size).toBe(0)
    expect(createSignedUrls).not.toHaveBeenCalled()
  })

  it('leaves out an id that names no readable row', async () => {
    // A cover whose photo was deleted, or one belonging to another owner: the
    // row simply does not come back, and the card falls back to its placeholder.
    const { createSignedUrls } = bucket()
    photosIn([{ id: 'photo-a', thumbnail_path: 'owner/a-thumb.jpg' }])
    createSignedUrls.mockResolvedValue({
      data: [{ path: 'owner/a-thumb.jpg', signedUrl: 'https://signed/a' }],
      error: null,
    })

    const urls = await thumbnailsByPhotoId(['photo-a', 'photo-gone'])

    expect(urls.has('photo-gone')).toBe(false)
    expect(urls.size).toBe(1)
  })
})

describe('listPhotos', () => {
  /** Mirrors `.select().eq().order().order()`, capturing what it was ordered by. */
  function listing(rows: unknown[] = [ROW]) {
    const ordered: unknown[][] = []
    const result = { data: rows, error: null }

    const chain: { order: ReturnType<typeof vi.fn> } = {
      order: vi.fn((...args: unknown[]) => {
        ordered.push(args)
        return Object.assign(Promise.resolve(result), chain)
      }),
    }

    const eq = vi.fn(() => chain)
    from.mockReturnValue({ select: () => ({ eq }) })

    return { eq, ordered }
  }

  it('asks for one album in sort order', async () => {
    const { eq, ordered } = listing()

    const photos = await listPhotos('album-1')

    expect(eq).toHaveBeenCalledWith('album_id', 'album-1')
    expect(ordered[0]).toEqual(['sort_order', { ascending: true }])
    expect(photos[0]).toMatchObject({ id: 'photo-1', sortOrder: 0 })
  })

  it('breaks ties so the album cannot shuffle itself', async () => {
    // A reorder swaps two rows in two statements. Read in between, both hold
    // the same sort order, and without a second key the order would be whatever
    // the database felt like — different on every refresh.
    const { ordered } = listing()

    await listPhotos('album-1')

    expect(ordered).toHaveLength(2)
    expect(ordered[1]).toEqual(['id', { ascending: true }])
  })
})

describe('deletePhoto', () => {
  function photo(overrides: Partial<Photo> = {}): Photo {
    return {
      id: 'photo-1',
      storagePath: 'owner/a/1.jpg',
      thumbnailPath: 'owner/a/1-thumb.jpg',
      width: 2000,
      height: 1500,
      caption: null,
      captionVisibility: 'hidden',
      alt: null,
      sortOrder: 0,
      ...overrides,
    }
  }

  function deletion(failure?: string) {
    const order: string[] = []
    const remove = vi.fn(async (_paths: string[]) => {
      order.push('remove objects')
      return { error: null }
    })
    const eq = vi.fn(async () => {
      order.push('delete row')
      return { error: failure ? { message: failure } : null }
    })

    from.mockReturnValue({ delete: () => ({ eq }) })
    storage.from.mockReturnValue({ remove })

    return { remove, eq, order }
  }

  it('removes the photograph and both of its objects', async () => {
    const { remove } = deletion()

    await deletePhoto(photo())

    expect(remove).toHaveBeenCalledWith(['owner/a/1.jpg', 'owner/a/1-thumb.jpg'])
  })

  it('deletes the row before the bytes', async () => {
    // A refused delete must leave the photo intact, not a row pointing at
    // objects that are already gone.
    const { order } = deletion()

    await deletePhoto(photo())

    expect(order).toEqual(['delete row', 'remove objects'])
  })

  it('keeps the bytes when the row could not be deleted', async () => {
    const { remove } = deletion('permission denied for table photos')

    await expect(deletePhoto(photo())).rejects.toThrow('permission denied')
    expect(remove).not.toHaveBeenCalled()
  })

  it('copes with a photo that has no thumbnail', async () => {
    const { remove } = deletion()

    await deletePhoto(photo({ thumbnailPath: null }))

    expect(remove).toHaveBeenCalledWith(['owner/a/1.jpg'])
  })
})

describe('swapPhotoOrder', () => {
  function swapping(failOn?: 1 | 2) {
    const patches: { id: string; sort_order: number }[] = []
    let call = 0

    const update = vi.fn((patch: { sort_order: number }) => ({
      eq: (_column: string, id: string) => {
        call += 1
        patches.push({ id, sort_order: patch.sort_order })

        return Promise.resolve({
          error: call === failOn ? { message: 'permission denied for column sort_order' } : null,
        })
      },
    }))

    from.mockReturnValue({ update })

    return { patches }
  }

  const a = { id: 'photo-a', sortOrder: 0 } as Photo
  const b = { id: 'photo-b', sortOrder: 1 } as Photo

  it('gives each photo the other one’s position', async () => {
    const { patches } = swapping()

    await swapPhotoOrder(a, b)

    expect(patches).toEqual([
      { id: 'photo-a', sort_order: 1 },
      { id: 'photo-b', sort_order: 0 },
    ])
  })

  it('touches only the pair, whatever the album holds', async () => {
    // The alternative is renumbering every photo on every move, which turns a
    // hundred-photo album into a hundred statements.
    const { patches } = swapping()

    await swapPhotoOrder(a, b)

    expect(patches).toHaveLength(2)
  })

  it('reports a refused move rather than half-applying it silently', async () => {
    swapping(2)

    await expect(swapPhotoOrder(a, b)).rejects.toThrow('permission denied')
  })

  it('does not attempt the second write when the first is refused', async () => {
    const { patches } = swapping(1)

    await expect(swapPhotoOrder(a, b)).rejects.toThrow('permission denied')
    expect(patches).toHaveLength(1)
  })
})
