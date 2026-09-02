/**
 * Finding the people in a photograph.
 *
 * Five measures of the whole frame have failed on the owner's album, and the
 * reason they rhyme is now clear: a good portrait and a badly focused snapshot
 * contain the same mixture of sharp and soft pixels, and what separates them is
 * *which part* is sharp. Her own words while the fifth was being tried — "if
 * faces are clear and there is blur around them, it might be a good image, and
 * that might be a technique" — are the whole argument. No statistic over the
 * whole frame can know that. So find the subject and judge the subject.
 *
 * This module only finds. It says where the faces are and, just as importantly,
 * says clearly when it could not look at all. Nothing yet acts on what it
 * returns: whether BlazeFace can see a small boy in a hat at some distance in a
 * real beach photograph is not a question any scene built here can answer, and
 * the album is the only place it can be answered. So the answer goes on screen
 * first and is acted on afterwards.
 */
import type { FaceDetector } from '@mediapipe/tasks-vision'

/** Where a face is, in pixels of the frame it was found in. */
export type FaceBox = {
  x: number
  y: number
  width: number
  height: number
  /** How sure the detector was, between 0 and 1. */
  confidence: number
}

/**
 * What came of looking for faces. Three outcomes, and the third is the point.
 *
 * "No face here" and "the detector never loaded" are completely different
 * facts, and this feature has been debugged blind three times because outcomes
 * like these were collapsed into one silence. A detector that failed to load
 * would otherwise make every photograph in an album look like a landscape.
 */
export type FaceReading =
  | { kind: 'faces'; boxes: FaceBox[] }
  | { kind: 'none' }
  | { kind: 'unavailable'; detail: string }

/**
 * How sure the detector must be before a face counts.
 *
 * Measured rather than taken from the library, whose default is 0.5. Across
 * repeated draws of four scenes in a real browser:
 *
 * | confidence | a face | random squares | dense texture | flat |
 * | --- | --- | --- | --- | --- |
 * | 0.5 | 20/20 | 0/60 | 0/30 | 0/20 |
 * | 0.6 | 20/20 | **1/60 at 0.603** | 0/30 | 0/20 |
 * | 0.7 | 20/20 | 0/60 | 0/30 | 0/20 |
 * | 0.8 | 20/20 | 0/60 | 0/30 | 0/20 |
 * | 0.9 | **10/20** | 0/60 | 0/30 | 0/20 |
 *
 * Two things decide it. BlazeFace does occasionally find a face in random
 * rectangles — about one draw in sixty, and it scored 0.603 when it did — so
 * the line has to sit above that, because a false face would point the blur
 * measurement at a patch of nothing and condemn a photograph that came out. And
 * at 0.9 the detector loses half the faces it should find, which is the other
 * way to be useless.
 *
 * 0.8 keeps every true detection and sits two tenths above the highest false
 * one seen. Dense multi-scale texture — the closest thing here to water over
 * pebbles, which is what her album is full of — never fired at any setting.
 *
 * These are synthetic faces, so this number is a starting point and not a
 * finding. The album decides.
 */
const CONFIDENCE = 0.8

/** Where the vision runtime and the model are served from. Same origin, on purpose. */
const ASSETS = '/mediapipe'

let pending: Promise<FaceDetector> | null = null

/**
 * Builds the detector once, on first use.
 *
 * Lazily, because it costs about 3.3 MB over the wire and half a second to
 * start, and an album of landscapes should pay neither until something asks.
 * The promise is cached rather than the detector, so two photographs measured
 * at the same moment wait on one load instead of starting two.
 */
async function detector(): Promise<FaceDetector> {
  pending ??= (async () => {
    const { FaceDetector: Detector, FilesetResolver } = await import('@mediapipe/tasks-vision')
    const fileset = await FilesetResolver.forVisionTasks(ASSETS)

    return Detector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: `${ASSETS}/blaze_face_short_range.tflite` },
      runningMode: 'IMAGE',
      minDetectionConfidence: CONFIDENCE,
    })
  })()

  try {
    return await pending
  } catch (error) {
    // A failed load must not poison every later album. Clearing this lets the
    // next attempt try again — a wasm fetch can fail for reasons that pass.
    pending = null
    throw error
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message ? `${error.name}: ${error.message}` : error.name

  return String(error)
}

/** Releases the detector, for a screen that is going away. */
export function forgetDetector(): void {
  const held = pending
  pending = null
  void held?.then((one) => one.close()).catch(() => {})
}

/**
 * Finds the faces in one already-decoded frame.
 *
 * **This runs on the main thread, and not by choice.** The blur measurement
 * happens in a module worker, which is where this belongs too, and MediaPipe
 * cannot start there: its runtime hands the wasm module to itself through a
 * global that only a classic worker's `importScripts` sets, so a module worker
 * fails with "ModuleFactory not set". A classic worker is not an easy way out
 * either — the package's CommonJS bundle is not UMD and needs an `exports`
 * shim. Both were tried in a real browser before this was written.
 *
 * So detection competes with rendering. It is bearable because it is lazy, runs
 * four photographs at a time behind the album that is already on screen, and
 * takes about 160 ms a frame. If it ever stops being bearable, the way out is a
 * classic worker with that shim, not a rewrite.
 */
export async function detectFaces(frame: ImageBitmap | OffscreenCanvas): Promise<FaceReading> {
  let found: FaceDetector

  try {
    found = await detector()
  } catch (error) {
    return { kind: 'unavailable', detail: describe(error) }
  }

  try {
    const result = found.detect(frame as unknown as HTMLCanvasElement)

    const boxes = result.detections.flatMap((one) => {
      const box = one.boundingBox
      if (!box) return []

      return [{
        x: box.originX,
        y: box.originY,
        width: box.width,
        height: box.height,
        confidence: one.categories[0]?.score ?? 0,
      }]
    })

    return boxes.length > 0 ? { kind: 'faces', boxes } : { kind: 'none' }
  } catch (error) {
    return { kind: 'unavailable', detail: describe(error) }
  }
}

/**
 * Finds the faces in a stored photograph, from bytes the album already holds.
 *
 * The bitmap is handed to the detector whole rather than reduced first, which
 * sounds wasteful and is not: BlazeFace resizes whatever it is given to 128x128
 * before it looks at anything. That is also the limit of what this can do, and
 * it is worth being plain about it — **a boy who fills a twentieth of the frame
 * is about six pixels across by the time the model sees him.** The handoff
 * named him as the risk, and this is the mechanism behind that risk. If the
 * owner's album comes back saying no face was found, the answer is not a
 * different threshold; it is to run the detector over tiles of the photograph
 * so a small face arrives at the model larger, or to give up on faces and find
 * the subject some other way.
 *
 * Which is why nothing acts on this yet.
 */
export async function findFacesIn(photograph: Blob): Promise<FaceReading> {
  let bitmap: ImageBitmap

  try {
    bitmap = await createImageBitmap(photograph)
  } catch (error) {
    return { kind: 'unavailable', detail: describe(error) }
  }

  try {
    return await detectFaces(bitmap)
  } finally {
    bitmap.close()
  }
}
