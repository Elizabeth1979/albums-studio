import { describe, expect, it } from 'vitest'
import { BLINK_MARGIN, type EyeFace, type FrameFaces, followPeople, framesWithBlinks } from './blinks'

function face(x: number, blink: number | null, y = 300): EyeFace {
  return { x, y, width: 100, height: 100, blink, closeUp: null }
}

function frame(photoId: string, faces: EyeFace[]): FrameFaces {
  return { photoId, width: 2000, height: 1500, faces }
}

describe('followPeople', () => {
  it('marks the frame where one person blinked, and only that one', () => {
    const people = followPeople([
      frame('a', [face(400, 0.26), face(1200, 0.3)]),
      frame('b', [face(410, 0.68), face(1210, 0.28)]),
      frame('c', [face(405, 0.27), face(1190, 0.31)]),
    ])

    expect(people).toHaveLength(2)
    expect(people[0].appearances.map((one) => one.closed)).toEqual([false, true, false])
    expect(people[1].appearances.map((one) => one.closed)).toEqual([false, false, false])
    expect(framesWithBlinks(people)).toEqual(new Set(['b']))
  })

  it('does not mark a moment where the eyes were closed in every frame', () => {
    // A kiss, or a laugh, photographed three times.
    const people = followPeople([
      frame('a', [face(400, 0.7)]),
      frame('b', [face(405, 0.72)]),
      frame('c', [face(398, 0.69)]),
    ])

    expect(framesWithBlinks(people)).toEqual(new Set())
  })

  it('does not judge a person seen in only one frame', () => {
    const people = followPeople([frame('a', [face(400, 0.8)]), frame('b', [])])

    expect(people[0].appearances[0].closed).toBeNull()
    expect(framesWithBlinks(people)).toEqual(new Set())
  })

  it('treats a squint below the margin as open', () => {
    const people = followPeople([
      frame('a', [face(400, 0.26)]),
      frame('b', [face(400, 0.26 + BLINK_MARGIN - 0.01)]),
    ])

    expect(people[0].appearances.map((one) => one.closed)).toEqual([false, false])
  })

  it('keeps two people apart when they stand far enough from each other', () => {
    const people = followPeople([
      frame('a', [face(400, 0.3), face(900, 0.3)]),
      frame('b', [face(900, 0.7), face(400, 0.3)]),
    ])

    const right = people.find((person) => person.appearances[0].face.x === 900)
    expect(right?.appearances.map((one) => one.closed)).toEqual([false, true])
  })

  it('starts a new person for a face with nobody near it', () => {
    const people = followPeople([frame('a', [face(400, 0.3)]), frame('b', [face(1600, 0.3)])])

    expect(people).toHaveLength(2)
  })

  it('leaves a face whose eyes could not be read out of the comparison', () => {
    const people = followPeople([
      frame('a', [face(400, null)]),
      frame('b', [face(400, 0.3)]),
      frame('c', [face(400, 0.7)]),
    ])

    expect(people[0].appearances.map((one) => one.closed)).toEqual([null, false, true])
  })

  it('reads the faces in album order', () => {
    const people = followPeople([
      frame('a', [face(400, 0.3)]),
      frame('b', [face(400, 0.3), face(1200, 0.3)]),
    ])

    expect(people[0].appearances.map((one) => one.photoId)).toEqual(['a', 'b'])
  })
})
