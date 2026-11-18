/**
 * Finding each person in a photograph, whole, and how sharp they came out.
 *
 * Faces are not enough for this. At night, or across a garden, a child's face
 * fills about 6% of the frame — the face detector's floor — and blur from
 * movement pushes it under: in the owner's burst of four pumpkin photographs it
 * found faces in one. A body is many times larger and keeps its shape when
 * smeared, so this finds people whole (EfficientDet-Lite0, person class) and
 * measures blur inside each one.
 *
 * The blur reading is the same re-blur ratio the album uses for whole
 * photographs (`reblur.ts`), taken inside the person's box at the same analysis
 * scale. Its number means nothing on its own; `bodies.ts` in `lib/` compares a
 * person only with themselves in the other frames of the moment.
 *
 * Why not the whole frame: in that burst every whole-frame measure ranked the
 * frame where a boy is smeared by movement above two where everyone came out,
 * because the lawn behind him happened to be crisper. See
 * `docs/sessions/2026-11-18-sharpest-read-the-lawn.md`.
 */
import type { ObjectDetector } from '@mediapipe/tasks-vision'
import { type Body, dropOverlaps } from '../bodies'
import { closeUpOf } from './eyes'
import { toLuma } from './luma'
import { ANALYSIS_CEILING } from './measure'
import { fitWithin } from './process'
import { blurRatio } from './reblur'

/** What came of looking for people in one photograph. Failure is said, not hidden. */
export type BodyReading =
  | { kind: 'read'; bodies: Body[] }
  | { kind: 'unavailable'; detail: string }

/** Where the vision runtime and the model are served from. Same origin, on purpose. */
const ASSETS = '/mediapipe'

/**
 * The detector's confidence below which a box is not taken for a person.
 *
 * Measured on the owner's night burst, not taken from the library: a dog lying
 * on the lawn read 0.30 and 0.39, other garden shapes 0.10 to 0.15, and a child
 * smeared by movement 0.47 to 0.68. A Halloween ghost by the tree read 0.61 and
 * passes, which is why a person must be seen in more than one frame before
 * anything is said about them.
 */
export const MIN_PERSON_CONFIDENCE = 0.4

/**
 * The share of a person's box, across the middle, that blur is read from.
 *
 * A box is a rectangle around a shape that is not one, so its sides are mostly
 * whatever stood behind the person. Read whole, a girl blurred mid-step in front
 * of a tree hung with lights read barely softer than her sharpest frame, because
 * the lights were sharp. The middle half caught her in two frames of three and
 * the smeared boy beside her, and marked nobody who had come out. It still
 * misses her in the third, where the trunk is directly behind her: only a mask
 * of the person's own pixels would see that, and that is a further model.
 */
const MEASURED_MIDDLE = 0.5

/** How many people one photograph is searched for. A family photograph, not a crowd. */
const MAX_PEOPLE = 10

let pending: Promise<ObjectDetector> | null = null

/** Builds the detector once, on first use. A 4.6 MB model, so only for photographs in a group. */
async function detector(): Promise<ObjectDetector> {
  pending ??= (async () => {
    const { ObjectDetector: Detector, FilesetResolver } = await import('@mediapipe/tasks-vision')
    const fileset = await FilesetResolver.forVisionTasks(ASSETS)

    return Detector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: `${ASSETS}/efficientdet_lite0.tflite` },
      runningMode: 'IMAGE',
      categoryAllowlist: ['person'],
      scoreThreshold: MIN_PERSON_CONFIDENCE,
      maxResults: MAX_PEOPLE,
    })
  })()

  try {
    return await pending
  } catch (error) {
    pending = null
    throw error
  }
}

/** Releases the detector, for a screen that is going away. */
export function forgetBodyDetector(): void {
  const held = pending
  pending = null
  void held?.then((one) => one.close()).catch(() => {})
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message ? `${error.name}: ${error.message}` : error.name

  return String(error)
}

/**
 * The average colour of a person's middle, where their clothes are.
 *
 * Used to tell people apart between frames. Position alone cannot: a child who
 * moves a step lands where a sibling, or a person-shaped decoration, stood in
 * another frame. Clothes do not change within a moment.
 */
/** The middle columns of a picture, `share` of its width, as their own picture. */
export function middleColumns(
  luma: Float64Array,
  width: number,
  height: number,
  share: number,
): { luma: Float64Array; width: number } {
  const from = Math.floor((width * (1 - share)) / 2)
  const kept = Math.max(1, width - 2 * from)
  const out = new Float64Array(kept * height)

  for (let y = 0; y < height; y += 1) {
    out.set(luma.subarray(y * width + from, y * width + from + kept), y * kept)
  }

  return { luma: out, width: kept }
}

function clothesColour(pixels: Uint8ClampedArray, width: number, height: number): [number, number, number] {
  const total = [0, 0, 0]
  let count = 0

  for (let y = Math.floor(height * 0.25); y < Math.ceil(height * 0.75); y += 1) {
    for (let x = Math.floor(width * 0.25); x < Math.ceil(width * 0.75); x += 1) {
      const index = (y * width + x) * 4
      total[0] += pixels[index]
      total[1] += pixels[index + 1]
      total[2] += pixels[index + 2]
      count += 1
    }
  }

  return count === 0 ? [0, 0, 0] : [total[0] / count, total[1] / count, total[2] / count]
}

/**
 * Finds the people in one stored photograph and measures each one.
 *
 * The photograph is the stored image. Each person is cut out and reduced by the
 * same factor `measureFocus` reduces the whole frame by, so the re-blur reading
 * inside a box is taken at the scale it was calibrated at.
 */
export async function findPeopleIn(photograph: Blob): Promise<BodyReading> {
  let found: ObjectDetector
  try {
    found = await detector()
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
    const scale = fitWithin(bitmap.width, bitmap.height, ANALYSIS_CEILING).width / bitmap.width
    const boxes = dropOverlaps(
      found.detect(bitmap).detections.flatMap((detection) => {
        const box = detection.boundingBox
        if (!box) return []

        return [{
          x: box.originX,
          y: box.originY,
          width: box.width,
          height: box.height,
          confidence: detection.categories[0]?.score ?? 0,
        }]
      }),
    )

    const bodies: Body[] = []

    for (const box of boxes) {
      const width = Math.max(8, Math.round(box.width * scale))
      const height = Math.max(8, Math.round(box.height * scale))
      const canvas = new OffscreenCanvas(width, height)
      const context = canvas.getContext('2d')
      if (!context) continue

      context.drawImage(bitmap, box.x, box.y, box.width, box.height, 0, 0, width, height)
      const pixels = context.getImageData(0, 0, width, height).data
      const middle = middleColumns(toLuma(pixels), width, height, MEASURED_MIDDLE)

      bodies.push({
        ...box,
        blur: blurRatio(middle.luma, middle.width, height),
        colour: clothesColour(pixels, width, height),
        closeUp: await closeUpOf(canvas),
      })
    }

    return { kind: 'read', bodies }
  } catch (error) {
    return { kind: 'unavailable', detail: describe(error) }
  } finally {
    bitmap.close()
  }
}
