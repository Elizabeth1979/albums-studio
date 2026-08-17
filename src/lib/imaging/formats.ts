/**
 * Formats every current browser decodes. These are what the uploader promises;
 * anything else is attempted anyway and explained if it fails.
 */
export const UNIVERSAL_FORMATS = 'JPEG, PNG, WebP and AVIF'

const HEIF_EXTENSION = /\.(heic|heif)$/i
const HEIF_MIME = /^image\/(heic|heif)/i

function isHeif(fileName: string, mimeType: string): boolean {
  return HEIF_EXTENSION.test(fileName) || HEIF_MIME.test(mimeType)
}

/**
 * Explains a decode failure in terms of what to do about it.
 *
 * Nothing here is predicted in advance: the browser is asked to decode the file
 * and only a real failure produces a message. That is what keeps the uploader
 * device-agnostic — no list of phones, no assumption about which camera wrote
 * the file, and formats that a future browser learns to read simply start
 * working without a change here.
 *
 * HEIC gets its own sentence because it is the one common case with a specific
 * remedy. Apple stores photos as HEIC, and iOS converts them to JPEG when they
 * are chosen through a file input, so an iPhone owner rarely meets this. A HEIC
 * file reaching Chrome or Firefox — copied to a computer, or an Android camera
 * set to HEIF — cannot be decoded there at all.
 */
export function explainUnreadable(fileName: string, mimeType: string): string {
  if (isHeif(fileName, mimeType)) {
    return `${fileName} is a HEIC photo, which this browser cannot open. Adding it from an iPhone converts it automatically; otherwise save or export it as JPEG first.`
  }

  return `${fileName} could not be read as an image here. It may be damaged, or in a format this browser does not support.`
}
