import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listPhotos, signedUrls, storePhoto } from './photos'

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

describe('listPhotos', () => {
  it('asks for one album in sort order', async () => {
    const order = vi.fn().mockResolvedValue({ data: [ROW], error: null })
    const eq = vi.fn(() => ({ order }))
    from.mockReturnValue({ select: () => ({ eq }) })

    const photos = await listPhotos('album-1')

    expect(eq).toHaveBeenCalledWith('album_id', 'album-1')
    expect(order).toHaveBeenCalledWith('sort_order', { ascending: true })
    expect(photos[0]).toMatchObject({ id: 'photo-1', sortOrder: 0 })
  })
})
