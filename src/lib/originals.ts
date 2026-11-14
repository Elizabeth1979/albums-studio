/**
 * Which chosen files are kept exactly as the camera wrote them.
 *
 * Pure, so the decision is tested without a bucket. The `photos` bucket refuses
 * any type or size outside what is listed here, so both constants are mirrored
 * in `supabase/migrations/*_keep_full_quality_originals.sql`; change them
 * together or uploads start failing for files this module thinks are fine.
 */

/** 50 MB: a 48-megapixel phone frame is well under it; RAW files are not images here. */
export const ORIGINAL_SIZE_LIMIT = 50 * 1024 * 1024

/** MIME type, and the extension its key is stored under. */
const KEPT_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'image/heif': 'heif',
}

/**
 * Some browsers hand a HEIC file over with an empty `type`, so the name is the
 * only evidence of what it is.
 */
const BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
}

export type OriginalFormat = { mime: string; extension: string }

/**
 * How a chosen file is stored as an original, or null when it is not kept.
 *
 * Null is not a failure: the photograph still uploads at the 2000px every
 * photograph had before originals existed, and the photo editor says plainly
 * that full quality is not available for it.
 */
export function originalFormat(file: Pick<File, 'name' | 'type' | 'size'>): OriginalFormat | null {
  if (file.size <= 0 || file.size > ORIGINAL_SIZE_LIMIT) return null

  const fromName = BY_EXTENSION[file.name.split('.').pop()?.toLowerCase() ?? '']
  const mime = KEPT_TYPES[file.type.toLowerCase()] ? file.type.toLowerCase() : fromName

  return mime ? { mime, extension: KEPT_TYPES[mime] } : null
}

/** What a downloaded original is called: the photograph's id, and its own extension. */
export function originalDownloadName(originalPath: string): string {
  const file = originalPath.split('/').pop() ?? originalPath
  return `photo-${file.replace(/-original(?=\.[^.]+$)/, '')}`
}
