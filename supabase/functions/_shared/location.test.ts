import { describe, expect, it } from 'vitest'
import { removeLocation } from './location'

/**
 * A TIFF block with an IFD0 that points at a GPS block holding a latitude
 * reference ("N", inline) and a latitude (three rationals, stored out of line).
 */
function tiffWithGps(little: boolean): Uint8Array {
  const buffer = new ArrayBuffer(120)
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  bytes.set(little ? [0x49, 0x49] : [0x4d, 0x4d], 0)
  view.setUint16(2, 42, little)
  view.setUint32(4, 8, little) // IFD0 at 8

  view.setUint16(8, 1, little) // one entry
  view.setUint16(10, 0x8825, little) // GPS pointer
  view.setUint16(12, 4, little)
  view.setUint32(14, 1, little)
  view.setUint32(18, 26, little) // GPS block at 26
  view.setUint32(22, 0, little) // no next IFD

  view.setUint16(26, 2, little) // two entries
  view.setUint16(28, 1, little) // GPSLatitudeRef
  view.setUint16(30, 2, little) // ASCII
  view.setUint32(32, 2, little)
  bytes.set([0x4e, 0x00], 36) // "N"
  view.setUint16(40, 2, little) // GPSLatitude
  view.setUint16(42, 5, little) // RATIONAL
  view.setUint32(44, 3, little)
  view.setUint32(48, 60, little) // values at 60
  view.setUint32(52, 0, little)
  for (let i = 0; i < 6; i += 1) view.setUint32(60 + i * 4, [51, 1, 30, 1, 1234, 100][i], little)

  bytes.set([0xaa, 0xbb, 0xcc], 110) // something after, which must survive

  return bytes
}

function jpegWith(tiff: Uint8Array, extra: Uint8Array = new Uint8Array()): Uint8Array {
  const exif = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff])
  const length = exif.length + 2
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xe1, length >> 8, length & 0xff, ...exif, ...extra, 0xff, 0xd9,
  ])
}

const TIFF_AT = 4 + 2 + 6 // SOI, APP1 marker, length, "Exif\0\0"

function gpsCount(file: Uint8Array, little: boolean): number {
  return new DataView(file.buffer).getUint16(TIFF_AT + 26, little)
}

function hasLatitude(file: Uint8Array, little: boolean): boolean {
  return new DataView(file.buffer).getUint32(TIFF_AT + 60, little) === 51
}

describe('removeLocation', () => {
  for (const little of [true, false]) {
    it(`empties the GPS block of a ${little ? 'little' : 'big'}-endian JPEG`, () => {
      const file = jpegWith(tiffWithGps(little))
      expect(hasLatitude(file, little)).toBe(true)

      const removed = removeLocation(file)

      expect(removed.gpsBlocks).toBe(1)
      expect(gpsCount(removed.bytes, little)).toBe(0)
      expect(hasLatitude(removed.bytes, little)).toBe(false)
    })
  }

  it('changes nothing but the location: same length, same bytes elsewhere', () => {
    const file = jpegWith(tiffWithGps(true))
    const { bytes } = removeLocation(file)

    expect(bytes.length).toBe(file.length)
    const changed = [...bytes].flatMap((value, index) => (value === file[index] ? [] : [index]))
    // Only the GPS block (entries, from offset 26) and its rationals (from 60).
    for (const index of changed) {
      const inTiff = index - TIFF_AT
      expect(inTiff >= 26 && inTiff < 84).toBe(true)
    }
    expect([...bytes.slice(TIFF_AT + 110, TIFF_AT + 113)]).toEqual([0xaa, 0xbb, 0xcc])
  })

  it('leaves the original untouched and returns a copy', () => {
    const file = jpegWith(tiffWithGps(true))
    removeLocation(file)

    expect(hasLatitude(file, true)).toBe(true)
  })

  it('finds the block anywhere in the file, as HEIC keeps it', () => {
    const tiff = tiffWithGps(true)
    const heicLike = new Uint8Array([
      ...new Uint8Array(300).fill(7), 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff, 1, 2, 3,
    ])

    const removed = removeLocation(heicLike)

    expect(removed.gpsBlocks).toBe(1)
    expect(new DataView(removed.bytes.buffer).getUint16(306 + 26, true)).toBe(0)
  })

  it('blanks XMP coordinates written as attributes and as elements, keeping the length', () => {
    const xmp = new TextEncoder().encode(
      '<x:xmpmeta><rdf:Description exif:GPSLatitude="51,30.2N" exif:GPSLongitude="0,7.6W" ' +
        'dc:title="Beach"/><exif:GPSAltitude>12/1</exif:GPSAltitude></x:xmpmeta>',
    )
    const file = new Uint8Array([0xff, 0xd8, ...xmp, 0xff, 0xd9])

    const removed = removeLocation(file)
    const text = new TextDecoder().decode(removed.bytes)

    expect(removed.xmpValues).toBe(3)
    expect(removed.bytes.length).toBe(file.length)
    expect(text).not.toMatch(/51,30|0,7\.6|12\/1/)
    expect(text).toContain('dc:title="Beach"')
  })

  it('leaves a file with no location exactly as it was', () => {
    const file = new Uint8Array([0xff, 0xd8, 1, 2, 3, 0x45, 0x78, 0x69, 0x66, 0xff, 0xd9])

    const removed = removeLocation(file)

    expect(removed).toMatchObject({ gpsBlocks: 0, xmpValues: 0 })
    expect([...removed.bytes]).toEqual([...file])
  })

  it('leaves a GPS pointer that runs off the end of the file alone rather than half-blanking', () => {
    const tiff = tiffWithGps(true)
    new DataView(tiff.buffer).setUint32(18, 5000, true) // GPS block "at" 5000
    const file = jpegWith(tiff)

    const removed = removeLocation(file)

    expect(removed.gpsBlocks).toBe(0)
    expect([...removed.bytes]).toEqual([...file])
  })
})
