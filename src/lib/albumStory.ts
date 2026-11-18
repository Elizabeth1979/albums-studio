import { callStudio } from './studio'
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

/** Asks the `story-draft` function for a draft from the album's photographs and her words. */
export async function draftAlbumStory(
  albumId: string,
  notes: string,
  photoIds: string[] = [],
): Promise<StoryDraft> {
  // No photo ids means "you choose": the server spreads its pick across the album.
  const answer = await callStudio<{ draft?: { id: string; body: string }; used?: number; limit?: number }>(
    'story-draft',
    photoIds.length > 0 ? { albumId, notes, photoIds } : { albumId, notes },
    'The story could not be drafted.',
  )
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
