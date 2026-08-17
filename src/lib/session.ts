import { supabase } from './supabase'

/**
 * The signed-in user's id, for rows that carry `owner_id`.
 *
 * Row-level security is what actually enforces ownership; this only supplies
 * the value so the insert can satisfy it. If the two ever disagree the database
 * rejects the write, which is the behaviour we want.
 */
export async function currentOwnerId(): Promise<string> {
  const { data, error } = await supabase.auth.getClaims()

  if (error || typeof data?.claims.sub !== 'string') {
    throw new Error('Your session has expired. Sign in again.')
  }

  return data.claims.sub
}
