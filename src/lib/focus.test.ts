import { describe, expect, it } from 'vitest'
import type { FaceReading } from './imaging/faces'
import { BLURRED_ENOUGH, findSoftPhotos, summariseFaces, summariseFocus, unreadable } from './focus'
import type { FocusReading } from './imaging/measure'
import type { Photo } from './photos'
import { groupSimilar } from './similarity'

/**
 * Readings named for what they mean rather than for a number.
 *
 * The line has moved three times as the measure improved, and each time these
 * tests failed for a reason that had nothing to do with what they check. A
 * reading is interesting here only as "comfortably sharp" or "past the line".
 */
const SHARP = BLURRED_ENOUGH - 0.06
const BLURRED = BLURRED_ENOUGH + 0.2

/** A photograph the app looked at and measured the edges of. */
function measured(blur: number, texture: number | null = 4): FocusReading {
  return { kind: 'measured', blur, edgeWidth: 2, texture }
}

function photo(overrides: Partial<Photo> & { id: string }): Photo {
  return {
    storagePath: `owner/a/${overrides.id}.jpg`,
    thumbnailPath: `owner/a/${overrides.id}-thumb.jpg`,
    width: 2000,
    height: 1500,
    caption: null,
    captionVisibility: 'hidden',
    alt: null,
    sortOrder: 0,
    phash: null,
    sharpness: 800,
    takenAt: null,
    ...overrides,
  }
}

