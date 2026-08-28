import { describe, expect, it } from 'vitest'
import { SOFT_FOCUS, findSoftPhotos } from './focus'
import type { Photo } from './photos'
import { groupSimilar } from './similarity'

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
      ['sharp', 1.4],
      ['blurry', 0.1],
    ])

    expect(
      findSoftPhotos(photos, readings, groupSimilar(photos)).map((entry) => entry.photo.id),
    ).toEqual(['blurry'])
  })

  it('leaves a photograph exactly at the line alone', () => {
    const photos = [photo({ id: 'borderline' })]

    expect(findSoftPhotos(photos, new Map([['borderline', SOFT_FOCUS]]))).toEqual([])
  })

  it('says nothing about a photograph with no reading', () => {
    // Two ways to have none: too little contrast anywhere to judge (fog, a
    // blank wall), or a thumbnail that would not decode. Silence is the honest
    // answer to both; a missing measurement is not evidence of blur.
    const photos = [photo({ id: 'unmeasurable' }), photo({ id: 'not-yet-measured' })]

    expect(findSoftPhotos(photos, new Map([['unmeasurable', null]]))).toEqual([])
  })

  it('returns them in album order', () => {
    const photos = [
      photo({ id: 'later', sortOrder: 5 }),
      photo({ id: 'earlier', sortOrder: 2 }),
    ]
    const readings = new Map([
      ['later', 0.05],
      ['earlier', 0.05],
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
      ['one', 1.2],
      ['two', 0.04],
      ['alone', 0.04],
    ])

    expect(
      findSoftPhotos(photos, readings, groupSimilar(photos)).map((entry) => entry.photo.id),
    ).toEqual(['alone'])
  })
})
