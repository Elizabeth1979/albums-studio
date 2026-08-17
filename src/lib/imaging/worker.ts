/// <reference lib="webworker" />
import { type ProcessedImage, UnreadableImageError, processImage } from './process'

export type ProcessRequest = {
  id: string
  file: File | Blob
  fileName: string
}

export type ProcessResponse =
  | ({ id: string; ok: true } & ProcessedImage)
  | { id: string; ok: false; message: string; unreadable: boolean }

/**
 * Decoding and resizing a 50-megapixel photo takes long enough to drop frames,
 * and an album import does it hundreds of times. Doing it here keeps the page
 * responsive while the queue runs.
 */
self.addEventListener('message', async (event: MessageEvent<ProcessRequest>) => {
  const { id, file, fileName } = event.data

  try {
    const image = await processImage(file, fileName)
    const response: ProcessResponse = { id, ok: true, ...image }
    self.postMessage(response)
  } catch (error) {
    const response: ProcessResponse = {
      id,
      ok: false,
      unreadable: error instanceof UnreadableImageError,
      message: error instanceof Error ? error.message : `${fileName} could not be processed.`,
    }
    self.postMessage(response)
  }
})
