import { supabase } from './supabase'

/** What the caller is allowed to see, and why, when they are not. */
export type ArchitectureResult =
  | { status: 'ready'; page: string }
  | { status: 'forbidden'; message: string }

/**
 * Loads the architecture map for the account allowed to read it.
 *
 * The page is never bundled with the application. It lives behind an Edge
 * Function that identifies the caller first, so a browser that is not signed in
 * as that account never receives the markup at all — which is the difference
 * between a page that is protected and one that is merely unlinked.
 */
export async function loadArchitecture(): Promise<ArchitectureResult> {
  const base = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token

  if (!token) throw new Error('Your session has expired. Sign in again.')

  const response = await fetch(`${base}/functions/v1/architecture`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
  })

  // Not an error to shout about: the account is signed in, it simply is not the
  // one this page belongs to. The screen says so plainly instead of showing a
  // failure the reader cannot act on.
  if (response.status === 403) {
    return { status: 'forbidden', message: 'This page is not for this account.' }
  }

  if (!response.ok) {
    // The status is carried through for the same reason the shared album does
    // it: "it did not work" cannot be told apart from a cold function, a
    // missing secret, or an outage without it.
    throw new Error(`The architecture map could not be loaded (${response.status}).`)
  }

  const page = await response.text()

  // A 200 with nothing in it means the function and this side disagree about
  // what is being served, which is worth saying rather than rendering a blank
  // frame that looks like a slow network.
  if (!page.trim()) throw new Error('The architecture map came back empty.')

  return { status: 'ready', page }
}
