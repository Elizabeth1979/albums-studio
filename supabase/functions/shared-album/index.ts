import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

/**
 * Serves one shared album to someone who has no account.
 *
 * This exists because of a gap nothing else can close. The `photos` bucket is
 * private, and Storage mints a signed URL only for a caller whose token already
 * permits it — an owner signing their own objects. A visitor holds no token at
 * all, so the signing has to happen somewhere trusted, which means somewhere
 * with the service role key, which means never in a browser.
 *
 * The whole surface is one share token. No album id, no photo id, no owner id
 * is accepted from the caller: everything is reached through the token, and
 * what the token opens is decided by `get_shared_album`, not here. That keeps
 * one rule in one place — a visitor sees an album only while its owner has it
 * shared, sees a caption only if it was published, and sees a story note only
 * if that note was published.
 *
 * Runs without JWT verification, deliberately and uniquely: requiring a JWT
 * would defeat the point of a link that needs no account. The token is the
 * credential, and it is checked in the database on every call.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Long enough to read an album, short enough that a copied URL goes stale. */
const SIGNED_URL_TTL_SECONDS = 60 * 60

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

type SharedRow = {
  album_id: string
  title: string
  description: string | null
  layout: string
  photo_id: string | null
  storage_path: string | null
  thumbnail_path: string | null
  caption: string | null
  alt: string | null
  sort_order: number | null
}

type StoryRow = { photo_id: string; body: string; created_at: string }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const token = new URL(request.url).searchParams.get('token') ?? ''

  // Shape-checked before it reaches the database: a malformed uuid is a 400,
  // not a query. This says nothing about whether a well-formed token exists —
  // that answer is deliberately identical for "wrong token" and "album is no
  // longer shared", so a link cannot be used to probe for albums.
  if (!UUID.test(token)) return json({ error: 'not found' }, 404)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  )

  const [album, stories] = await Promise.all([
    supabase.rpc('get_shared_album', { share_token: token }),
    supabase.rpc('get_shared_album_stories', { share_token: token }),
  ])

  if (album.error) return json({ error: album.error.message }, 500)

  // Checked as seriously as the album's own error. Dropping this silently would
  // serve an album whose published story notes had vanished, which misrepresents
  // what the owner chose to publish rather than merely losing a detail.
  if (stories.error) return json({ error: stories.error.message }, 500)

  const rows = (album.data ?? []) as SharedRow[]
  if (rows.length === 0) return json({ error: 'not found' }, 404)

  const photos = rows.filter((row) => row.photo_id && row.thumbnail_path)

  // Both sizes, not just the thumbnail. A thumbnail is 400px on its longest
  // edge, and a phone asked to fill its width with one upscales it about three
  // times — which is what a visitor saw. The browser picks from the pair, so a
  // small screen still need not pull two megapixels it cannot use.
  const paths = photos.flatMap((row) =>
    [row.thumbnail_path, row.storage_path].filter((path): path is string => Boolean(path)),
  )

  const signed = paths.length
    ? await supabase.storage.from('photos').createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)
    : { data: [], error: null }

  if (signed.error) return json({ error: signed.error.message }, 500)

  const urls = new Map<string, string>()
  for (const entry of signed.data ?? []) {
    if (entry.signedUrl) urls.set(entry.path as string, entry.signedUrl)
  }

  const told = new Map<string, string[]>()
  for (const story of (stories.data ?? []) as StoryRow[]) {
    told.set(story.photo_id, [...(told.get(story.photo_id) ?? []), story.body])
  }

  return json({
    album: {
      title: rows[0].title,
      description: rows[0].description,
      // Anything unrecognised reads as masonry, which keeps each photograph's
      // own proportions and so cannot crop one on the visitor's behalf.
      layout: rows[0].layout === 'grid' ? 'grid' : 'masonry',
    },
    photos: photos.map((row) => ({
      id: row.photo_id,
      caption: row.caption,
      alt: row.alt,
      sortOrder: row.sort_order,
      thumbnailUrl: urls.get(row.thumbnail_path as string) ?? null,
      fullUrl: urls.get(row.storage_path as string) ?? null,
      stories: told.get(row.photo_id as string) ?? [],
    })),
  })
})
