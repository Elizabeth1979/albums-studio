import { supabase } from './supabase'

export const ALBUM_LAYOUTS = ['masonry', 'grid'] as const

export type AlbumLayout = (typeof ALBUM_LAYOUTS)[number]

export type Album = {
  id: string
  title: string
  slug: string
  layout: AlbumLayout
  description: string | null
  createdAt: string
}

type AlbumRow = {
  id: string
  title: string
  slug: string
  layout: AlbumLayout
  description: string | null
  created_at: string
}

const ALBUM_COLUMNS = 'id, title, slug, layout, description, created_at'

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

async function currentOwnerId(): Promise<string> {
  const { data, error } = await supabase.auth.getClaims()

  if (error || typeof data?.claims.sub !== 'string') {
    throw new Error('Your session has expired. Sign in again.')
  }

  return data.claims.sub
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
}): Promise<Album> {
  const title = input.title.trim()

  if (!title) {
    throw new Error('Give the album a title.')
  }

  const ownerId = await currentOwnerId()
  const base = slugify(title)

  // Slugs are unique per owner, so a second "Summer" needs its own. Ask the
  // database rather than pre-checking: a read-then-write would still race.
  for (let attempt = 1; attempt <= 25; attempt += 1) {
    const slug = attempt === 1 ? base : `${base}-${attempt}`
    const { data, error } = await supabase
      .from('albums')
      .insert({ owner_id: ownerId, title, slug, layout: input.layout })
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

export async function setAlbumLayout(id: string, layout: AlbumLayout): Promise<Album> {
  return updateAlbum(id, { layout })
}

export async function deleteAlbum(id: string): Promise<void> {
  const { error } = await supabase.from('albums').delete().eq('id', id)

  if (error) throw new Error(error.message)
}