describe('findSoftPhotos', () => {
  it('finds a lone blurred photograph, which no group would have caught', () => {
    // The case this exists for: one soft frame with no sibling to be compared
    // against, which near-duplicate review is structurally unable to mention.
    const photos = [photo({ id: 'sharp', sortOrder: 0 }), photo({ id: 'blurry', sortOrder: 1 })]
    const readings = new Map([
      ['sharp', measured(SHARP)],
      ['blurry', measured(BLURRED)],
    ])

    expect(
      findSoftPhotos(photos, readings, groupSimilar(photos)).map((entry) => entry.photo.id),
    ).toEqual(['blurry'])
  })

  it('does not offer a sharp photograph for carrying less texture than its album', () => {
    // Built from the false positive this feature actually produced: a sharp
    // close-up of two faces in an album of seascapes, offered for deletion
    // because it carried less fine detail than rippling water. Edge width is
    // what stops that — the portrait's edges are as crisp as the water's, which
    // is the question that was always being asked.
    const album = [
      photo({ id: 'water-a', sortOrder: 0 }),
      photo({ id: 'water-b', sortOrder: 1 }),
      photo({ id: 'water-c', sortOrder: 2 }),
      photo({ id: 'water-d', sortOrder: 3 }),
      photo({ id: 'sharp-portrait', sortOrder: 4 }),
    ]
    // Edge widths, and the portrait's are barely wider than the seascapes'
    // even though it carries a fraction of their detail. The measure this
    // replaced read the same photographs five-fold apart.
    const readings = new Map([
      ['water-a', measured(SHARP - 0.01, 9.1)],
      ['water-b', measured(SHARP, 6.4)],
      ['water-c', measured(SHARP - 0.01, 7.7)],
      ['water-d', measured(SHARP + 0.01, 5.2)],
      ['sharp-portrait', measured(SHARP + 0.01, 2.4)],
    ])

    expect(findSoftPhotos(album, readings)).toEqual([])
  })

  it('leaves an album alone when every photograph is sharp', () => {
    // One of them is inevitably the softest. Being last is not being blurred,
    // and nothing here is judged by comparison with its neighbours.
    const album = [0, 1, 2, 3, 4].map((index) =>
      photo({ id: `photo-${index}`, sortOrder: index }),
    )
    const readings = new Map(
      [0, 0.02, -0.01, 0.03, 0.01].map((offset, index) => [
        `photo-${index}`,
        measured(SHARP + offset),
      ]),
    )

    expect(findSoftPhotos(album, readings)).toEqual([])
  })

  it('falls back to the absolute floor when an album is too small to compare within', () => {
    // Three photographs make no median worth the name, and one of them may
    // still be blurred beyond argument.
    const album = [
      photo({ id: 'one', sortOrder: 0 }),
      photo({ id: 'ruined', sortOrder: 1 }),
    ]
    const readings = new Map([
      ['one', measured(SHARP)],
      ['ruined', measured(BLURRED)],
    ])

    expect(findSoftPhotos(album, readings).map((entry) => entry.photo.id)).toEqual(['ruined'])
  })

  it('reports every reading and the line photographs are judged against', () => {
    const album = [0, 1, 2, 3].map((index) => photo({ id: `photo-${index}`, sortOrder: index }))
    const readings = new Map(
      [1.9, 2.4, 3.6, 1.7].map((value, index) => [`photo-${index}`, measured(value)]),
    )

    const summary = summariseFocus(album, readings)

    // Narrowest edges first, and the softest is the widest.
    expect(summary.readings).toEqual([1.7, 1.9, 2.4, 3.6])
    expect(summary.softest).toBe(3.6)
    expect(summary.line).toBe(BLURRED_ENOUGH)
  })

  it('leaves a photograph exactly at the line alone', () => {
    const photos = [photo({ id: 'borderline' })]

    expect(findSoftPhotos(photos, new Map([['borderline', measured(BLURRED_ENOUGH)]]))).toEqual([])
  })

  it('offers nothing for a photograph whose bytes could not be read', () => {
    // The failure that hid for three rounds. A photograph nobody could measure
    // must not be quietly counted as fine — it is reported separately instead.
    const photos = [photo({ id: 'unreadable' })]
    const readings = new Map<string, FocusReading>([
      ['unreadable', { kind: 'failed', detail: 'network' }],
    ])

    expect(findSoftPhotos(photos, readings)).toEqual([])
    expect(unreadable(photos, readings).map((one) => one.id)).toEqual(['unreadable'])
  })

  it('counts a photograph with nothing to judge as checked, not as failed', () => {
    // Fog and a blank wall were read perfectly well; there was simply nothing
    // in them to judge. That is not the same as a failure and must not be
    // reported as one.
    const photos = [photo({ id: 'fog' })]
    const readings = new Map<string, FocusReading>([['fog', { kind: 'unjudgeable' }]])

    expect(findSoftPhotos(photos, readings)).toEqual([])
    expect(unreadable(photos, readings)).toEqual([])
  })

  it('says nothing about a photograph not measured yet', () => {
    // Readings arrive a moment after the album draws, so the map is incomplete
    // for a beat. An absent measurement is not evidence of blur.
    const photos = [photo({ id: 'not-yet-measured' })]

    expect(findSoftPhotos(photos, new Map())).toEqual([])
    expect(unreadable(photos, new Map())).toEqual([])
  })

  it('returns them in album order', () => {
    const photos = [
      photo({ id: 'later', sortOrder: 5 }),
      photo({ id: 'earlier', sortOrder: 2 }),
    ]
    const readings = new Map([
      ['later', measured(BLURRED)],
      ['earlier', measured(BLURRED)],
    ])

    expect(findSoftPhotos(photos, readings).map((entry) => entry.photo.id)).toEqual([
      'earlier',
      'later',
    ])
  })

  it('leaves out photographs a near-duplicate group already speaks for', () => {
    // Being asked about the same photograph twice, in two different words,
    // reads as two separate problems with the album.
    const hash = '1'.repeat(4).padEnd(64, '0')
    const photos = [
      photo({ id: 'one', sortOrder: 0, phash: hash }),
      photo({ id: 'two', sortOrder: 1, phash: hash }),
      photo({ id: 'alone', sortOrder: 2 }),
    ]
    const readings = new Map([
      ['one', measured(SHARP)],
      ['two', measured(BLURRED)],
      ['alone', measured(BLURRED)],
    ])

    expect(
      findSoftPhotos(photos, readings, groupSimilar(photos)).map((entry) => entry.photo.id),
    ).toEqual(['alone'])
  })
})

