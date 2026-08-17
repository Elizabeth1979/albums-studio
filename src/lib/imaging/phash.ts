import { downsampleLuma } from './luma'

/** The image is reduced to this square before the transform. */
export const SAMPLE_SIZE = 32

/** The low-frequency corner kept from the transform: 8 x 8 gives 64 bits. */
export const HASH_SIZE = 8

const cosineTables = new Map<number, Float64Array>()

/**
 * cos(pi * (2n + 1) * k / 2N) for every (k, n), which is the only expensive
 * part of a DCT of this size and depends on nothing but the size.
 */
function cosineTable(size: number): Float64Array {
  const cached = cosineTables.get(size)
  if (cached) return cached

  const table = new Float64Array(size * size)

  for (let k = 0; k < size; k += 1) {
    for (let n = 0; n < size; n += 1) {
      table[k * size + n] = Math.cos((Math.PI * (2 * n + 1) * k) / (2 * size))
    }
  }

  cosineTables.set(size, table)

  return table
}

/** One-dimensional DCT-II, orthonormal. */
function dct1d(input: Float64Array, output: Float64Array, size: number, table: Float64Array) {
  const first = Math.sqrt(1 / size)
  const rest = Math.sqrt(2 / size)

  for (let k = 0; k < size; k += 1) {
    let total = 0

    for (let n = 0; n < size; n += 1) {
      total += input[n] * table[k * size + n]
    }

    output[k] = total * (k === 0 ? first : rest)
  }
}

/**
 * Two-dimensional DCT-II by separable passes: rows first, then columns.
 */
export function dct2d(values: Float64Array, size: number): Float64Array {
  const table = cosineTable(size)
  const rows = new Float64Array(size * size)
  const line = new Float64Array(size)
  const transformed = new Float64Array(size)

  for (let row = 0; row < size; row += 1) {
    line.set(values.subarray(row * size, row * size + size))
    dct1d(line, transformed, size, table)
    rows.set(transformed, row * size)
  }

  const out = new Float64Array(size * size)

  for (let column = 0; column < size; column += 1) {
    for (let row = 0; row < size; row += 1) {
      line[row] = rows[row * size + column]
    }

    dct1d(line, transformed, size, table)

    for (let row = 0; row < size; row += 1) {
      out[row * size + column] = transformed[row]
    }
  }

  return out
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = sorted.length / 2

  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[Math.floor(middle)]
}

/**
 * A 64-bit perceptual hash, as a string of '0' and '1' for Postgres `bit(64)`.
 *
 * The image is reduced to 32x32 brightness, transformed, and only the 8x8
 * low-frequency corner is kept: that corner describes broad structure, which is
 * what survives resizing and re-encoding while still differing between photos.
 *
 * Each coefficient becomes one bit by comparing it against the median. The DC
 * term is excluded from that median because it carries overall brightness and
 * would otherwise drag the threshold around; comparing against a median is also
 * what makes the hash indifferent to a uniform brightness shift.
 */
export function perceptualHash(luma: Float64Array, width: number, height: number): string {
  const sample = downsampleLuma(luma, width, height, SAMPLE_SIZE)
  const frequencies = dct2d(sample, SAMPLE_SIZE)
  const corner: number[] = []

  for (let row = 0; row < HASH_SIZE; row += 1) {
    for (let column = 0; column < HASH_SIZE; column += 1) {
      corner.push(frequencies[row * SAMPLE_SIZE + column])
    }
  }

  const threshold = median(corner.slice(1))

  return corner.map((value) => (value > threshold ? '1' : '0')).join('')
}

/** How many bits differ. Near-duplicates score low, unrelated photos high. */
export function hammingDistance(left: string, right: string): number {
  if (left.length !== right.length) {
    throw new Error('Hashes must be the same length to compare.')
  }

  let distance = 0

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) distance += 1
  }

  return distance
}
