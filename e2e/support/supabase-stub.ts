import type { Page, Request } from '@playwright/test'

export const SUPABASE_ORIGIN = 'https://stub.supabase.co'

const USER = {
  id: '00000000-0000-4000-8000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'person@example.com',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { display_name: 'Person' },
  created_at: '2026-08-15T19:04:08.405617Z',
  updated_at: '2026-08-15T19:04:08.405617Z',
}

function base64url(value: object) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

/**
 * A structurally valid HS256 token. The signature is never checked here: the
 * client verifies symmetric tokens by asking the server, which this stub answers.
 */
export function fakeAccessToken(overrides: Record<string, unknown> = {}) {
  const issuedAt = Math.floor(Date.now() / 1000)

  return [
    base64url({ alg: 'HS256', typ: 'JWT' }),
    base64url({
      sub: USER.id,
      email: USER.email,
      aud: 'authenticated',
      role: 'authenticated',
      iat: issuedAt,
      exp: issuedAt + 3600,
      ...overrides,
    }),
    'stub-signature',
  ].join('.')
}

export function recoveryUrl() {
  const params = new URLSearchParams({
    access_token: fakeAccessToken(),
    expires_in: '3600',
    refresh_token: 'stub-refresh-token',
    token_type: 'bearer',
    type: 'recovery',
  })

  return `/#${params.toString()}`
}

export type AlbumRecord = {
  id: string
  title: string
  slug: string
  layout: string
  description: string | null
  cover_photo_id: string | null
  created_at: string
}

export function albumRecord(overrides: Partial<AlbumRecord> = {}): AlbumRecord {
  return {
    id: 'album-1',
    title: 'Summer by the lake',
    slug: 'summer-by-the-lake',
    layout: 'masonry',
    description: null,
    cover_photo_id: null,
    created_at: '2026-08-16T10:00:00Z',
    ...overrides,
  }
}

export type PhotoRecord = {
  id: string
  album_id: string
  storage_path: string
  thumbnail_path: string | null
  width: number | null
  height: number | null
  caption: string | null
  caption_visibility: string
  alt: string | null
  alt_source: string | null
  sort_order: number
}

export type StoryRecord = {
  id: string
  photo_id: string
  body: string
  visibility: string
  created_at: string
}

export type StubOptions = {
  /** Status and body returned by the password grant, for failure cases. */
  passwordGrant?: { status: number; body: object }
  /** Rows the fake `albums` table starts with. */
  albums?: AlbumRecord[]
  /** Status and body returned by writes to `albums`, for failure cases. */
  albumWrite?: { status: number; body: object }
  /** Status and body returned by the magic-link and reset endpoints. */
  emailSend?: { status: number; body: object }
  /** Status and body returned by writes to `photos`, for failure cases. */
  photoWrite?: { status: number; body: object }
  /**
   * Status and body returned by edits to an existing `photos` row. Separate from
   * `photoWrite` so a test can refuse a caption without also refusing the upload
   * that has to happen first.
   */
  photoUpdate?: { status: number; body: object }
  /** Status and body returned by writes to `photo_stories`, for failure cases. */
  storyWrite?: { status: number; body: object }
  /** Status and body returned by Storage uploads, for failure cases. */
  storageUpload?: { status: number; body: object }
}

export type AuthCalls = {
  /** Every intercepted Supabase request, in order. */
  all: { method: string; path: string; body: unknown }[]
  find: (path: string) => { method: string; path: string; body: unknown } | undefined
  /** Current contents of the fake `albums` table. */
  albums: () => AlbumRecord[]
  /** Current contents of the fake `photos` table. */
  photos: () => PhotoRecord[]
  /** Current contents of the fake `photo_stories` table. */
  stories: () => StoryRecord[]
  /** Object keys written to the fake Storage bucket. */
  objects: () => string[]
}

/** PostgREST filters arrive as `id=eq.<value>`. */
function eqFilter(url: URL, column: string): string | null {
  return url.searchParams.get(column)?.replace(/^eq\./, '') ?? null
}

/** A set filter arrives as `id=in.(a,b)`; quoting only appears for odd values. */
function inFilter(url: URL, column: string): string[] | null {
  const raw = url.searchParams.get(column)
  if (!raw?.startsWith('in.')) return null

  return raw
    .slice('in.('.length, -1)
    .split(',')
    .map((value) => value.replace(/^"|"$/g, ''))
    .filter(Boolean)
}

