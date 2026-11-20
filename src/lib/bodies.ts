/**
 * Who came out blurred, inside one group of near-identical photographs.
 *
 * Pure: it receives the people found in each frame and decides nothing about
 * pixels, so the rules can be tested without a model.
 *
 * **A person is compared only with themselves.** Somebody is marked blurred in
 * a frame when the same person reads clearly sharper in another frame of the
 * same moment — they moved, or the camera did. The number on its own says
 * nothing: a child in a white T-shirt and a child in black read differently
 * when both are perfectly sharp. A photograph with no sibling is never judged
 * here; `focus.ts` looks after a blurred photograph taken only once.
 *
 * Shown, not acted on. The margin and the matching limits below come from one
 * burst of four night photographs, and only the owner's albums can set them.
 */

/** One person found in one frame, in the frame's own pixels. */
export type Body = {
  x: number
  y: number
  width: number
  height: number
  /** How sure the detector was, 0 to 1. */
  confidence: number
  /** The re-blur ratio inside the person, 0 to 1, higher is blurrier. Null if unreadable. */
  blur: number | null
  /** The average colour of the person's middle, for telling people apart between frames. */
  colour: [number, number, number]
  /** A small picture of this person, for showing frame against frame. */
  closeUp: string | null
}

/** A box, for the geometry below. */
type Box = Pick<Body, 'x' | 'y' | 'width' | 'height'>

/**
 * How much blurrier than the same person's sharpest frame counts as blurred.
 *
 * Provisional, from one burst. Read across the middle of each child's box, a
 * boy smeared by movement read 0.087 above his sharpest frame and a girl blurred
 * mid-step 0.089 and 0.108 above hers, while children who came out read within
 * 0.035 of their best. 0.065 sits between. The same girl, blurred worse in a
 * third frame in front of a lit tree, read only 0.049 above: see
 * `MEASURED_MIDDLE` in `imaging/bodies.ts` for why, and why nothing acts on this.
 */
export const BLUR_MARGIN = 0.065

/**
 * How far apart, as a share of the frame's width, one person's middle can be in
 * two frames. Wider than for faces: a child steps or jumps between frames, and
 * the girl in the owner's burst moved 0.15 of the frame.
 */
export const BODY_DISTANCE = 0.2

/**
 * How different, in average colour (0-255 per channel, straight-line), one
 * person's clothes can read between frames.
 *
 * Provisional. Light and blur shift the average a little; a child in black and
 * one in white, or a child and a pale garden decoration, are far apart.
 */
export const COLOUR_DISTANCE = 60

/** How much of the smaller of two boxes may be covered by the other before one is a duplicate. */
const DUPLICATE_OVERLAP = 0.5

function area(box: Box): number {
  return Math.max(0, box.width) * Math.max(0, box.height)
}

function overlap(one: Box, two: Box): number {
  const width = Math.min(one.x + one.width, two.x + two.width) - Math.max(one.x, two.x)
  const height = Math.min(one.y + one.height, two.y + two.height) - Math.max(one.y, two.y)

  return width > 0 && height > 0 ? width * height : 0
}

/**
 * Keeps one box per person.
 *
 * The detector sometimes reports a person smeared by movement as two boxes, one
 * inside the other. The more confident box is kept and any box mostly covered
 * by a kept one is dropped.
 */
export function dropOverlaps<T extends Box & { confidence: number }>(boxes: T[]): T[] {
  const kept: T[] = []

  for (const box of [...boxes].sort((one, two) => two.confidence - one.confidence)) {
    const duplicate = kept.some(
      (other) => overlap(box, other) > DUPLICATE_OVERLAP * Math.min(area(box), area(other)),
    )
    if (!duplicate) kept.push(box)
  }

  return kept
}

/** One photograph of a group, with the people found in it. */
export type FrameBodies = {
  photoId: string
  /** The frame's size, so positions in different frames can be compared. */
  width: number
  height: number
  bodies: Body[]
}

export type BodyAppearance = {
  photoId: string
  body: Body
  /** True when blurred against this person's sharpest frame, null when there is nothing to compare. */
  blurred: boolean | null
}

export type BodyTrack = { appearances: BodyAppearance[] }

function centre(box: Box, frame: { width: number }): [number, number] {
  return [(box.x + box.width / 2) / frame.width, (box.y + box.height / 2) / frame.width]
}

function gap(one: readonly number[], two: readonly number[]): number {
  return Math.hypot(...one.map((value, index) => value - two[index]))
}

/**
 * Follows each person through the frames of one group, in album order.
 *
 * Each frame's people join the closest track that is near enough in both place
 * and clothes colour, best pairs first, one person to a track per frame;
 * anyone left over starts a track of their own. A track remembers where its
 * person was last seen, so a child drifting across a burst is followed step by
 * step rather than compared with where they began.
 */
export function followBodies(frames: FrameBodies[]): BodyTrack[] {
  const tracks: { at: [number, number]; colour: [number, number, number]; seen: Omit<BodyAppearance, 'blurred'>[] }[] = []

  for (const frame of frames) {
    if (frame.width <= 0) continue

    const pairs = frame.bodies
      .flatMap((body, bodyIndex) =>
        tracks.map((track, trackIndex) => {
          const place = gap(centre(body, frame), track.at)
          const clothes = gap(body.colour, track.colour)

          return {
            bodyIndex,
            trackIndex,
            near: place <= BODY_DISTANCE && clothes <= COLOUR_DISTANCE,
            cost: place / BODY_DISTANCE + clothes / COLOUR_DISTANCE,
          }
        }),
      )
      .filter((pair) => pair.near)
      .sort((one, two) => one.cost - two.cost)

    const placed = new Set<number>()
    const taken = new Set<number>()

    for (const pair of pairs) {
      if (placed.has(pair.bodyIndex) || taken.has(pair.trackIndex)) continue
      placed.add(pair.bodyIndex)
      taken.add(pair.trackIndex)

      const body = frame.bodies[pair.bodyIndex]
      const track = tracks[pair.trackIndex]
      track.at = centre(body, frame)
      track.colour = body.colour
      track.seen.push({ photoId: frame.photoId, body })
    }

    frame.bodies.forEach((body, bodyIndex) => {
      if (placed.has(bodyIndex)) return
      tracks.push({ at: centre(body, frame), colour: body.colour, seen: [{ photoId: frame.photoId, body }] })
    })
  }

  return tracks.map((track) => {
    const read = track.seen.flatMap((one) => (one.body.blur === null ? [] : [one.body.blur]))
    const sharpest = read.length >= 2 ? Math.min(...read) : null

    return {
      appearances: track.seen.map((one) => ({
        ...one,
        blurred:
          sharpest === null || one.body.blur === null
            ? null
            : one.body.blur - sharpest >= BLUR_MARGIN,
      })),
    }
  })
}

/** The photographs in which somebody came out blurred. */
export function framesWithBlur(tracks: BodyTrack[]): Set<string> {
  return new Set(
    tracks.flatMap((track) =>
      track.appearances.filter((one) => one.blurred === true).map((one) => one.photoId),
    ),
  )
}

/** True when the middle of `inner` lies inside `outer`: a face belonging to a body. */
export function contains(outer: Box, inner: Box): boolean {
  const x = inner.x + inner.width / 2
  const y = inner.y + inner.height / 2

  return x >= outer.x && x <= outer.x + outer.width && y >= outer.y && y <= outer.y + outer.height
}
