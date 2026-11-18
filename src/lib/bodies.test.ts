import { describe, expect, it } from 'vitest'
import {
  BLUR_MARGIN,
  type Body,
  type FrameBodies,
  contains,
  dropOverlaps,
  followBodies,
  framesWithBlur,
} from './bodies'

const BLACK: [number, number, number] = [74, 65, 58]
const WHITE: [number, number, number] = [182, 150, 141]
const BLUE: [number, number, number] = [106, 110, 116]

/** A person whose middle is at `centre` across a 1500px frame. */
function body(centre: number, blur: number | null, colour = BLUE, confidence = 0.85): Body {
  return { x: centre - 100, y: 600, width: 200, height: 500, confidence, blur, colour, closeUp: null }
}

function frame(photoId: string, bodies: Body[]): FrameBodies {
  return { photoId, width: 1500, height: 2000, bodies }
}

describe('dropOverlaps', () => {
  it('keeps the more confident of two boxes around one person', () => {
    // A boy smeared by movement came back as two boxes, one inside the other.
    const whole = { x: 950, y: 800, width: 280, height: 650, confidence: 0.47 }
    const part = { x: 1000, y: 850, width: 160, height: 560, confidence: 0.31 }

    expect(dropOverlaps([part, whole])).toEqual([whole])
  })

  it('keeps people standing side by side', () => {
    const one = { x: 780, y: 850, width: 230, height: 600, confidence: 0.86 }
    const two = { x: 1000, y: 740, width: 240, height: 790, confidence: 0.83 }

    expect(dropOverlaps([one, two])).toHaveLength(2)
  })
})

describe('followBodies', () => {
  it('marks a person blurred only against their own sharpest frame', () => {
    // The owner's night burst, read across the middle of each child: the boy
    // in black smeared in the first frame, both boys fine elsewhere. The boy in
    // white reads differently from the boy in black when both are sharp, which
    // is why nobody is compared with anybody else.
    const tracks = followBodies([
      frame('jumping', [body(500, 0.336, WHITE), body(1100, 0.399, BLACK)]),
      frame('kicking', [body(520, 0.337, WHITE), body(1150, 0.333, BLACK)]),
      frame('blurred', [body(540, 0.345, WHITE), body(1130, 0.312, BLACK)]),
    ])

    const blurred = tracks.map((track) => track.appearances.map((one) => one.blurred))
    expect(blurred).toEqual([
      [false, false, false],
      [true, false, false],
    ])
    expect(framesWithBlur(tracks)).toEqual(new Set(['jumping']))
  })

  it('does not call a person blurred just inside the margin', () => {
    const tracks = followBodies([
      frame('one', [body(500, 0.3)]),
      frame('two', [body(500, 0.3 + BLUR_MARGIN - 0.001)]),
    ])

    expect(tracks[0].appearances.map((one) => one.blurred)).toEqual([false, false])
  })

  it('follows a child who moved by their clothes, not into a decoration where she stood', () => {
    // The girl moved from 0.23 of the frame to 0.42 between frames, and a pale
    // ghost decoration at 0.26 was taken for a person in the second frame.
    // Nearest-place matching would hand her first frame to the ghost.
    const ghost: [number, number, number] = [200, 200, 205]
    const tracks = followBodies([
      frame('first', [body(345, 0.34, BLUE)]),
      frame('second', [body(630, 0.37, BLUE), body(390, 0.33, ghost, 0.61)]),
    ])

    const girl = tracks.find((track) => track.appearances[0].photoId === 'first')!
    expect(girl.appearances.map((one) => one.photoId)).toEqual(['first', 'second'])
    expect(girl.appearances[1].body.colour).toEqual(BLUE)
  })

  it('says nothing about a person seen once, or with no reading to compare', () => {
    const tracks = followBodies([
      frame('one', [body(500, 0.3), body(1200, null, BLACK)]),
      frame('two', [body(510, null), body(1210, 0.4, BLACK)]),
    ])

    expect(tracks.flatMap((track) => track.appearances.map((one) => one.blurred))).toEqual([
      null,
      null,
      null,
      null,
    ])
  })
})

describe('contains', () => {
  it('joins a face to the body it sits inside, by the middle of the face', () => {
    const person = { x: 780, y: 850, width: 230, height: 600 }

    expect(contains(person, { x: 850, y: 870, width: 90, height: 90 })).toBe(true)
    expect(contains(person, { x: 1100, y: 870, width: 90, height: 90 })).toBe(false)
  })
})
