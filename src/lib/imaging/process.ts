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
}

export class UnreadableImageError extends Error {
  constructor(fileName: string) {
    super(`${fileName} could not be read as an image in this browser.`)
    this.name = 'UnreadableImageError'
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
  let bitmap: ImageBitmap

  try {
    // HEIC is the common casualty here: most browsers outside Safari cannot
    // decode it, and the failure has to name the file rather than vanish.
    bitmap = await createImageBitmap(file)
  } catch {
    throw new UnreadableImageError(fileName)
  }

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
    }
  } finally {
    // Decoded bitmaps hold real memory, and a phone running through five
    // hundred of them will not survive leaking every one.
    bitmap.close()
  }
}
