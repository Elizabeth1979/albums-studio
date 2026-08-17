import { type ProcessedImage, processImage } from './process'
import type { ProcessRequest, ProcessResponse } from './worker'

class RelayedUnreadableError extends Error {
  detail: string

  constructor(message: string, detail: string) {
    super(message)
    this.name = 'UnreadableImageError'
    this.detail = detail
  }
}

export type ImageProcessor = {
  process: (file: File, fileName: string) => Promise<ProcessedImage>
  dispose: () => void
}

/** Older browsers without OffscreenCanvas cannot do this work off the main thread. */
function workersUsable(): boolean {
  return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined'
}

function mainThreadProcessor(): ImageProcessor {
  return {
    process: (file, fileName) => processImage(file, fileName),
    dispose: () => {},
  }
}

/**
 * Runs image work in a worker, falling back to the main thread when that is not
 * available. The fallback still produces correct results; it just competes with
 * rendering, so a large import will feel slower rather than fail.
 */
export function createImageProcessor(): ImageProcessor {
  if (!workersUsable()) return mainThreadProcessor()

  let worker: Worker

  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  } catch {
    return mainThreadProcessor()
  }

  const pending = new Map<
    string,
    { resolve: (image: ProcessedImage) => void; reject: (error: Error) => void }
  >()

  worker.addEventListener('message', (event: MessageEvent<ProcessResponse>) => {
    const response = event.data
    const waiting = pending.get(response.id)
    if (!waiting) return

    pending.delete(response.id)

    if (response.ok) {
      const { id: _id, ok: _ok, ...image } = response
      waiting.resolve(image)
      return
    }

    // The worker already phrased this for the file it saw; re-deriving a name
    // from the text would only risk losing it.
    waiting.reject(
      response.unreadable
        ? new RelayedUnreadableError(response.message, response.detail)
        : new Error(response.message),
    )
  })

  // A worker that dies takes every in-flight file with it; failing them loudly
  // beats promises that never settle and a queue that appears to hang.
  worker.addEventListener('error', () => {
    for (const waiting of pending.values()) {
      waiting.reject(new Error('Image processing stopped unexpectedly.'))
    }
    pending.clear()
  })

  return {
    process(file, fileName) {
      const id = crypto.randomUUID()

      return new Promise<ProcessedImage>((resolve, reject) => {
        pending.set(id, { resolve, reject })
        const request: ProcessRequest = { id, file, fileName }
        worker.postMessage(request)
      })
    },
    dispose() {
      pending.clear()
      worker.terminate()
    },
  }
}
