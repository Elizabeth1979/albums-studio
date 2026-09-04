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
  /**
   * How much of the frame's width this face spans, between 0 and 1.
   *
   * The number that says whether this feature is near its floor. Detection
   * falls off a cliff between 8% and 5% of the frame, and below about 2%
   * nothing here finds anyone at all — so a face found at 0.03 is a face this
   * approach very nearly missed, and knowing that is the difference between
   * "this works" and "this works today and will not tomorrow".
   */
  share: number
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

/**
 * The grids the photograph is also looked at through, besides whole.
 *
 * BlazeFace resizes whatever it is given to 128x128 before it looks at
 * anything, so a face's chance of being found depends on the fraction of the
 * *frame* it fills, not on how many pixels the photograph has. Measured in a
 * real browser, with a face shrinking towards the size of a boy some way down a
 * beach:
 *
 * | face width, as a share of the frame | whole | 3x3 | 4x4 |
 * | --- | --- | --- | --- |
 * | 12% | found | 0.856 | — |
 * | 8% | found | 0.860 | — |
 * | 5% | **missed** | 0.881 | — |
 * | 3.5% | **missed** | 0.882 | 0.822 |
 * | 2.5% | **missed** | missed | 0.867 |
 * | 1.8% | missed | missed | missed |
 *
 * There is a cliff between 8% and 5%, and cropping walks over it: a tile is a
 * third or a quarter of the frame, so a face inside one arrives at the model
 * three or four times larger. Both grids are needed and neither replaces the
 * other — a face too big for a 4x4 tile is cut across two and found in neither,
 * which is why the whole frame is still looked at first.
 *
 * The obvious worry is that sixteen extra looks means sixteen extra chances to
 * be wrong. It does not, measured: ten draws each of dense water texture and
 * random rectangles produced no face at any grid. And it is affordable — whole,
 * 3x3 and 4x4 together take 155 ms for one 800px frame, against 24 ms for the
 * whole frame alone.
 *
 * Below about 2% of the frame nothing here finds a face, and no finer grid is
 * going to rescue it. That is the floor of this approach.
 */
const TILE_GRIDS = [3, 4]

/**
 * How much neighbouring tiles share.
 *
 * Without it a face sitting on a seam is cut in half and found in neither tile.
 * A quarter is enough for a face that fits in a tile at all.
 */
const TILE_OVERLAP = 0.25

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
type Frame = ImageBitmap | OffscreenCanvas

/** One pass of the detector, with the boxes placed back in the frame's own pixels. */
function look(
  found: FaceDetector,
  source: CanvasImageSource,
  offset: { x: number; y: number; scale: number },
  frameWidth: number,
): FaceBox[] {
  const result = found.detect(source as unknown as HTMLCanvasElement)

  return result.detections.flatMap((one) => {
    const box = one.boundingBox
    if (!box) return []

    return [{
      x: offset.x + box.originX * offset.scale,
      y: offset.y + box.originY * offset.scale,
      width: box.width * offset.scale,
      height: box.height * offset.scale,
      confidence: one.categories[0]?.score ?? 0,
      share: (box.width * offset.scale) / frameWidth,
    }]
  })
}

/** How much two boxes overlap, as a share of the area they cover between them. */
function overlap(one: FaceBox, two: FaceBox): number {
  const wide = Math.min(one.x + one.width, two.x + two.width) - Math.max(one.x, two.x)
  const tall = Math.min(one.y + one.height, two.y + two.height) - Math.max(one.y, two.y)
  if (wide <= 0 || tall <= 0) return 0

  const shared = wide * tall

  return shared / (one.width * one.height + two.width * two.height - shared)
}

/**
 * One box per face.
 *
 * A face near a seam is inside two tiles, and a face large enough is found in
 * the whole frame as well, so the same person arrives three or four times.
 * Counting those as three or four people would make the number on screen a
 * measure of how the tiles fell rather than of who is in the photograph.
 * Surest first, and anything substantially overlapping one already kept is the
 * same face seen again.
 */
function deduplicate(boxes: FaceBox[]): FaceBox[] {
  const kept: FaceBox[] = []

  for (const box of [...boxes].sort((one, two) => two.confidence - one.confidence)) {
    if (!kept.some((held) => overlap(held, box) > 0.4)) kept.push(box)
  }

  return kept
}

export async function detectFaces(frame: Frame): Promise<FaceReading> {
  let found: FaceDetector

  try {
    found = await detector()
  } catch (error) {
    return { kind: 'unavailable', detail: describe(error) }
  }

  try {
    const width = frame.width
    const height = frame.height
    const boxes = look(found, frame, { x: 0, y: 0, scale: 1 }, width)

    // Then the same photograph again through each grid, which is what finds a
    // face too small for the whole frame. See TILE_GRIDS for the measurements.
    for (const grid of TILE_GRIDS) {
      const tileWidth = width / (grid - (grid - 1) * TILE_OVERLAP)
      const tileHeight = height / (grid - (grid - 1) * TILE_OVERLAP)
      const canvas = new OffscreenCanvas(Math.round(tileWidth), Math.round(tileHeight))
      const context = canvas.getContext('2d')
      if (!context) break

      for (let row = 0; row < grid; row += 1) {
        for (let column = 0; column < grid; column += 1) {
          const x = Math.min(column * tileWidth * (1 - TILE_OVERLAP), width - tileWidth)
          const y = Math.min(row * tileHeight * (1 - TILE_OVERLAP), height - tileHeight)

          context.drawImage(frame, x, y, tileWidth, tileHeight, 0, 0, canvas.width, canvas.height)
          // The crop is drawn at very nearly its own size, so one scale serves
          // both axes; rounding the canvas moves a box by well under a pixel.
          boxes.push(...look(found, canvas, { x, y, scale: tileWidth / canvas.width }, width))
        }
      }
    }

    const faces = deduplicate(boxes)

    return faces.length > 0 ? { kind: 'faces', boxes: faces } : { kind: 'none' }
  } catch (error) {
    return { kind: 'unavailable', detail: describe(error) }
  }
}

/**
 * Finds the faces in a stored photograph, from bytes the album already holds.
 *
 * The bitmap is handed over whole rather than reduced first, which sounds
 * wasteful and is not: BlazeFace resizes whatever it is given to 128x128 before
 * it looks at anything, so the pixels a photograph has never mattered — only
 * the share of the frame a face fills. That is why `detectFaces` also looks
 * through tiles, and why `share` is reported for every face found.
 *
 * The floor is real and no amount of tiling moves it: below about 2% of the
 * frame's width, nobody is found. If her album comes back empty, that is the
 * number to look at before reaching for a finer grid.
 *
 * Nothing acts on any of this yet.
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
