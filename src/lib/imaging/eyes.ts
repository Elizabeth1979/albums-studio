/**
 * Reading whether the eyes in each face are open.
 *
 * Faces are found first by `faces.ts`, and only then read here, one cut-out at a
 * time. The landmark model cannot find faces on its own in the photographs this
 * album holds: it looks through the same 128-pixel detector as BlazeFace, and in
 * a real photograph where a portrait filled a quarter of the frame it found
 * nobody. Cut out around a box the tiled detector had already found, the same
 * face read correctly down to about 32 pixels wide in the stored 2000px image.
 *
 * What comes back is a number per face, not a verdict. Whether a number means a
 * blink is decided in `blinks.ts`, against the same person in the other frames
 * of the moment, because a laughing face with open eyes already reads 0.26.
 */
import type { FaceLandmarker } from '@mediapipe/tasks-vision'
import type { EyeFace } from '../blinks'
import type { FaceBox } from './faces'

/** What came of reading the eyes in one photograph. Failure is said, not hidden. */
export type EyeReading =
  | { kind: 'read'; faces: EyeFace[] }
  | { kind: 'unavailable'; detail: string }

/** Where the vision runtime and the model are served from. Same origin, on purpose. */
const ASSETS = '/mediapipe'

/**
 * How much to cut out around a face box, as a share of the box on every side.
 *
 * The detector's box is tight; the landmark model expects a little head and
 * forehead around the face, and finds nothing in a crop that is all face.
 */
const MARGIN = 0.5

/** The longest side of a close-up shown on screen. Enough for an eye to be seen. */
const CLOSE_UP_SIZE = 160

let pending: Promise<FaceLandmarker> | null = null

/** Builds the reader once, on first use. A 3.6 MB model, so only when there are faces to read. */
async function reader(): Promise<FaceLandmarker> {
  pending ??= (async () => {
    const { FaceLandmarker: Landmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')
    const fileset = await FilesetResolver.forVisionTasks(ASSETS)

    return Landmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: `${ASSETS}/face_landmarker.task` },
      runningMode: 'IMAGE',
      numFaces: 1,
      outputFaceBlendshapes: true,
    })
  })()

  try {
    return await pending
  } catch (error) {
    pending = null
    throw error
  }
}

/** Releases the reader, for a screen that is going away. */
export function forgetEyeReader(): void {
  const held = pending
  pending = null
  void held?.then((one) => one.close()).catch(() => {})
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message ? `${error.name}: ${error.message}` : error.name

  return String(error)
}

/** The square around a face, widened by MARGIN and kept inside the frame. */
export function cutOut(
  box: Pick<FaceBox, 'x' | 'y' | 'width' | 'height'>,
  frame: { width: number; height: number },
): { x: number; y: number; size: number } {
  const size = Math.min(
    Math.max(box.width, box.height) * (1 + 2 * MARGIN),
    frame.width,
    frame.height,
  )
  const centreX = box.x + box.width / 2
  const centreY = box.y + box.height / 2

  return {
    x: Math.round(Math.min(Math.max(centreX - size / 2, 0), frame.width - size)),
    y: Math.round(Math.min(Math.max(centreY - size / 2, 0), frame.height - size)),
    size: Math.round(size),
  }
}

async function closeUpOf(canvas: OffscreenCanvas): Promise<string | null> {
  try {
    const small = new OffscreenCanvas(
      Math.min(CLOSE_UP_SIZE, canvas.width),
      Math.min(CLOSE_UP_SIZE, canvas.height),
    )
    small.getContext('2d')?.drawImage(canvas, 0, 0, small.width, small.height)

    return URL.createObjectURL(await small.convertToBlob({ type: 'image/jpeg', quality: 0.85 }))
  } catch {
    return null
  }
}

/**
 * Reads the eyes of every face found in one stored photograph.
 *
 * The photograph is the 2000px stored image, never a thumbnail: a face 5% of a
 * frame's width is 100 pixels there and 20 in a thumbnail, and the model gives
 * out at about 32.
 */
export async function readEyes(photograph: Blob, boxes: FaceBox[]): Promise<EyeReading> {
  if (boxes.length === 0) return { kind: 'read', faces: [] }

  let found: FaceLandmarker
  try {
    found = await reader()
  } catch (error) {
    return { kind: 'unavailable', detail: describe(error) }
  }

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(photograph)
  } catch (error) {
    return { kind: 'unavailable', detail: describe(error) }
  }

  try {
    const faces: EyeFace[] = []

    for (const box of boxes) {
      const area = cutOut(box, bitmap)
      const canvas = new OffscreenCanvas(area.size, area.size)
      canvas.getContext('2d')?.drawImage(
        bitmap, area.x, area.y, area.size, area.size, 0, 0, area.size, area.size,
      )

      const result = found.detect(canvas as unknown as HTMLCanvasElement)
      const shapes = result.faceBlendshapes[0]?.categories ?? []
      const score = (name: string) => shapes.find((one) => one.categoryName === name)?.score
      const left = score('eyeBlinkLeft')
      const right = score('eyeBlinkRight')

      faces.push({
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        blink: left === undefined || right === undefined ? null : (left + right) / 2,
        closeUp: await closeUpOf(canvas),
      })
    }

    return { kind: 'read', faces }
  } catch (error) {
    return { kind: 'unavailable', detail: describe(error) }
  } finally {
    bitmap.close()
  }
}
