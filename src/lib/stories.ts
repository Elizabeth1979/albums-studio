import { type TextVisibility } from './photos'
import { currentOwnerId } from './session'
import { supabase } from './supabase'

/**
 * A longer memory attached to a photograph: what happened, who was there, why
 * it mattered. Separate from a caption because it is not a label — a photo can
 * carry several, and they are usually too long to sit under the picture.
 */
export type Story = {
  id: string
  photoId: string
  body: string
  visibility: TextVisibility
  createdAt: string
}

type StoryRow = {
  id: string
  photo_id: string
  body: string
  visibility: TextVisibility
  created_at: string
}

const STORY_COLUMNS = 'id, photo_id, body, visibility, created_at'

function toStory(row: StoryRow): Story {
  return {
    id: row.id,
    photoId: row.photo_id,
    body: row.body,
    visibility: row.visibility,
    createdAt: row.created_at,
  }
}

/**
 * Every story for a set of photographs, oldest first.
 *
 * One request for the whole album rather than one per photograph: an album of
 * forty photos would otherwise open forty connections to show a handful of
 * notes.
 */
export async function listStories(photoIds: string[]): Promise<Story[]> {
  if (photoIds.length === 0) return []

  const { data, error } = await supabase
    .from('photo_stories')
    .select(STORY_COLUMNS)
    .in('photo_id', photoIds)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)

  return (data ?? []).map((row) => toStory(row as StoryRow))
}

export async function createStory(input: {
  photoId: string
  body: string
  visibility: TextVisibility
}): Promise<Story> {
  const body = input.body.trim()

  // The database refuses a blank body too, but saying so here means the owner
  // is told what to do rather than shown a constraint name.
  if (!body) {
    throw new Error('Write the story before saving it.')
  }

  const ownerId = await currentOwnerId()

  const { data, error } = await supabase
    .from('photo_stories')
    .insert({
      photo_id: input.photoId,
      owner_id: ownerId,
      body,
      visibility: input.visibility,
    })
    .select(STORY_COLUMNS)
    .single()

  if (error) throw new Error(error.message)

  return toStory(data as StoryRow)
}

export async function updateStory(
  id: string,
  patch: { body?: string; visibility?: TextVisibility },
): Promise<Story> {
  const columns: Record<string, unknown> = {}

  if (patch.body !== undefined) {
    const body = patch.body.trim()

    // Clearing the text is how a story is removed, and that is `deleteStory`.
    // Writing an empty body would be refused by the database anyway.
    if (!body) {
      throw new Error('Write the story before saving it.')
    }

    columns.body = body
  }

  if (patch.visibility !== undefined) {
    columns.visibility = patch.visibility
  }

  const { data, error } = await supabase
    .from('photo_stories')
    .update(columns)
    .eq('id', id)
    .select(STORY_COLUMNS)
    .single()

  if (error) throw new Error(error.message)

  return toStory(data as StoryRow)
}

export async function deleteStory(id: string): Promise<void> {
  const { error } = await supabase.from('photo_stories').delete().eq('id', id)

  if (error) throw new Error(error.message)
}
