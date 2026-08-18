import { supabase } from './supabase'

/**
 * A share link's token, and how to retire it.
 *
 * The token never travels on an album row. It is a bearer credential — whoever
 * holds it is the visitor — so it lives in a schema the Data API cannot reach
 * and is handed out by a function that checks who is asking.
 */
export async function albumShareToken(albumId: string): Promise<string> {
  const { data, error } = await supabase.rpc('album_share_token', { album: albumId })

  if (error) throw new Error(error.message)
  if (!data) throw new Error('This album has no share link yet.')

  return data as string
}

/**
 * Replaces the token, which retires every link already handed out.
 *
 * There is no way to withdraw one copy of a link and leave another working:
 * the token is the link. The interface says so rather than implying a
 * per-recipient control that cannot exist.
 */
export async function rotateShareToken(albumId: string): Promise<string> {
  const { data, error } = await supabase.rpc('rotate_album_share_token', {
    album: albumId,
  })

  if (error) throw new Error(error.message)

  return data as string
}

/** The address to hand to someone, on whatever origin this is running on. */
export function shareUrl(token: string): string {
  return `${window.location.origin}/shared/${token}`
}

export type SharedPhoto = {
  id: string
  caption: string | null
  alt: string | null
  sortOrder: number | null
  thumbnailUrl: string | null
  stories: string[]
}

export type SharedAlbum = {
  album: { title: string; description: string | null }
  photos: SharedPhoto[]
}

/**
 * Loads a shared album as a visitor.
 *
 * Not through the Data API. A visitor has no session, and the photos bucket is
 * private, so nothing in a browser can mint a URL for the image bytes. The Edge
 * Function holds the only key that can, and it accepts nothing but the token.
 */
export async function loadSharedAlbum(token: string): Promise<SharedAlbum> {
  const base = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

  const response = await fetch(
    `${base}/functions/v1/shared-album?token=${encodeURIComponent(token)}`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  )

  if (response.status === 404) {
    // Deliberately the same answer for a token that never existed, one that has
    // been rotated away, and an album whose owner has stopped sharing it. A
    // visitor cannot tell those apart, and should not be able to.
    throw new Error('This album is not available.')
  }

  if (!response.ok) {
    throw new Error('This album could not be loaded.')
  }

  return (await response.json()) as SharedAlbum
}