function parseBody(request: Request): unknown {
  const raw = request.postData()
  if (!raw) return undefined

  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

/**
 * Intercepts every Supabase call the browser makes, so the suite exercises the
 * real client and real form wiring without a backend.
 */
export async function stubSupabase(page: Page, options: StubOptions = {}): Promise<AuthCalls> {
  const calls: AuthCalls['all'] = []
  let albums: AlbumRecord[] = [...(options.albums ?? [])]
  let photos: PhotoRecord[] = []
  let stories: StoryRecord[] = []
  let objects: string[] = []
  let created = 0
  let photosCreated = 0
  let storiesCreated = 0

  await page.route(`${SUPABASE_ORIGIN}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()

    calls.push({ method, path, body: parseBody(request) })

    const json = (body: object, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

    // A `.single()` call asks PostgREST for a bare object instead of an array.
    const wantsObject = (request.headers()['accept'] ?? '').includes('vnd.pgrst.object')

    // Storage: uploads write an object, and the sign endpoint hands back a URL
    // the browser can actually fetch. Signed URLs point back at this stub so the
    // <img> resolves rather than dangling.
    if (path.startsWith('/storage/v1/object/sign/')) {
      const body = parseBody(request) as { paths?: string[]; expiresIn?: number }
      // The client prefixes its storage base onto whatever `signedURL` holds,
      // so this has to be relative to /storage/v1 rather than absolute.
      return json(
        (body.paths ?? []).map((signedPath) => ({
          path: signedPath,
          signedURL: `/object/signed/${signedPath}`,
        })),
      )
    }

    if (path.startsWith('/storage/v1/object/signed/')) {
      // A one-pixel PNG so the browser has real bytes to decode.
      return route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
          'base64',
        ),
      })
    }

    if (path.startsWith('/storage/v1/object/photos/')) {
      if (options.storageUpload) {
        return json(options.storageUpload.body, options.storageUpload.status)
      }

      const key = path.replace('/storage/v1/object/photos/', '')

      if (method === 'POST' || method === 'PUT') {
        objects = [...objects, key]
        return json({ Key: `photos/${key}` })
      }

      if (method === 'DELETE') {
        objects = objects.filter((existing) => existing !== key)
        return json({})
      }
    }

    if (path.endsWith('/storage/v1/object/photos') && method === 'DELETE') {
      const body = parseBody(request) as { prefixes?: string[] }
      objects = objects.filter((existing) => !(body.prefixes ?? []).includes(existing))
      return json({})
    }

    if (path.endsWith('/rest/v1/photo_stories')) {
      if (method !== 'GET' && options.storyWrite) {
        return json(options.storyWrite.body, options.storyWrite.status)
      }

      if (method === 'GET') {
        const ids = inFilter(url, 'photo_id')
        return json(stories.filter((row) => ids === null || ids.includes(row.photo_id)))
      }

      if (method === 'POST') {
        const body = parseBody(request) as Record<string, unknown>
        storiesCreated += 1
        const row: StoryRecord = {
          id: `story-${storiesCreated}`,
          photo_id: String(body.photo_id ?? ''),
          body: String(body.body ?? ''),
          visibility: String(body.visibility ?? 'hidden'),
          created_at: new Date().toISOString(),
        }
        stories = [...stories, row]
        return json(wantsObject ? row : [row], 201)
      }

      if (method === 'PATCH') {
        const id = eqFilter(url, 'id')
        const patch = parseBody(request) as Partial<StoryRecord>
        stories = stories.map((row) => (row.id === id ? { ...row, ...patch } : row))
        const updated = stories.find((row) => row.id === id)
        return json(wantsObject ? (updated ?? {}) : stories.filter((row) => row.id === id))
      }

      if (method === 'DELETE') {
        const id = eqFilter(url, 'id')
        stories = stories.filter((row) => row.id !== id)
        return route.fulfill({ status: 204, body: '' })
      }
    }

    if (path.endsWith('/rest/v1/photos')) {
      if (method !== 'GET' && options.photoWrite) {
        return json(options.photoWrite.body, options.photoWrite.status)
      }

      if (method === 'GET') {
        // The album screen asks by album; the library asks for a scattered set
        // of cover ids. Honouring both keeps a test that expects one photo from
        // silently passing on the whole table.
        const albumId = eqFilter(url, 'album_id')
        const ids = inFilter(url, 'id')

        return json(
          photos.filter(
            (row) =>
              (albumId === null || row.album_id === albumId) &&
              (ids === null || ids.includes(row.id)),
          ),
        )
      }

      if (method === 'POST') {
        const body = parseBody(request) as Record<string, unknown>
        photosCreated += 1
        const row: PhotoRecord = {
          id: `photo-${photosCreated}`,
          album_id: String(body.album_id ?? ''),
          storage_path: String(body.storage_path ?? ''),
          thumbnail_path: (body.thumbnail_path as string | null) ?? null,
          width: (body.width as number | null) ?? null,
          height: (body.height as number | null) ?? null,
          caption: null,
          // The column default. A caption is never public until someone says so.
          caption_visibility: 'hidden',
          alt: null,
          alt_source: null,
          sort_order: (body.sort_order as number) ?? 0,
        }
        photos = [...photos, row]
        return json(wantsObject ? row : [row], 201)
      }

      if (method === 'DELETE') {
        const id = eqFilter(url, 'id')
        photos = photos.filter((row) => row.id !== id)
        // The real schema cascades photo_stories through the composite foreign
        // key. Without this the stub would keep stories whose photo is gone and
        // quietly disagree with the database about what deleting means.
        stories = stories.filter((row) => row.photo_id !== id)
        return route.fulfill({ status: 204, body: '' })
      }

      if (method === 'PATCH') {
        if (options.photoUpdate) {
          return json(options.photoUpdate.body, options.photoUpdate.status)
        }

        const id = eqFilter(url, 'id')
        const patch = parseBody(request) as Partial<PhotoRecord>
        photos = photos.map((row) => (row.id === id ? { ...row, ...patch } : row))
        const updated = photos.find((row) => row.id === id)
        return json(wantsObject ? (updated ?? {}) : photos.filter((row) => row.id === id))
      }
    }

    if (path.endsWith('/rest/v1/albums')) {
      if (method !== 'GET' && options.albumWrite) {
        return json(options.albumWrite.body, options.albumWrite.status)
      }

      if (method === 'GET') {
        return json(albums)
      }

      if (method === 'POST') {
        const body = parseBody(request) as Partial<AlbumRecord>
        created += 1
        const row = albumRecord({
          id: `album-created-${created}`,
          title: body.title ?? 'Untitled',
          slug: body.slug ?? 'untitled',
          layout: body.layout ?? 'masonry',
          created_at: new Date().toISOString(),
        })
        albums = [row, ...albums]
        return json(wantsObject ? row : [row], 201)
      }

      if (method === 'PATCH') {
        const id = eqFilter(url, 'id')
        const patch = parseBody(request) as Partial<AlbumRecord>
        albums = albums.map((row) => (row.id === id ? { ...row, ...patch } : row))
        const updated = albums.find((row) => row.id === id)
        return json(wantsObject ? (updated ?? {}) : albums.filter((row) => row.id === id))
      }

      if (method === 'DELETE') {
        const id = eqFilter(url, 'id')
        albums = albums.filter((row) => row.id !== id)
        return route.fulfill({ status: 204, body: '' })
      }
    }

    if (path.endsWith('/.well-known/jwks.json')) {
      return json({ keys: [] })
    }

    if (path.endsWith('/auth/v1/token')) {
      const failure = options.passwordGrant
      if (failure) {
        return json(failure.body, failure.status)
      }

      return json({
        access_token: fakeAccessToken(),
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: 'stub-refresh-token',
        user: USER,
      })
    }

    // Recovery and magic-link requests both answer with an empty object.
    if (path.endsWith('/auth/v1/recover') || path.endsWith('/auth/v1/otp')) {
      const failure = options.emailSend
      return failure ? json(failure.body, failure.status) : json({})
    }

    if (path.endsWith('/auth/v1/logout')) {
      return route.fulfill({ status: 204, body: '' })
    }

    // GET returns the current user; PUT applies an update such as a new password.
    if (path.endsWith('/auth/v1/user')) {
      return json(USER)
    }

    return json({})
  })

  return {
    all: calls,
    find: (path: string) => calls.find((call) => call.path.endsWith(path)),
    albums: () => albums,
    photos: () => photos,
    stories: () => stories,
    objects: () => objects,
  }
}
