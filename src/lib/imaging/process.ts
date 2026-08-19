import { readTakenAt } from './exif'
import { explainUnreadable, explainUnreadableFile } from './formats'
import { toLuma } from './luma'
import { perceptualHash } from './phash'
import { laplacianVariance } from './sharpness'

/** Longest edge of the stored image. */
export const FULL_SIZE = 2000

/** Longest edge of the thumbnail the album grid renders. */
export const THUMBNAIL_SIZE = 400

/** Signals are measured at this size: cheap, and enough for both of them. */
const ANALYSIS_SIZE = 256

const JPEG_QUALITY = 0.85
const THUMBNAIL_QUALITY = 0.75

export type ProcessedImage = {
  full: Blob
  thumbnail: Blob
  width: number
  height: number
  phash: string
  sharpness: number
  /**
   * When the camera says the photograph was taken, or null.
   *
   * Read from the file the camera wrote, because drawing to a canvas and
   * re-encoding leaves EXIF behind — so this has to happen before any of the
   * work below, not after.
   */
  takenAt: string | null
}

export class UnreadableImageError extends Error {
  /** The browser's own words, kept so a report says more than "it failed". */
  detail: string

  constructor(fileName: string, mimeType = '', detail = '') {
    super(explainUnreadable(fileName, mimeType))
    this.name = 'UnreadableImageError'
    this.detail = detail
  }
}

/**
 * The bytes never arrived, so nothing can be said about the format.
 *
 * On Android a file chosen through the picker is handed over by whichever app
 * owns it, and one that lives only in cloud storage can produce a File that
 * reads as empty or fails outright. Calling that a damaged or unsupported image
 * is both wrong and unhelpful: the remedy is to open it once in the gallery so
 * it downloads.
 */
export class UnreadableFileError extends Error {
  detail: string

  constructor(fileName: string, detail = '') {
    super(explainUnreadableFile(fileName))
    this.name = 'UnreadableFileError'
    this.detail = detail
  }
}

/**
 * Failures that will repeat identically, so the queue must not spend three
 * attempts arriving at the same answer.
 *
 * Matched by name rather than by class: the worker relays failures across
 * postMessage, where a class cannot survive. Keeping the set here means the
 * worker and the upload queue cannot drift apart about what "permanent" means.
 */
const PERMANENT = new Set(['UnreadableImageError', 'UnreadableFileError'])

export function isPermanentFailure(error: unknown): boolean {
  return error instanceof Error && PERMANENT.has(error.name)
}

/** The browser's own words, when the failure carried any. */
export function detailOf(error: unknown): string {
  return error instanceof Error &&
    'detail' in error &&
    typeof (error as { detail: unknown }).detail === 'string'
    ? (error as { detail: string }).detail
    : ''
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    return error.message ? `${error.name}: ${error.message}` : error.name
  }

  return String(error)
}

/**
 * Waits before reading again, so a download has a chance to finish.
 *
 * Exported only so the tests need not spend real seconds proving the retry.
 */
export const READ_RETRY_DELAYS_MS = [400, 1200]

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Turns the chosen file into bytes this device definitely holds.
 *
 * Reading up front separates two failures that used to look identical: bytes
 * that could not be fetched at all, and bytes that could not be decoded. Only
 * the second is anything to do with the image format.
 *
 * It reads more than once. On Android a photograph that lives in the cloud is
 * fetched by its owning app at the moment it is read, and the first attempt can
 * fail — with NotReadableError, or with zero bytes — while that download is
 * still running. Asking again a moment later is the same remedy the error
 * message asks the owner to perform by hand, so it is worth trying first.
 */
async function readBytes(file: File | Blob, fileName: string): Promise<ArrayBuffer> {
  let detail = ''

  for (let attempt = 0; ; attempt += 1) {
    try {
      const bytes = await file.arrayBuffer()

      if (bytes.byteLength > 0) return bytes

      detail = 'the file was empty (0 bytes)'
    } catch (error) {
      detail = describe(error)
    }

    if (attempt >= READ_RETRY_DELAYS_MS.length) break

    await pause(READ_RETRY_DELAYS_MS[attempt])
  }

  throw new UnreadableFileError(fileName, detail)
}

