import { FunctionsHttpError } from '@supabase/supabase-js'
import { announceAiCall } from './aiCosts'
import { supabase } from './supabase'

/**
 * Calls one of the studio's AI Edge Functions.
 *
 * They hold the AI key, check what is the caller's, and count the use. When one
 * refuses, its own words come back as the error: "you have used all 5 drafts
 * this month" is something the owner can act on, where a status code is not.
 */
export async function callStudio<T>(name: string, body: object, fallback: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  // Refused or not, the call may have been paid for and logged: an open cost panel re-reads.
  announceAiCall()

  if (error) {
    if (error instanceof FunctionsHttpError) {
      const said = (await error.context.json().catch(() => null)) as { error?: string } | null
      throw new Error(said?.error ?? fallback)
    }
    throw new Error('The studio could not be reached. Check your connection and try again.')
  }

  return data as T
}
