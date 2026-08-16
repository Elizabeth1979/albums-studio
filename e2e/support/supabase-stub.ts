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

export type StubOptions = {
  /** Status and body returned by the password grant, for failure cases. */
  passwordGrant?: { status: number; body: object }
}

export type AuthCalls = {
  /** Every intercepted Supabase request, in order. */
  all: { method: string; path: string; body: unknown }[]
  find: (path: string) => { method: string; path: string; body: unknown } | undefined
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

  await page.route(`${SUPABASE_ORIGIN}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname

    calls.push({ method: request.method(), path, body: parseBody(request) })

    const json = (body: object, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

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
      return json({})
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
  }
}
