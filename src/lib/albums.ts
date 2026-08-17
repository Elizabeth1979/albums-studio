import { currentOwnerId } from './session'
import { supabase } from './supabase'

export const ALBUM_LAYOUTS = ['masonry', 'grid'] as const

export type AlbumLayout = (typeof ALBUM_LAYOUTS)[number]

export type Album = {
  id: string
  title: string
  slug: string
  layout: AlbumLayout
  description: string | null
  /** The photo shown on the album's card, or null while the album is empty. */
  coverPhotoId: string | null
  createdAt: string
}

type AlbumRow = {
  id: string
  title: string
  slug: string
  layout: AlbumLayout
  description: string | null
  cover_photo_id: string | null
  created_at: string
}

const ALBUM_COLUMNS = 'id, title, slug, layout, description, cover_photo_id, created_at'

/** Postgres unique_violation. */
const UNIQUE_VIOLATION = '23505'

const LAYOUT_LABELS: Record<AlbumLayout, string> = {
  masonry: 'Masonry',
  grid: 'Grid',
}

export function layoutLabel(layout: AlbumLayout): string {
  return LAYOUT_LABELS[layout]
}

function toAlbum(row: AlbumRow): Album {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    layout: row.layout,
    description: row.description,
    coverPhotoId: row.cover_photo_id,
    createdAt: row.created_at,
  }
}

/**
 * Keeps letters and numbers from any script, so a title that is not written in
 * English still produces a usable slug instead of an empty string.
 */
export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .slice(0, 60)
    .replace(/^-+|-+$/g, '')

  return slug || 'album'
}

export async function listAlbums(): Promise<Album[]> {
  const { data, error } = await supabase
    .from('albums')
    .select(ALBUM_COLUMNS)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)

  return (data ?? []).map((row) => toAlbum(row as AlbumRow))
}

export async function createAlbum(input: {
  title: string
  layout: AlbumLayout
  description?: string
}): Promise<Album> {
  const title = input.title.trim()

  if (!title) {
    throw new Error('Give the album a title.')
  }

  const description = input.description?.trim() || null
  const ownerId = await currentOwnerId()
  const base = slugify(title)

  // Slugs are unique per owner, so a second "Summer" needs its own. Ask the
  // database rather than pre-checking: a read-then-write would still race.
  for (let attempt = 1; attempt <= 25; attempt += 1) {
    const slug = attempt === 1 ? base : `${base}-${attempt}`
    const { data, error } = await supabase
      .from('albums')
      .insert({ owner_id: ownerId, title, slug, layout: input.layout, description })
      .select(ALBUM_COLUMNS)
      .single()

    if (!error) return toAlbum(data as AlbumRow)
    if (error.code !== UNIQUE_VIOLATION) throw new Error(error.message)
  }

  throw new Error('Too many albums share that title. Try a different one.')
}

async function updateAlbum(id: string, patch: Record<string, unknown>): Promise<Album> {
  const { data, error } = await supabase
    .from('albums')
    .update(patch)
    .eq('id', id)
    .select(ALBUM_COLUMNS)
    .single()

  if (error) throw new Error(error.message)

  return toAlbum(data as AlbumRow)
}

/**
 * The slug is left alone on purpose. It is the stable half of a future share
 * URL, so renaming an album should not silently break links already handed out.
 */
export async function renameAlbum(id: string, title: string): Promise<Album> {
  const trimmed = title.trim()

  if (!trimmed) {
    throw new Error('Give the album a title.')
  }

  return updateAlbum(id, { title: trimmed })
}

/**
 * Partial edits to an album shell. `description` is trimmed and stored as null
 * when cleared, so "no description" is one state in the database rather than
 * two that read the same on screen.
 */
export async function updateAlbumDetails(
  id: string,
  patch: { layout?: AlbumLayout; description?: string },
): Promise<Album> {
  const columns: Record<string, unknown> = {}

  if (patch.layout !== undefined) {
    columns.layout = patch.layout
  }

  if (patch.description !== undefined) {
    columns.description = patch.description.trim() || null
  }

  return updateAlbum(id, columns)
}

/**
 * Points the album's card at one of its photographs.
 *
 * The database enforces that the photo belongs to this album and this owner:
 * cover_photo_id is half of a composite foreign key over
 * (cover_photo_id, id, owner_id), so a cover borrowed from someone else's album
 * is refused rather than quietly stored.
 */
export async function setAlbumCover(id: string, photoId: string): Promise<Album> {
  return updateAlbum(id, { cover_photo_id: photoId })
}

export async function deleteAlbum(id: string): Promise<void> {
  const { error } = await supabase.from('albums').delete().eq('id', id)

  if (error) throw new Error(error.message)
}
