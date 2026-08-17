import { currentOwnerId } from './session'
import { supabase } from './supabase'

export const PHOTO_BUCKET = 'photos'

/** Signed URLs are short-lived on purpose; the bucket itself stays private. */
const SIGNED_URL_TTL_SECONDS = 60 * 60

export type Photo = {
  id: string
  storagePath: string
  thumbnailPath: string | null
  width: number | null
  height: number | null
  caption: string | null
  alt: string | null
  sortOrder: number
}

type PhotoRow = {
  id: string
  storage_path: string
  thumbnail_path: string | null
  width: number | null
  height: number | null
  caption: string | null
  alt: string | null
  sort_order: number
}

const PHOTO_COLUMNS =
  'id, storage_path, thumbnail_path, width, height, caption, alt, sort_order'

function toPhoto(row: PhotoRow): Photo {
  return {
    id: row.id,
    storagePath: row.storage_path,
    thumbnailPath: row.thumbnail_path,
    width: row.width,
    height: row.height,
    caption: row.caption,
    alt: row.alt,
    sortOrder: row.sort_order,
  }
}

export async function listPhotos(albumId: string): Promise<Photo[]> {
  const { data, error } = await supabase
    .from('photos')
    .select(PHOTO_COLUMNS)
    .eq('album_id', albumId)
    .order('sort_order', { ascending: true })

  if (error) throw new Error(error.message)

  return (data ?? []).map((row) => toPhoto(row as PhotoRow))
}

export type ProcessedImage = {
  full: Blob
  thumbnail: Blob
  width: number
  height: number
  phash: string
  sharpness: number
}

/**
 * Object keys start with the owner's uuid because both the Storage policy and
 * a database check constraint require it. Keeping the album in the key as well
 * makes an object's home obvious when looking at the bucket directly.
 */
function objectKey(ownerId: string, albumId: string, id: string, suffix = ''): string {
  return `${ownerId}/${albumId}/${id}${suffix}.jpg`
}

/**
 * Uploads one processed photo and records it.
 *
 * Storage comes first: a row pointing at bytes that were never written would be
 * a broken photo in the album, whereas bytes with no row are invisible and can
 * be swept up later. If the row fails, the uploaded objects are removed so a
 * retry does not leave orphans behind.
 */
export async function storePhoto(input: {
  albumId: string
  image: ProcessedImage
  sortOrder: number
}): Promise<Photo> {
  const ownerId = await currentOwnerId()
  const id = crypto.randomUUID()
  const storagePath = objectKey(ownerId, input.albumId, id)
  const thumbnailPath = objectKey(ownerId, input.albumId, id, '-thumb')

  const bucket = supabase.storage.from(PHOTO_BUCKET)

  const uploaded = await bucket.upload(storagePath, input.image.full, {
    contentType: 'image/jpeg',
    upsert: false,
  })
  if (uploaded.error) throw new Error(uploaded.error.message)

  const uploadedThumb = await bucket.upload(thumbnailPath, input.image.thumbnail, {
    contentType: 'image/jpeg',
    upsert: false,
  })
  if (uploadedThumb.error) {
    await bucket.remove([storagePath])
    throw new Error(uploadedThumb.error.message)
  }

  const { data, error } = await supabase
    .from('photos')
    .insert({
      album_id: input.albumId,
      owner_id: ownerId,
      storage_path: storagePath,
      thumbnail_path: thumbnailPath,
      mime: 'image/jpeg',
      width: input.image.width,
      height: input.image.height,
      phash: input.image.phash,
      sharpness: input.image.sharpness,
      sort_order: input.sortOrder,
    })
    .select(PHOTO_COLUMNS)
    .single()

  if (error) {
    await bucket.remove([storagePath, thumbnailPath])
    throw new Error(error.message)
  }

  return toPhoto(data as PhotoRow)
}

/**
 * Short-lived URLs for objects in the private bucket, keyed by storage path.
 *
 * Storage mints these only after checking its own policy against the caller's
 * token, so an owner can sign nothing but their own objects. Shared viewers
 * have no token at all and will need trusted server code to sign on their
 * behalf, which is Phase 6's problem rather than this one's.
 */
export async function signedUrls(paths: string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>()
  if (paths.length === 0) return urls

  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)

  if (error) throw new Error(error.message)

  for (const entry of data ?? []) {
    if (entry.signedUrl && entry.path) urls.set(entry.path, entry.signedUrl)
  }

  return urls
}
