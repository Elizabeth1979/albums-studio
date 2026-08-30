import { describe, expect, it } from 'vitest'
import { SOFT_FOCUS, findSoftPhotos, summariseFocus, unreadable } from './focus'
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

  it('does not offer a sharp photograph for carrying less texture than its album', () => {
    // The reason the album comparison was withdrawn. The reading counts fine
    // detail, and a sharp close-up of two faces carries far less of it than a
    // mediocre photograph of rippling water — so in an album of beach scenes
    // the portrait is the outlier. Comparing against the album told the owner
    // her sharp photograph of herself was out of focus, which is the one
    // mistake this feature must not make.
    const album = [
      photo({ id: 'water-a', sortOrder: 0 }),
      photo({ id: 'water-b', sortOrder: 1 }),
      photo({ id: 'water-c', sortOrder: 2 }),
      photo({ id: 'water-d', sortOrder: 3 }),
      photo({ id: 'sharp-portrait', sortOrder: 4 }),
    ]
    const readings = new Map([
      ['water-a', measured(9.1)],
      ['water-b', measured(6.4)],
      ['water-c', measured(7.7)],
      ['water-d', measured(5.2)],
      ['sharp-portrait', measured(2.4)],
    ])

    expect(findSoftPhotos(album, readings)).toEqual([])
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

  it('reports every reading and the line photographs are judged against', () => {
    const album = [0, 1, 2, 3].map((index) => photo({ id: `photo-${index}`, sortOrder: index }))
    const readings = new Map(
      [4, 6, 8, 2].map((value, index) => [`photo-${index}`, measured(value)]),
    )

    const summary = summariseFocus(album, readings)

    expect(summary.readings).toEqual([2, 4, 6, 8])
    expect(summary.line).toBe(SOFT_FOCUS)
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
