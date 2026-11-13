/**
 * Supabase throttles outbound auth email per address. Asking for a magic link
 * moments after a password-reset link trips it, and the raw reply reads
 * "For security purposes, you can only request this after 53 seconds." — which
 * names no cause and reads like the account is at fault.
 */
const RATE_LIMIT_CODES = new Set(['over_email_send_rate_limit', 'over_request_rate_limit'])

type AuthErrorShape = {
  message: string
  name?: string
  code?: string
  status?: number
}

/**
 * supabase-js reports a request that never got an answer as
 * `AuthRetryableFetchError` with status 0, carrying the browser's own words —
 * "Failed to fetch" in Chrome, "Load failed" in Safari — which say nothing to a
 * person. It happens offline and when the backend is down (a paused project),
 * and the page cannot tell which, so the message names both.
 */
export const UNREACHABLE_MESSAGE =
  "Can't reach Albums Studio. If your internet is working, the problem is on our side. Try again in a few minutes."

function isUnreachable(error: AuthErrorShape): boolean {
  return error.name === 'AuthRetryableFetchError' && (error.status ?? 0) === 0
}

function asAuthError(error: unknown): AuthErrorShape | null {
  if (typeof error !== 'object' || error === null) return null

  const candidate = error as Partial<AuthErrorShape>

  return typeof candidate.message === 'string'
    ? {
        message: candidate.message,
        name: candidate.name,
        code: candidate.code,
        status: candidate.status,
      }
    : null
}

function secondsToWait(message: string): string | null {
  return /after (\d+) seconds?/.exec(message)?.[1] ?? null
}

/**
 * Turns a Supabase auth failure into something worth showing a person, without
 * hiding failures nobody anticipated: anything unrecognised keeps its own text.
 */
export function describeAuthError(error: unknown, fallback: string): string {
  const authError = asAuthError(error)

  if (!authError) return fallback

  if (isUnreachable(authError)) return UNREACHABLE_MESSAGE

  const rateLimited =
    RATE_LIMIT_CODES.has(authError.code ?? '') || authError.status === 429

  if (rateLimited) {
    const seconds = secondsToWait(authError.message)

    return seconds
      ? `Too many sign-in emails at once. You can ask for another in about ${seconds} seconds.`
      : 'Too many sign-in emails at once. Wait a minute, then try again.'
  }

  return authError.message || fallback
}
