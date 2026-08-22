import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadArchitecture } from './architecture'

const { supabaseApi } = vi.hoisted(() => ({
  supabaseApi: { supabase: { auth: { getSession: vi.fn() } } },
}))

vi.mock('./supabase', () => supabaseApi)

const PAGE = '<!doctype html><html><body>the map</body></html>'

function respondWith(status: number, body = '') {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(body),
    }),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  supabaseApi.supabase.auth.getSession.mockResolvedValue({
    data: { session: { access_token: 'a-real-token' } },
  })
})

describe('loading the architecture map', () => {
  it('sends the signed-in session, not the publishable key', async () => {
    // The publishable key identifies the project, not the person. Sending it as
    // the credential would ask the function to authorise the whole world, which
    // is the mistake this page exists to avoid.
    respondWith(200, PAGE)

    await loadArchitecture()

    const [, options] = vi.mocked(fetch).mock.calls[0]
    expect(options?.headers).toMatchObject({ Authorization: 'Bearer a-real-token' })
  })

  it('returns the page when the account is allowed to read it', async () => {
    respondWith(200, PAGE)

    await expect(loadArchitecture()).resolves.toEqual({ status: 'ready', page: PAGE })
  })

  it('reports a refusal as a refusal rather than a failure', async () => {
    // A signed-in account that is not the one this page belongs to has not hit
    // an error, and telling it so would send someone looking for a fault.
    respondWith(403)

    await expect(loadArchitecture()).resolves.toEqual({
      status: 'forbidden',
      message: 'This page is not for this account.',
    })
  })

  it('carries the status through when the function is unwell', async () => {
    respondWith(503)

    await expect(loadArchitecture()).rejects.toThrow('(503)')
  })

  it('refuses an empty two hundred', async () => {
    respondWith(200, '   ')

    await expect(loadArchitecture()).rejects.toThrow('came back empty')
  })

  it('asks for a sign-in when the session has gone', async () => {
    supabaseApi.supabase.auth.getSession.mockResolvedValue({ data: { session: null } })
    respondWith(200, PAGE)

    await expect(loadArchitecture()).rejects.toThrow('session has expired')
    expect(fetch).not.toHaveBeenCalled()
  })
})