describe('summariseFaces', () => {
  const withFaces = (confidence: number): FaceReading => ({
    kind: 'faces',
    boxes: [{ x: 10, y: 10, width: 40, height: 40, confidence, share: 0.05 }],
  })

  it('tells apart a photograph with nobody in it from one that could not be looked at', () => {
    // The distinction the whole round rests on. An album where the detector
    // never loaded and an album of landscapes are different facts, and this
    // feature has already been debugged blind three times by letting outcomes
    // like those look identical on screen.
    const photos = [photo({ id: 'a' }), photo({ id: 'b' }), photo({ id: 'c' })]
    const summary = summariseFaces(
      photos,
      new Map<string, FaceReading>([
        ['a', withFaces(0.91)],
        ['b', { kind: 'none' }],
        ['c', { kind: 'unavailable', detail: 'the model could not be fetched' }],
      ]),
    )

    expect(summary).toMatchObject({
      total: 3,
      withFaces: 1,
      withoutFaces: 1,
      unavailable: 1,
      detail: 'the model could not be fetched',
    })
  })

  it('reports how sure the detector was, surest first', () => {
    // A count alone cannot say whether a detection is worth believing. The
    // owner's blurred photograph has her son small, hatted and some way off; if
    // he is found at all it will be near the line, and that has to be visible.
    const photos = [photo({ id: 'a' }), photo({ id: 'b' })]
    const summary = summariseFaces(
      photos,
      new Map<string, FaceReading>([['a', withFaces(0.81)], ['b', withFaces(0.96)]]),
    )

    expect(summary.confidences).toEqual([0.96, 0.81])
  })

  it('takes the surest face when a photograph holds several', () => {
    const summary = summariseFaces(
      [photo({ id: 'a' })],
      new Map<string, FaceReading>([
        ['a', {
          kind: 'faces',
          boxes: [
            { x: 0, y: 0, width: 10, height: 10, confidence: 0.83, share: 0.01 },
            { x: 20, y: 0, width: 10, height: 10, confidence: 0.94, share: 0.01 },
          ],
        }],
      ]),
    )

    expect(summary.confidences).toEqual([0.94])
  })

  it('says nothing about a photograph it has not looked at yet', () => {
    // An album mid-check must not read as an album with nobody in it.
    const summary = summariseFaces([photo({ id: 'a' }), photo({ id: 'b' })], new Map())

    expect(summary).toMatchObject({ total: 2, withFaces: 0, withoutFaces: 0, unavailable: 0 })
    expect(summary.detail).toBeNull()
  })
})

describe('summariseFaces, how much room is left', () => {
  const face = (share: number, confidence = 0.9): FaceReading => ({
    kind: 'faces',
    boxes: [{ x: 0, y: 0, width: 10, height: 10, confidence, share }],
  })

  it('reports the smallest face found anywhere in the album', () => {
    // The number that says whether this approach is comfortable or standing on
    // its floor: detection falls off a cliff between 8% and 5% of the frame and
    // finds nobody below about 2%. An album whose smallest face is 30% has room;
    // one whose smallest is 3% is about to stop working.
    const summary = summariseFaces(
      [photo({ id: 'a' }), photo({ id: 'b' }), photo({ id: 'c' })],
      new Map<string, FaceReading>([
        ['a', face(0.30)],
        ['b', face(0.031)],
        ['c', face(0.12)],
      ]),
    )

    expect(summary.smallestFace).toBeCloseTo(0.031)
  })

  it('takes the smallest face within a photograph, not just across them', () => {
    // A group photograph holds the near and the far, and it is the far one that
    // says where the limit is.
    const summary = summariseFaces(
      [photo({ id: 'a' })],
      new Map<string, FaceReading>([
        ['a', {
          kind: 'faces',
          boxes: [
            { x: 0, y: 0, width: 200, height: 200, confidence: 0.95, share: 0.25 },
            { x: 400, y: 0, width: 24, height: 24, confidence: 0.82, share: 0.03 },
          ],
        }],
      ]),
    )

    expect(summary.smallestFace).toBeCloseTo(0.03)
  })

  it('has no smallest face to report when nobody was found', () => {
    const summary = summariseFaces(
      [photo({ id: 'a' })],
      new Map<string, FaceReading>([['a', { kind: 'none' }]]),
    )

    expect(summary.smallestFace).toBeNull()
  })
})