/**
 * Decodes, retrying at a bounded size if the first attempt fails.
 *
 * A phone camera writes photographs far larger than anything shown on screen,
 * and decoding one at full resolution allocates four bytes per pixel: a
 * 108-megapixel frame is over 400 MB before any resizing happens, which a phone
 * can refuse. Asking the decoder to scale as it reads costs one line and needs
 * a fraction of that. Passing only a width keeps the aspect ratio, so the
 * result is never distorted, only sometimes a little larger than the ceiling —
 * which the resize below brings down anyway.
 */
async function decode(source: Blob, fileName: string, mimeType: string): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(source)
  } catch (first) {
    try {
      return await createImageBitmap(source, {
        resizeWidth: FULL_SIZE,
        resizeQuality: 'high',
      })
    } catch {
      // The first failure is the honest one to report: the retry only narrows
      // the size, so its message describes the same underlying problem.
      throw new UnreadableImageError(fileName, mimeType, describe(first))
    }
  }
}

/** Scales to fit inside `longestEdge` without ever enlarging. */
export function fitWithin(
  width: number,
  height: number,
  longestEdge: number,
): { width: number; height: number } {
  const scale = Math.min(1, longestEdge / Math.max(width, height))

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

function draw(source: ImageBitmap, width: number, height: number): OffscreenCanvas {
  const canvas = new OffscreenCanvas(width, height)
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('This browser could not provide a 2D canvas.')
  }

  context.drawImage(source, 0, 0, width, height)

  return canvas
}

/**
 * Decode, resize, and measure one file, entirely in the browser.
 *
 * Nothing here needs a server or a model: the resize is a canvas draw, the
 * perceptual hash is a DCT, and sharpness is a Laplacian variance. Keeping them
 * local is what lets duplicate detection and best-shot ranking stay free later.
 */
export async function processImage(file: File | Blob, fileName: string): Promise<ProcessedImage> {
  // Asking the browser to decode is the only reliable capability test: it needs
  // no list of formats, devices or versions, and a format the browser learns to
  // read later starts working with no change here. What it cannot tell us is
  // whether the file arrived at all, which is why the bytes are read first.
  const bytes = await readBytes(file, fileName)

  // Before decoding: the canvas keeps the pixels and drops everything else.
  const takenAt = readTakenAt(bytes)

  const bitmap = await decode(new Blob([bytes], { type: file.type }), fileName, file.type)

  try {
    const full = fitWithin(bitmap.width, bitmap.height, FULL_SIZE)
    const thumb = fitWithin(bitmap.width, bitmap.height, THUMBNAIL_SIZE)
    const analysis = fitWithin(bitmap.width, bitmap.height, ANALYSIS_SIZE)

    const fullCanvas = draw(bitmap, full.width, full.height)
    const thumbCanvas = draw(bitmap, thumb.width, thumb.height)
    const analysisCanvas = draw(bitmap, analysis.width, analysis.height)

    const pixels = analysisCanvas
      .getContext('2d')!
      .getImageData(0, 0, analysis.width, analysis.height)
    const luma = toLuma(pixels.data)

    const [fullBlob, thumbnailBlob] = await Promise.all([
      fullCanvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY }),
      thumbCanvas.convertToBlob({ type: 'image/jpeg', quality: THUMBNAIL_QUALITY }),
    ])

    return {
      full: fullBlob,
      thumbnail: thumbnailBlob,
      width: full.width,
      height: full.height,
      phash: perceptualHash(luma, analysis.width, analysis.height),
      sharpness: laplacianVariance(luma, analysis.width, analysis.height),
      takenAt,
    }
  } finally {
    // Decoded bitmaps hold real memory, and a phone running through five
    // hundred of them will not survive leaking every one.
    bitmap.close()
  }
}
