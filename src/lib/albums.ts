import { photoObjectPaths, removePhotoObjects } from './photos'
import { currentOwnerId } from './session'
import { supabase } from './supabase'

export const ALBUM_LAYOUTS = ['masonry', 'grid'] as const

/**
 * Who can open an album.
 *
 * The database enum also holds `public`, which no interface offers and nothing
 * sets. A link is unguessable and can be withdrawn by rotating the token;
 * `public` needs no token at all, invites indexing, and cannot meaningfully be
 * taken back. It stays in the schema for a phase that has a reason for it.
 */
export const ALBUM_VISIBILITIES = ['private', 'link'] as const

export type AlbumLayout = (typeof ALBUM_LAYOUTS)[number]

export type AlbumVisibility = (typeof ALBUM_VISIBILITIES)[number]

export type Album = {
  id: string
  title: string
  slug: string
  layout: AlbumLayout
  description: string | null
  /** The photo shown on the album's card, or null while the album is empty. */
  coverPhotoId: string | null
  visibility: AlbumVisibility
  createdAt: string
}

type AlbumRow = {
  id: string
  title: string
  slug: string
  layout: AlbumLayout
  description: string | null
  cover_photo_id: string | null
  visibility: AlbumVisibility
  created_at: string
}

const ALBUM_COLUMNS =
  'id, title, slug, layout, description, cover_photo_id, visibility, created_at'

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
    visibility: row.visibility,
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

/**
 * Opens or closes an album to people holding its link.
 *
 * Turning sharing off is immediate and complete: every share function checks
 * the album's visibility on each call, so a link that worked a second ago stops
 * working, without needing the token to change.
 */
export async function setAlbumVisibility(
  id: string,
  visibility: AlbumVisibility,
): Promise<Album> {
  return updateAlbum(id, { visibility })
}

/**
 * Deletes an album, and the photographs' bytes with it.
 *
 * The photo rows cascade away on their own, but Storage holds no foreign keys,
 * so the objects would stay in the bucket for good — invisible to the owner,
 * paid for indefinitely, and flatly contradicting the confirmation that said
 * the photos go too.
 *
 * The order is deliberate. Paths are collected while the rows still exist, the
 * rows go next, and only then the bytes. Removing bytes first would, if the row
 * delete then failed, leave an album whose photographs are all broken images —
 * strictly worse than the leak. This way the failure case is the behaviour we
 * already had, and the success case is the one we want.
 */
export async function deleteAlbum(id: string): Promise<void> {
  const paths = await photoObjectPaths(id)

  const { error } = await supabase.from('albums').delete().eq('id', id)

  if (error) throw new Error(error.message)

  await removePhotoObjects(paths)
}
