import { describe, expect, it } from 'vitest'
import { readTakenAt } from './exif'

/**
 * Builds a JPEG carrying one EXIF date, in either byte order.
 *
 * Assembled rather than fixtured: a parser tested only against bytes it also
 * generated proves the two agree, so the layout here follows the specification
 * — SOI, APP1, "Exif\0\0", a TIFF header, IFD0 pointing at an Exif IFD — and
 * the tests below then feed it damage it never produced.
 */
function jpegWithDate(
  date: string,
  {
    littleEndian = true,
    tag = 0x9003,
    inIfd0 = false,
    type = 2,
  }: { littleEndian?: boolean; tag?: number; inIfd0?: boolean; type?: number } = {},
): ArrayBuffer {
  const ascii = new TextEncoder().encode(`${date}\0`)
  const parts: number[] = []

  // TIFF header, then IFD0 at offset 8.
  const tiff: number[] = []
  const put16 = (into: number[], value: number) => {
    if (littleEndian) into.push(value & 0xff, (value >> 8) & 0xff)
    else into.push((value >> 8) & 0xff, value & 0xff)
  }
  const put32 = (into: number[], value: number) => {
    if (littleEndian) {
      into.push(value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff)
    } else {
      into.push((value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff)
    }
  }

  put16(tiff, littleEndian ? 0x4949 : 0x4d4d)
  put16(tiff, 0x002a)
  put32(tiff, 8)

  if (inIfd0) {
    // One entry, whose value sits after the directory.
    put16(tiff, 1)
    put16(tiff, tag)
    put16(tiff, type)
    put32(tiff, ascii.length)
    put32(tiff, 8 + 2 + 12 + 4)
    put32(tiff, 0)
    tiff.push(...ascii)
  } else {
    // IFD0 holds only the pointer to the Exif IFD.
    const ifd0Size = 2 + 12 + 4
    const exifAt = 8 + ifd0Size
    put16(tiff, 1)
    put16(tiff, 0x8769)
    put16(tiff, 4)
    put32(tiff, 1)
    put32(tiff, exifAt)
    put32(tiff, 0)

    put16(tiff, 1)
    put16(tiff, tag)
    put16(tiff, type)
    put32(tiff, ascii.length)
    put32(tiff, exifAt + 2 + 12 + 4)
    put32(tiff, 0)
    tiff.push(...ascii)
  }

  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]
  parts.push(0xff, 0xd8)
  parts.push(0xff, 0xe1)
  parts.push(((app1.length + 2) >> 8) & 0xff, (app1.length + 2) & 0xff)
  parts.push(...app1)
  // A minimal start-of-scan so the file looks like more than a header.
  parts.push(0xff, 0xda, 0x00, 0x02)

  return new Uint8Array(parts).buffer
}

describe('readTakenAt', () => {
  it('reads DateTimeOriginal from a little-endian file', () => {
    expect(readTakenAt(jpegWithDate('2026:08:19 13:45:02'))).toBe('2026-08-19T13:45:02')
  })

  it('reads the same date written big-endian', () => {
    // Canon and Nikon differ from each other here, so both orders are ordinary.
    expect(readTakenAt(jpegWithDate('2026:08:19 13:45:02', { littleEndian: false }))).toBe(
      '2026-08-19T13:45:02',
    )
  })

  it('falls back to DateTimeDigitized when the original is absent', () => {
    expect(readTakenAt(jpegWithDate('2020:01:02 03:04:05', { tag: 0x9004 }))).toBe(
      '2020-01-02T03:04:05',
    )
  })

  it('falls back to IFD0 DateTime when the Exif directory has neither', () => {
    expect(readTakenAt(jpegWithDate('2019:12:31 23:59:59', { tag: 0x0132, inIfd0: true }))).toBe(
      '2019-12-31T23:59:59',
    )
  })

  it('keeps the wall-clock time exactly as written', () => {
    // No zone is applied. EXIF carries none, and picking one here would move
    // the photograph in time by however far the viewer happens to be.
    const at = readTakenAt(jpegWithDate('2026:08:19 00:00:01'))

    expect(at).toBe('2026-08-19T00:00:01')
    expect(at).not.toContain('Z')
  })

  it('answers null for a file with no EXIF at all', () => {
    const plain = new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02]).buffer

    expect(readTakenAt(plain)).toBeNull()
  })

  it('answers null for something that is not a JPEG', () => {
    expect(readTakenAt(new TextEncoder().encode('this is a text file').buffer)).toBeNull()
  })

  it('answers null for an empty file', () => {
    expect(readTakenAt(new ArrayBuffer(0))).toBeNull()
  })

  it('rejects the zeroes a camera with a flat battery writes', () => {
    expect(readTakenAt(jpegWithDate('0000:00:00 00:00:00'))).toBeNull()
  })

  it('rejects a date that could not exist', () => {
    expect(readTakenAt(jpegWithDate('2026:13:19 13:45:02'))).toBeNull()
    expect(readTakenAt(jpegWithDate('2026:08:19 25:45:02'))).toBeNull()
  })

  it('rejects a date field that is not text', () => {
    expect(readTakenAt(jpegWithDate('2026:08:19 13:45:02', { type: 4 }))).toBeNull()
  })

  it('rejects a date of the wrong shape', () => {
    expect(readTakenAt(jpegWithDate('19/08/2026 13:45:02'))).toBeNull()
    expect(readTakenAt(jpegWithDate('2026:08:19'))).toBeNull()
  })

  it('survives a file truncated anywhere in its EXIF', () => {
    // Every prefix of a real file, rather than one chosen cut. A parser that
    // walks offsets out of a header can read past the end at any of them, and
    // an upload must never fail because of it.
    const whole = new Uint8Array(jpegWithDate('2026:08:19 13:45:02'))

    for (let length = 0; length < whole.length; length += 1) {
      expect(() => readTakenAt(whole.slice(0, length).buffer)).not.toThrow()
    }
  })

  it('survives every single-byte corruption of a real file', () => {
    // The offsets in EXIF point around the file, so a flipped byte can send the
    // walk anywhere. None of that may throw.
    const whole = new Uint8Array(jpegWithDate('2026:08:19 13:45:02'))

    for (let index = 0; index < whole.length; index += 1) {
      const damaged = whole.slice()
      damaged[index] = damaged[index] ^ 0xff
      expect(() => readTakenAt(damaged.buffer)).not.toThrow()
    }
  })
})
