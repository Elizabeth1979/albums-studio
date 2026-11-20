/**
 * Who blinked, inside one group of near-identical photographs.
 *
 * Pure: it receives eye readings and decides nothing about pixels, so the rule
 * can be tested without a model.
 *
 * **The rule compares a person only with themselves.** A face is marked as
 * having its eyes closed when the same person reads clearly more open in
 * another frame of the same moment. That is a blink. A kiss or a laugh
 * photographed five times has closed eyes in all five, and none is marked; a
 * photograph with no sibling is never judged on eyes at all.
 *
 * A fixed line could not do this. Measured on a real photograph, a laughing face
 * with its eyes open already reads 0.26 on the model's 0-1 "eyes closed" scale,
 * because laughter narrows the eyes; the same face with its eyes shut read
 * 0.62-0.70. Somebody who squints by nature would sit higher still. Each person
 * is their own baseline.
 *
 * Shown, not acted on. Nothing here changes which frame is suggested: the
 * margin below is a starting point taken from one edited photograph, and only
 * the owner's own albums can set it.
 */

/**
 * How much more closed than the same person's most open frame counts as a blink.
 *
 * Provisional. From one real portrait: 0.26 with the eyes open (laughing), 0.62
 * and 0.70 with them edited shut. A quarter sits between those with room either
 * side. It is not a measurement of real blinks; see the module note.
 */
export const BLINK_MARGIN = 0.25

/**
 * How far apart, as a share of the frame's width, two faces in different frames
 * can be and still be taken for the same person.
 *
 * Frames of one moment are taken seconds apart from nearly the same place, so a
 * person moves a little. Two people side by side are usually further apart than
 * this; when they are not, the worst outcome is a comparison between two
 * people, which the owner sees in the close-ups.
 */
export const SAME_PERSON_DISTANCE = 0.12

/**
 * The smile score, 0-1, at or above which a face reads as smiling.
 *
 * Provisional. A laughing portrait read 0.95, and still 0.86 tilted 20 degrees;
 * no real neutral face has been measured here. A fixed line suits a smile better
 * than it suits a blink, because the score follows the mouth directly rather
 * than an eye half-hidden by the cheeks — but the album still decides.
 */
export const SMILE_LINE = 0.5

/**
 * How far a head can be turned, in degrees left-right or up-down, and still be
 * facing the camera.
 *
 * Judged by the head and not by the eyes. Measured on a real portrait, the
 * model's eye-direction scores rose from 0.18 to 0.67 when the eyes were merely
 * closed, because it reads shut eyes as looking down; counting that would make
 * every blink a "looking away" as well. The head angle read 2 degrees facing
 * the camera and reported a 20-degree tilt as 21, so it is the steadier signal.
 * The limit itself is provisional.
 */
export const TURN_LIMIT = 25

/** One face as read in one frame, in the frame's own pixels. */
export type EyeFace = {
  x: number
  y: number
  width: number
  height: number
  /**
   * The model's eyes-closed score, 0 (wide open) to 1 (shut), as the mean of the
   * two eyes. Null when the face was found but its eyes could not be read.
   */
  blink: number | null
  /** A small picture of this face, for showing frame against frame. */
  closeUp: string | null
  /** The model's smile score, 0-1, as the mean of both corners of the mouth. */
  smile: number | null
  /** How far the head is turned from facing the camera, in degrees. */
  turn: { sideways: number; upDown: number } | null
}

/** True when the face reads as smiling, null when it could not be read. */
export function isSmiling(face: EyeFace): boolean | null {
  return face.smile === null ? null : face.smile >= SMILE_LINE
}

/** True when the head is turned toward the camera, null when it could not be read. */
export function facesCamera(face: EyeFace): boolean | null {
  if (face.turn === null) return null

  return Math.abs(face.turn.sideways) <= TURN_LIMIT && Math.abs(face.turn.upDown) <= TURN_LIMIT
}

/** One photograph of a group, with the faces read in it. */
export type FrameFaces = {
  photoId: string
  /** The frame's size, so positions in different frames can be compared. */
  width: number
  height: number
  faces: EyeFace[]
}

/** One person as they appear across a group's frames. */
export type Appearance = {
  photoId: string
  face: EyeFace
  /** True for a blink, false for open, null when there is nothing to compare with. */
  closed: boolean | null
}

export type Person = { appearances: Appearance[] }

function centre(face: EyeFace, frame: FrameFaces): [number, number] {
  return [(face.x + face.width / 2) / frame.width, (face.y + face.height / 2) / frame.width]
}

function distance(one: [number, number], two: [number, number]): number {
  return Math.hypot(one[0] - two[0], one[1] - two[1])
}

/**
 * Follows each person through the frames of one group.
 *
 * Seeded from the frame with the most faces, so the person most likely to be
 * missed somewhere still has a place to be matched to. Each later face joins the
 * nearest person not already seen in that frame, if one is close enough;
 * otherwise it starts a person of its own.
 */
export function followPeople(frames: FrameFaces[]): Person[] {
  const usable = frames.filter((frame) => frame.width > 0 && frame.faces.length > 0)
  if (usable.length === 0) return []

  const anchor = usable.reduce((most, frame) =>
    frame.faces.length > most.faces.length ? frame : most,
  )

  const people: { at: [number, number]; appearances: Omit<Appearance, 'closed'>[] }[] =
    anchor.faces.map((face) => ({
      at: centre(face, anchor),
      appearances: [{ photoId: anchor.photoId, face }],
    }))

  for (const frame of usable) {
    if (frame === anchor) continue

    const pairs = frame.faces
      .flatMap((face, faceIndex) =>
        people.map((person, personIndex) => ({
          faceIndex,
          personIndex,
          gap: distance(centre(face, frame), person.at),
        })),
      )
      .filter((pair) => pair.gap <= SAME_PERSON_DISTANCE)
      .sort((one, two) => one.gap - two.gap)

    const placedFaces = new Set<number>()
    const takenPeople = new Set<number>()

    for (const pair of pairs) {
      if (placedFaces.has(pair.faceIndex) || takenPeople.has(pair.personIndex)) continue
      placedFaces.add(pair.faceIndex)
      takenPeople.add(pair.personIndex)
      people[pair.personIndex].appearances.push({
        photoId: frame.photoId,
        face: frame.faces[pair.faceIndex],
      })
    }

    frame.faces.forEach((face, faceIndex) => {
      if (placedFaces.has(faceIndex)) return
      people.push({ at: centre(face, frame), appearances: [{ photoId: frame.photoId, face }] })
    })
  }

  // Album order, so the close-ups read left to right as the photographs do.
  const order = new Map(frames.map((frame, index) => [frame.photoId, index]))

  return people.map((person) => {
    const read = person.appearances.flatMap((one) => (one.face.blink === null ? [] : [one.face.blink]))
    const mostOpen = read.length >= 2 ? Math.min(...read) : null

    return {
      appearances: [...person.appearances]
        .sort((one, two) => (order.get(one.photoId) ?? 0) - (order.get(two.photoId) ?? 0))
        .map((one) => ({
          ...one,
          closed:
            mostOpen === null || one.face.blink === null
              ? null
              : one.face.blink - mostOpen >= BLINK_MARGIN,
        })),
    }
  })
}

/** The photographs in which somebody blinked. */
export function framesWithBlinks(people: Person[]): Set<string> {
  return new Set(
    people.flatMap((person) =>
      person.appearances.filter((one) => one.closed === true).map((one) => one.photoId),
    ),
  )
}
