/// <reference lib="webworker" />
import { type FocusReading, measureFocus } from './measure'
import { type ProcessedImage, detailOf, isPermanentFailure, processImage } from './process'

export type ProcessRequest = {
  id: string
  file: File | Blob
  fileName: string
}

/** Judging the focus of a photograph the album already holds. */
export type MeasureRequest = {
  id: string
  measure: Blob
}

export type WorkerRequest = ProcessRequest | MeasureRequest

export type ProcessResponse =
  | ({ id: string; ok: true } & ProcessedImage)
  | { id: string; ok: false; message: string; detail: string; unreadable: boolean }
  | { id: string; ok: true; reading: FocusReading }

function isMeasure(request: WorkerRequest): request is MeasureRequest {
  return 'measure' in request
}

/**
 * Decoding and resizing a 50-megapixel photo takes long enough to drop frames,
 * and an album import does it hundreds of times. Doing it here keeps the page
 * responsive while the queue runs.
 */
self.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  if (isMeasure(event.data)) {
    const { id, measure } = event.data
    const response: ProcessResponse = { id, ok: true, reading: await measureFocus(measure) }
    self.postMessage(response)
    return
  }

  const { id, file, fileName } = event.data

  try {
    const image = await processImage(file, fileName)
    const response: ProcessResponse = { id, ok: true, ...image }
    self.postMessage(response)
  } catch (error) {
    const response: ProcessResponse = {
      id,
      ok: false,
      unreadable: isPermanentFailure(error),
      message: error instanceof Error ? error.message : `${fileName} could not be processed.`,
      // Relayed rather than re-derived: the worker is the only place that saw
      // what the decoder actually said, and a class cannot cross postMessage.
      detail: detailOf(error),
    }
    self.postMessage(response)
  }
})
