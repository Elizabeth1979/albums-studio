import { describe, expect, it } from 'vitest'
import { SOFT_SHARPNESS, findSoftPhotos, isSoft } from './focus'
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

describe('isSoft', () => {
  it('calls a photograph under the floor soft', () => {
    expect(isSoft(photo({ id: 'a', sharpness: SOFT_SHARPNESS - 1 }))).toBe(true)
  })

  it('leaves a photograph at the floor alone', () => {
    expect(isSoft(photo({ id: 'a', sharpness: SOFT_SHARPNESS }))).toBe(false)
  })

  it('says nothing about a photograph that was never measured', () => {
    // Uploaded before the column existed. Silence is the honest answer; a
    // missing measurement is not evidence of blur.
    expect(isSoft(photo({ id: 'a', sharpness: null }))).toBe(false)
  })
})

describe('findSoftPhotos', () => {
  it('finds a lone blurred photograph, which no group would have caught', () => {
    // The case this exists for: one soft frame with no sibling to be compared
    // against, which near-duplicate review is structurally unable to mention.
    const photos = [
      photo({ id: 'sharp', sortOrder: 0 }),
      photo({ id: 'blurry', sortOrder: 1, sharpness: 4 }),
    ]

    expect(findSoftPhotos(photos, groupSimilar(photos)).map((entry) => entry.photo.id)).toEqual([
      'blurry',
    ])
  })

  it('returns them in album order', () => {
    const photos = [
      photo({ id: 'later', sortOrder: 5, sharpness: 10 }),
      photo({ id: 'earlier', sortOrder: 2, sharpness: 10 }),
    ]

    expect(findSoftPhotos(photos).map((entry) => entry.photo.id)).toEqual(['earlier', 'later'])
  })

  it('separates a frame with no edges at all from a merely soft one', () => {
    const photos = [
      photo({ id: 'blurred', sortOrder: 0, sharpness: SOFT_SHARPNESS / 2 - 1 }),
      photo({ id: 'soft', sortOrder: 1, sharpness: SOFT_SHARPNESS - 1 }),
    ]

    expect(findSoftPhotos(photos).map((entry) => entry.reading)).toEqual(['blurred', 'soft'])
  })

  it('leaves out photographs a near-duplicate group already speaks for', () => {
    // Being asked about the same photograph twice, in two different words,
    // reads as two separate problems with the album.
    const hash = '1'.repeat(4).padEnd(64, '0')
    const photos = [
      photo({ id: 'one', sortOrder: 0, phash: hash, sharpness: 900 }),
      photo({ id: 'two', sortOrder: 1, phash: hash, sharpness: 3 }),
      photo({ id: 'alone', sortOrder: 2, sharpness: 3 }),
    ]

    expect(findSoftPhotos(photos, groupSimilar(photos)).map((entry) => entry.photo.id)).toEqual([
      'alone',
    ])
  })
})
