import { describe, expect, it } from 'vitest'
import { SOFT_FOCUS, SOFT_SHARE_OF_ALBUM, findSoftPhotos, summariseFocus, unreadable } from './focus'
import type { FocusReading } from './imaging/measure'
import type { Photo } from './photos'
import { groupSimilar } from './similarity'

/** A photograph the app looked at and got a number from. */
function measured(focus: number): FocusReading {
  return { kind: 'measured', focus }
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
      ['sharp', measured(1.4)],
      ['blurry', measured(0.1)],
    ])

    expect(
      findSoftPhotos(photos, readings, groupSimilar(photos)).map((entry) => entry.photo.id),
    ).toEqual(['blurry'])
  })

  it('judges a photograph against its own album, not against a fixed number', () => {
    // The reading is a ratio of detail to contrast, and how much fine detail a
    // scene carries has nothing to do with focus. A real album of beach
    // photographs read between 2 and 15 where synthetic scenes read about 1, so
    // the plainly blurred frame at 2.23 cleared every absolute line and four
    // rounds of this feature said nothing.
    const album = [
      photo({ id: 'a', sortOrder: 0 }),
      photo({ id: 'b', sortOrder: 1 }),
      photo({ id: 'c', sortOrder: 2 }),
      photo({ id: 'd', sortOrder: 3 }),
      photo({ id: 'blurred', sortOrder: 4 }),
    ]
    const readings = new Map([
      ['a', measured(9.1)],
      ['b', measured(6.4)],
      ['c', measured(7.7)],
      ['d', measured(5.2)],
      ['blurred', measured(2.23)],
    ])

    expect(findSoftPhotos(album, readings).map((entry) => entry.photo.id)).toEqual(['blurred'])
  })

  it('leaves an album alone when nothing in it stands out', () => {
    // Every photograph in focus, one of them inevitably the softest. Being last
    // is not the same as being blurred.
    const album = [0, 1, 2, 3, 4].map((index) =>
      photo({ id: `photo-${index}`, sortOrder: index }),
    )
    const readings = new Map(
      [7.4, 6.9, 8.1, 6.2, 7.0].map((value, index) => [`photo-${index}`, measured(value)]),
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
      ['one', measured(6.0)],
      ['ruined', measured(0.05)],
    ])

    expect(findSoftPhotos(album, readings).map((entry) => entry.photo.id)).toEqual(['ruined'])
  })

  it('reports the readings and the line the album settled on', () => {
    const album = [0, 1, 2, 3].map((index) => photo({ id: `photo-${index}`, sortOrder: index }))
    const readings = new Map(
      [4, 6, 8, 2].map((value, index) => [`photo-${index}`, measured(value)]),
    )

    const summary = summariseFocus(album, readings)

    expect(summary.readings).toEqual([2, 4, 6, 8])
    expect(summary.line).toBeCloseTo(5 * SOFT_SHARE_OF_ALBUM, 5)
    expect(summary.line).toBeGreaterThan(SOFT_FOCUS)
  })

  it('leaves a photograph exactly at the floor alone', () => {
    const photos = [photo({ id: 'borderline' })]

    expect(findSoftPhotos(photos, new Map([['borderline', measured(SOFT_FOCUS)]]))).toEqual([])
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
      ['later', measured(0.05)],
      ['earlier', measured(0.05)],
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
      ['one', measured(1.2)],
      ['two', measured(0.04)],
      ['alone', measured(0.04)],
    ])

    expect(
      findSoftPhotos(photos, readings, groupSimilar(photos)).map((entry) => entry.photo.id),
    ).toEqual(['alone'])
  })
})
