import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'

export { STORY_PHOTO_LIMIT, spreadAcross } from '../../supabase/functions/_shared/storyPhotos'

/** A story drafted for an album, waiting for its owner to decide. */
export type StoryDraft = {
  id: string
  body: string
  /** Drafts used this month, this one included, against the month's allowance. */
  used: number
  limit: number
}

/** How a draft that was not used is recorded: set aside, never deleted. */
export type DraftOutcome = 'accepted' | 'rejected'

/**
 * Asks for a story draft from the album's photographs and what its owner wrote.
 *
 * Through the `story-draft` Edge Function, which holds the AI key, checks the
 * album is the caller's, and counts the use. Its own words come back as the
 * error when it refuses — "you have used all 5 drafts this month" is something
 * the owner can act on, where a status code is not.
 */
export async function draftAlbumStory(
  albumId: string,
  notes: string,
  photoIds: string[] = [],
): Promise<StoryDraft> {
  // No photo ids means "you choose": the server spreads its pick across the album.
  const { data, error } = await supabase.functions.invoke('story-draft', {
    body: photoIds.length > 0 ? { albumId, notes, photoIds } : { albumId, notes },
  })

  if (error) {
    if (error instanceof FunctionsHttpError) {
      const said = (await error.context.json().catch(() => null)) as { error?: string } | null
      throw new Error(said?.error ?? 'The story could not be drafted.')
    }
    throw new Error('The story writer could not be reached. Check your connection and try again.')
  }

  const answer = data as { draft?: { id: string; body: string }; used?: number; limit?: number }
  if (!answer?.draft?.body) throw new Error('The story writer returned nothing. Try again.')

  return {
    id: answer.draft.id,
    body: answer.draft.body,
    used: answer.used ?? 0,
    limit: answer.limit ?? 0,
  }
}

/** Records what became of a draft, so every accepted story can be traced to its source. */
export async function settleDraft(id: string, outcome: DraftOutcome): Promise<void> {
  const { error } = await supabase.from('ai_drafts').update({ status: outcome }).eq('id', id)

  if (error) throw new Error(error.message)
}
