import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { albumShareToken, loadSharedAlbum, rotateShareToken, shareUrl } from './sharing'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('./supabase', () => ({ supabase: { rpc } }))

const ALBUM = {
  album: { title: 'Summer by the lake', description: 'A week by the water' },
  photos: [],
}

/** Stands in for one fetch response, without a real network. */
function respond(status: number, body: unknown = {}) {
  const fetchMock = vi.fn(async () => ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('albumShareToken', () => {
  it("asks the database for the album's token", async () => {
    rpc.mockResolvedValue({ data: 'the-token', error: null })

    expect(await albumShareToken('album-1')).toBe('the-token')
    expect(rpc).toHaveBeenCalledWith('album_share_token', { album: 'album-1' })
  })

  it('reports a refusal rather than returning nothing', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } })

    await expect(albumShareToken('someone-elses')).rejects.toThrow('permission denied')
  })

  it('explains an album that has no link yet', async () => {
    rpc.mockResolvedValue({ data: null, error: null })

    await expect(albumShareToken('album-1')).rejects.toThrow('no share link yet')
  })
})

describe('rotateShareToken', () => {
  it('returns the replacement', async () => {
    rpc.mockResolvedValue({ data: 'the-new-token', error: null })

    expect(await rotateShareToken('album-1')).toBe('the-new-token')
    expect(rpc).toHaveBeenCalledWith('rotate_album_share_token', { album: 'album-1' })
  })

  it('reports a refusal', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } })

    await expect(rotateShareToken('album-1')).rejects.toThrow('permission denied')
  })
})

describe('shareUrl', () => {
  it('builds the address on whatever origin is running', () => {
    expect(shareUrl('the-token')).toBe(`${window.location.origin}/shared/the-token`)
  })
})

describe('loadSharedAlbum', () => {
  it('sends the token, and nothing else, to the function', async () => {
    const fetchMock = respond(200, ALBUM)

    await loadSharedAlbum('the-token')

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const query = new URL(url).searchParams

    expect(new URL(url).pathname).toBe('/functions/v1/shared-album')
    expect(query.get('token')).toBe('the-token')
    // The token is the whole surface. An album, photo or owner id accepted here
    // would be a second way in, and one the database rules do not cover.
    expect([...query.keys()]).toEqual(['token'])
    expect(init.headers).toHaveProperty('apikey')
  })

  it('escapes a token rather than pasting it into the query', async () => {
    const fetchMock = respond(200, ALBUM)

    await loadSharedAlbum('a token&album_id=1')

    const [url] = fetchMock.mock.calls[0] as unknown as [string]
    expect(url).toContain('a%20token%26album_id%3D1')
  })

  it('returns the album a visitor should see', async () => {
    respond(200, ALBUM)

    expect(await loadSharedAlbum('the-token')).toEqual(ALBUM)
  })

  it('says nothing revealing about a token that does not open anything', async () => {
    // A withdrawn link, a rotated one and one that never existed are the same
    // answer on purpose: a link must not be usable to probe for albums.
    respond(404, { error: 'not found' })

    await expect(loadSharedAlbum('withdrawn')).rejects.toThrow('This album is not available.')
  })

  it('carries the status when the function fails, so a report is diagnosable', async () => {
    // Without the number, "it did not work" cannot be told apart from a
    // withdrawn link, and that was exactly the position a real failure left us in.
    respond(500, { error: 'boom' })

    await expect(loadSharedAlbum('the-token')).rejects.toThrow(
      'This album could not be loaded (500).',
    )
  })

  it('distinguishes a gateway failure from the function refusing', async () => {
    respond(546, { error: 'worker boot error' })

    await expect(loadSharedAlbum('the-token')).rejects.toThrow(
      'This album could not be loaded (546).',
    )
  })

  it('refuses a 200 that is not an album', async () => {
    // A rewrite that swallows the request and serves the app shell answers 200,
    // and rendering that blankly would look like an empty album.
    respond(200, { nothing: 'useful' })

    await expect(loadSharedAlbum('the-token')).rejects.toThrow('could not be loaded')
  })
})
