import { FunctionsHttpError } from '@supabase/supabase-js'
import { announceAiCall } from './aiCosts'
import { supabase } from './supabase'

export { ALT_DRAFTS_PER_MONTH } from '../../supabase/functions/_shared/altContext'
export { settleDraft } from './albumStory'

/** Alt text suggested for one photograph, waiting for its owner to decide. */
export type AltDraft = {
  id: string
  body: string
  /** Suggestions used this month, this one included, against the month's allowance. */
  used: number
  limit: number
}

/**
 * Asks for a suggested description of one photograph.
 *
 * Through the `alt-draft` Edge Function, which holds the AI key, checks the
 * photograph is the caller's, and counts the use. Its own words come back as
 * the error when it refuses, because "you have used all 50 this month" is
 * something the owner can act on and a status code is not.
 */
export async function draftAlt(photoId: string): Promise<AltDraft> {
  const { data, error } = await supabase.functions.invoke('alt-draft', { body: { photoId } })
  // Refused or not, the call may have been paid for and logged: an open cost panel re-reads.
  announceAiCall()

  if (error) {
    if (error instanceof FunctionsHttpError) {
      const said = (await error.context.json().catch(() => null)) as { error?: string } | null
      throw new Error(said?.error ?? 'The photograph could not be described.')
    }
    throw new Error('The describer could not be reached. Check your connection and try again.')
  }

  const answer = data as { draft?: { id: string; body: string }; used?: number; limit?: number }
  if (!answer?.draft?.body) throw new Error('The describer returned nothing. Try again.')

  return {
    id: answer.draft.id,
    body: answer.draft.body,
    used: answer.used ?? 0,
    limit: answer.limit ?? 0,
  }
}

/**
 * Who wrote the alt text being saved.
 *
 * A suggestion saved word for word is the AI's; once the owner has changed it,
 * it is hers. Kept honest so unedited AI descriptions can always be found
 * again, and so a suggestion can never pass for something a person wrote.
 */
export function altSourceFor(alt: string | null, usedDraft: string | null | undefined) {
  if (!alt) return null
  return usedDraft !== undefined && usedDraft !== null && alt === usedDraft.trim() ? 'ai' : 'human'
}
