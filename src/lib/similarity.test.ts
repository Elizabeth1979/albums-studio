import { describe, expect, it } from 'vitest'
import type { Photo } from './photos'
import {
  NEAR_DUPLICATE_DISTANCE,
  groupSimilar,
  hammingDistance,
  sharpest,
} from './similarity'

/** A 64-bit hash with `differing` bits flipped from all zeroes. */
function hash(differing = 0): string {
  return '1'.repeat(differing).padEnd(64, '0')
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
    phash: hash(0),
    sharpness: 100,
    ...overrides,
  }
}

describe('hammingDistance', () => {
  it('is zero for the same hash', () => {
    expect(hammingDistance(hash(0), hash(0))).toBe(0)
  })

  it('counts the bits that differ', () => {
    expect(hammingDistance(hash(0), hash(6))).toBe(6)
  })

  it('is symmetric', () => {
    expect(hammingDistance(hash(3), hash(9))).toBe(hammingDistance(hash(9), hash(3)))
  })

  it('treats anything that is not a 64-bit hash as maximally distant', () => {
    // Rather than throwing or, worse, reading as identical and grouping two
    // unrelated photographs together for deletion.
    expect(hammingDistance('nonsense', hash(0))).toBe(64)
    expect(hammingDistance('101', hash(0))).toBe(64)
    expect(hammingDistance('2'.repeat(64), hash(0))).toBe(64)
  })
})

describe('groupSimilar', () => {
  it('finds nothing in an album of unrelated photographs', () => {
    // A real album measured 24 apart at its closest pair, which is what "these
    // are simply different pictures" looks like.
    const photos = [
      photo({ id: 'a', phash: hash(0), sortOrder: 0 }),
      photo({ id: 'b', phash: hash(24), sortOrder: 1 }),
      photo({ id: 'c', phash: hash(40), sortOrder: 2 }),
    ]

    expect(groupSimilar(photos)).toEqual([])
  })

  it('groups two frames of the same moment', () => {
    const photos = [
      photo({ id: 'a', phash: hash(0), sortOrder: 0 }),
      photo({ id: 'b', phash: hash(4), sortOrder: 1 }),
      photo({ id: 'far', phash: hash(50), sortOrder: 2 }),
    ]

    const groups = groupSimilar(photos)

    expect(groups).toHaveLength(1)
    expect(groups[0].photos.map((one) => one.id)).toEqual(['a', 'b'])
  })

  it('never offers a photograph on its own as something to choose between', () => {
    const groups = groupSimilar([photo({ id: 'alone' })])

    expect(groups).toEqual([])
  })

  it('keeps a drifting burst together rather than as overlapping pairs', () => {
    // Each frame is within the threshold of the last, and the ends are not.
    // One run to choose from is the useful shape; three pairs sharing photos is
    // a puzzle rather than a decision.
    const photos = [
      photo({ id: 'a', phash: hash(0), sortOrder: 0 }),
      photo({ id: 'b', phash: hash(8), sortOrder: 1 }),
      photo({ id: 'c', phash: hash(16), sortOrder: 2 }),
    ]

    const groups = groupSimilar(photos)

    expect(groups).toHaveLength(1)
    expect(groups[0].photos.map((one) => one.id)).toEqual(['a', 'b', 'c'])
    expect(groups[0].spread).toBe(16)
  })

  it('separates two bursts taken at different times', () => {
    const photos = [
      photo({ id: 'a1', phash: hash(0), sortOrder: 0 }),
      photo({ id: 'a2', phash: hash(4), sortOrder: 1 }),
      photo({ id: 'b1', phash: '0'.repeat(32) + '1'.repeat(32), sortOrder: 2 }),
      photo({ id: 'b2', phash: '0'.repeat(34) + '1'.repeat(30), sortOrder: 3 }),
    ]

    const groups = groupSimilar(photos)

    expect(groups).toHaveLength(2)
    expect(groups[0].photos.map((one) => one.id)).toEqual(['a1', 'a2'])
    expect(groups[1].photos.map((one) => one.id)).toEqual(['b1', 'b2'])
  })

  it('orders the groups the way the album is ordered', () => {
    const photos = [
      photo({ id: 'late1', phash: hash(60), sortOrder: 8 }),
      photo({ id: 'early1', phash: hash(0), sortOrder: 0 }),
      photo({ id: 'early2', phash: hash(2), sortOrder: 1 }),
      photo({ id: 'late2', phash: hash(58), sortOrder: 9 }),
    ]

    const groups = groupSimilar(photos)

    expect(groups.map((group) => group.photos[0].id)).toEqual(['early1', 'late1'])
  })

  it('leaves out photographs that carry no hash', () => {
    // Anything uploaded before the column existed. Grouping those on a missing
    // value would put unrelated pictures side by side under a delete button.
    const photos = [
      photo({ id: 'old1', phash: null, sortOrder: 0 }),
      photo({ id: 'old2', phash: null, sortOrder: 1 }),
    ]

    expect(groupSimilar(photos)).toEqual([])
  })

  it('respects a threshold it was given', () => {
    const photos = [
      photo({ id: 'a', phash: hash(0), sortOrder: 0 }),
      photo({ id: 'b', phash: hash(14), sortOrder: 1 }),
    ]

    expect(groupSimilar(photos)).toEqual([])
    expect(groupSimilar(photos, 16)).toHaveLength(1)
  })

  it('suggests the sharpest of the group', () => {
    const photos = [
      photo({ id: 'soft', phash: hash(0), sharpness: 900, sortOrder: 0 }),
      photo({ id: 'crisp', phash: hash(2), sharpness: 4200, sortOrder: 1 }),
      photo({ id: 'softer', phash: hash(4), sharpness: 300, sortOrder: 2 }),
    ]

    expect(groupSimilar(photos)[0].suggested.id).toBe('crisp')
  })

  it('uses a threshold of 10 by default', () => {
    expect(NEAR_DUPLICATE_DISTANCE).toBe(10)
  })
})

describe('sharpest', () => {
  it('keeps album order when nothing is sharper', () => {
    const first = photo({ id: 'first', sharpness: 100, sortOrder: 0 })
    const second = photo({ id: 'second', sharpness: 100, sortOrder: 1 })

    expect(sharpest([first, second]).id).toBe('first')
  })

  it('prefers a measured photograph over one with no reading', () => {
    const unmeasured = photo({ id: 'unmeasured', sharpness: null, sortOrder: 0 })
    const measured = photo({ id: 'measured', sharpness: 5, sortOrder: 1 })

    expect(sharpest([unmeasured, measured]).id).toBe('measured')
  })
})
