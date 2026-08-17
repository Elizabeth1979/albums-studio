import { mapWithConcurrency, withRetry } from './concurrency'
import type { ImageProcessor } from './imaging/processor'
import type { Photo } from './photos'
import type { ProcessedImage } from './imaging/process'

/**
 * Four at a time. Each slot holds a decoded bitmap plus two encoded blobs, so
 * the ceiling is memory on a phone rather than bandwidth on a laptop.
 */
export const UPLOAD_CONCURRENCY = 4

export const UPLOAD_ATTEMPTS = 3

export type UploadStatus = 'waiting' | 'processing' | 'uploading' | 'done' | 'failed'

export type UploadItem = {
  id: string
  fileName: string
  status: UploadStatus
  error: string | null
  /** True when retrying is pointless, e.g. a format this browser cannot decode. */
  permanent: boolean
}

export type UploadDeps = {
  processor: ImageProcessor
  store: (input: {
    albumId: string
    image: ProcessedImage
    sortOrder: number
  }) => Promise<Photo>
  onItemChange: (item: UploadItem) => void
  onPhoto: (photo: Photo) => void
  concurrency?: number
  attempts?: number
  wait?: (ms: number) => Promise<void>
}

export type UploadRequest = {
  id: string
  file: File
}

/**
 * A format the browser cannot decode fails identically every time, so retrying
 * only delays the same answer. Matched by name because the worker relays the
 * failure across a message boundary, where the class itself cannot survive.
 */
function isPermanent(error: unknown): boolean {
  return error instanceof Error && error.name === 'UnreadableImageError'
}

function messageFor(error: unknown, fileName: string): string {
  return error instanceof Error ? error.message : `${fileName} could not be uploaded.`
}

/**
 * Processes and uploads a batch, reporting each file as it moves.
 *
 * Sort order is assigned up front from the position in the batch, so photos
 * keep the order they were chosen in even though they finish out of order.
 */
export async function runUploads(
  albumId: string,
  requests: readonly UploadRequest[],
  firstSortOrder: number,
  deps: UploadDeps,
): Promise<void> {
  const {
    processor,
    store,
    onItemChange,
    onPhoto,
    concurrency = UPLOAD_CONCURRENCY,
    attempts = UPLOAD_ATTEMPTS,
    wait,
  } = deps

  await mapWithConcurrency(requests, concurrency, async (request, index) => {
    const base: UploadItem = {
      id: request.id,
      fileName: request.file.name,
      status: 'processing',
      error: null,
      permanent: false,
    }

    onItemChange(base)

    try {
      const photo = await withRetry(
        async ({ number }) => {
          // Only the first attempt reports processing; a retry is almost always
          // the network, and flicking the label back would just be noise.
          if (number > 1) onItemChange({ ...base, status: 'processing' })

          const image = await processor.process(request.file, request.file.name)

          onItemChange({ ...base, status: 'uploading' })

          return store({
            albumId,
            image,
            sortOrder: firstSortOrder + index,
          })
        },
        { attempts, shouldRetry: (error) => !isPermanent(error), ...(wait ? { wait } : {}) },
      )

      onItemChange({ ...base, status: 'done' })
      onPhoto(photo)
    } catch (error) {
      onItemChange({
        ...base,
        status: 'failed',
        error: messageFor(error, request.file.name),
        permanent: isPermanent(error),
      })
    }
  })
}
