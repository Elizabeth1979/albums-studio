import { signedUrls } from './photos'
import { supabase } from './supabase'

/**
 * Search over what the owner has written, across every album she has.
 *
 * The matching happens in the database (`public.search_library`), which reads
 * hidden captions and story notes as the signed-in owner and nobody else. What
 * lives here is turning its rows into something to show: one result per photo
 * or album, and a short piece of the text with the words found in it.
 */

/** Shorter than this, every photograph matches and the list says nothing. */
export const MIN_QUERY_LENGTH = 2

export const FIELDS = [
  'album_title',
  'album_description',
  'album_story',
  'caption',
  'alt',
  'story_note',
] as const

export type SearchField = (typeof FIELDS)[number]

export const FIELD_LABELS: Record<SearchField, string> = {
  album_title: 'Album title',
  album_description: 'Album description',
  album_story: 'Album story',
  caption: 'Caption',
  alt: 'Alt text',
  story_note: 'Story note',
}

export type SearchRow = {
  album_id: string
  album_slug: string
  album_title: string
  photo_id: string | null
  thumbnail_path: string | null
  field: SearchField
  matched_text: string
}

export type SearchMatch = { field: SearchField; text: string }

export type SearchResult = {
  /** `photo:<id>` or `album:<id>`: an album match is about the album, not its cover. */
  key: string
  albumSlug: string
  albumTitle: string
  /** The photo to open. Null for a match on the album itself. */
  photoId: string | null
  /** The photo to show: the photo itself, or the album's cover. */
  thumbnailPath: string | null
  matches: SearchMatch[]
}

const ALBUM_FIELDS: ReadonlySet<SearchField> = new Set([
  'album_title',
  'album_description',
  'album_story',
])

export function isAlbumField(field: SearchField): boolean {
  return ALBUM_FIELDS.has(field)
}

/** The words typed, as the database splits them. */
export function searchTerms(query: string): string[] {
  return query.trim().split(/\s+/).filter(Boolean)
}

/**
 * One result per photograph or album, in the order the database gave.
 *
 * A photo whose caption and story note both match is one result with two
 * matches, not two results showing the same picture.
 */
export function groupResults(rows: SearchRow[]): SearchResult[] {
  const byKey = new Map<string, SearchResult>()

  for (const row of rows) {
    const onAlbum = isAlbumField(row.field)
    const key = onAlbum ? `album:${row.album_id}` : `photo:${row.photo_id}`
    let result = byKey.get(key)

    if (!result) {
      result = {
        key,
        albumSlug: row.album_slug,
        albumTitle: row.album_title,
        photoId: onAlbum ? null : row.photo_id,
        thumbnailPath: row.thumbnail_path,
        matches: [],
      }
      byKey.set(key, result)
    }

    result.matches.push({ field: row.field, text: row.matched_text })
  }

  return [...byKey.values()]
}

export type SnippetPart = { text: string; hit: boolean }

/**
 * A window of the text around the first word found, split into the words found
 * and the words between them.
 *
 * Case-insensitive the way the database is, through `toLocaleLowerCase`, so a
 * Hebrew word (which has no case) and "CAKE" against "cake" both mark. Line
 * breaks are collapsed: an answered question is stored as "question\nanswer".
 */
export function snippet(text: string, terms: string[], width = 160): SnippetPart[] {
  const flat = text.replace(/\s+/g, ' ').trim()
  const lower = flat.toLocaleLowerCase()
  const needles = terms.map((term) => term.toLocaleLowerCase()).filter(Boolean)

  const first = Math.min(
    ...needles.map((needle) => lower.indexOf(needle)).filter((index) => index >= 0),
  )
  let start = Number.isFinite(first) ? Math.max(0, first - Math.floor(width / 3)) : 0
  let end = Math.min(flat.length, start + width)
  start = Math.max(0, end - width)

  // Never cut a word in half at either edge.
  if (start > 0) {
    const space = flat.indexOf(' ', start)
    if (space !== -1 && space < (Number.isFinite(first) ? first : end)) start = space + 1
  }
  if (end < flat.length) {
    const space = flat.lastIndexOf(' ', end)
    if (space > start) end = space
  }

  const window = flat.slice(start, end)
  const windowLower = lower.slice(start, end)
  const parts: SnippetPart[] = []
  let plain = ''
  let index = 0

  while (index < window.length) {
    const needle = needles.find((candidate) => windowLower.startsWith(candidate, index))
    if (needle) {
      if (plain) parts.push({ text: plain, hit: false })
      plain = ''
      parts.push({ text: window.slice(index, index + needle.length), hit: true })
      index += needle.length
    } else {
      plain += window[index]
      index += 1
    }
  }
  if (plain) parts.push({ text: plain, hit: false })

  if (start > 0) parts.unshift({ text: '… ', hit: false })
  if (end < flat.length) parts.push({ text: ' …', hit: false })

  return parts
}

/** Search the signed-in owner's library, with each result's picture signed. */
export async function searchLibrary(
  query: string,
): Promise<{ results: SearchResult[]; thumbnails: Map<string, string> }> {
  const { data, error } = await supabase.rpc('search_library', { search_text: query.trim() })
  if (error) throw new Error(error.message)

  const results = groupResults((data ?? []) as SearchRow[])
  const paths = [
    ...new Set(
      results.map((result) => result.thumbnailPath).filter((path): path is string => Boolean(path)),
    ),
  ]

  return { results, thumbnails: await signedUrls(paths) }
}
