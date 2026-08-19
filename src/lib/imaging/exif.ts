/**
 * When a photograph was taken, read from the file the camera wrote.
 *
 * Only the capture time, and only from JPEG. Everything here walks the bytes
 * directly rather than pulling in a library: one tag out of one segment is a
 * small enough job, and a parser that cannot throw is easier to guarantee than
 * one that merely has not yet.
 *
 * Nothing in here trusts the file. Every read is bounds-checked and anything
 * unexpected ends the walk and answers null, because the alternative is one
 * malformed photograph taking a whole upload down with it.
 */

/** JPEG start-of-image. Anything else is not a file this can read. */
const SOI = 0xffd8

/** APP1, the segment EXIF lives in. */
const APP1 = 0xffe1

const TIFF_LITTLE_ENDIAN = 0x4949
const TIFF_BIG_ENDIAN = 0x4d4d
const TIFF_MAGIC = 0x002a

const TAG_DATE_TIME = 0x0132
const TAG_EXIF_IFD = 0x8769
const TAG_DATE_TIME_ORIGINAL = 0x9003
const TAG_DATE_TIME_DIGITIZED = 0x9004

/** "YYYY:MM:DD HH:MM:SS" — nineteen characters, then a null. */
const EXIF_DATE_LENGTH = 19

/**
 * A capture time as the camera recorded it: wall-clock, with no time zone.
 *
 * EXIF's DateTimeOriginal carries no offset, and inventing one — the viewer's,
 * the server's — would move the photograph in time. Kept as written, and stored
 * in a column that says the same thing.
 */
export type TakenAt = string

function readUint16(view: DataView, offset: number, littleEndian: boolean): number | null {
  if (offset + 2 > view.byteLength) return null
  return view.getUint16(offset, littleEndian)
}

function readUint32(view: DataView, offset: number, littleEndian: boolean): number | null {
  if (offset + 4 > view.byteLength) return null
  return view.getUint32(offset, littleEndian)
}

/** Finds the APP1 segment holding EXIF, if the file has one. */
function findExifSegment(view: DataView): number | null {
  if (readUint16(view, 0, false) !== SOI) return null

  let offset = 2

  while (offset + 4 <= view.byteLength) {
    const marker = readUint16(view, offset, false)
    if (marker === null || (marker & 0xff00) !== 0xff00) return null

    const length = readUint16(view, offset + 2, false)
    if (length === null || length < 2) return null

    if (marker === APP1) {
      const header = offset + 4
      // "Exif\0\0" — an APP1 can hold other things, XMP most often.
      if (
        header + 6 <= view.byteLength &&
        view.getUint32(header, false) === 0x45786966 &&
        readUint16(view, header + 4, false) === 0
      ) {
        return header + 6
      }
    }

    offset += 2 + length
  }

  return null
}

/** Reads an ASCII value of known length, wherever the entry points. */
function readAscii(view: DataView, offset: number, length: number): string | null {
  if (offset + length > view.byteLength) return null

  let text = ''
  for (let index = 0; index < length; index += 1) {
    const code = view.getUint8(offset + index)
    if (code === 0) break
    text += String.fromCharCode(code)
  }

  return text
}

type Entry = { tag: number; type: number; count: number; valueOffset: number }

/** Walks one image file directory, handing back its entries. */
function readDirectory(
  view: DataView,
  tiff: number,
  directory: number,
  littleEndian: boolean,
): Entry[] {
  const count = readUint16(view, tiff + directory, littleEndian)
  if (count === null) return []

  const entries: Entry[] = []

  for (let index = 0; index < count; index += 1) {
    const at = tiff + directory + 2 + index * 12
    const tag = readUint16(view, at, littleEndian)
    const type = readUint16(view, at + 2, littleEndian)
    const size = readUint32(view, at + 4, littleEndian)
    if (tag === null || type === null || size === null) break

    // A value of four bytes or fewer sits in the entry; anything longer is an
    // offset from the start of the TIFF header.
    const inline = size * (type === 2 ? 1 : 4) <= 4
    const valueOffset = inline
      ? at + 8
      : tiff + (readUint32(view, at + 8, littleEndian) ?? 0)

    entries.push({ tag, type, count: size, valueOffset })
  }

  return entries
}

function dateFrom(entries: Entry[], view: DataView, tag: number): string | null {
  const entry = entries.find((candidate) => candidate.tag === tag)
  // Type 2 is ASCII. Anything else claiming to be a date is not one.
  if (!entry || entry.type !== 2) return null

  const text = readAscii(view, entry.valueOffset, EXIF_DATE_LENGTH)
  if (!text || text.length < EXIF_DATE_LENGTH) return null

  // "2026:08:19 13:45:02" is the only shape the specification allows.
  const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(text)
  if (!match) return null

  const [, year, month, day, hour, minute, second] = match

  // A camera with a flat battery writes zeroes. That is not a date.
  if (year === '0000' || month === '00' || day === '00') return null
  if (Number(month) > 12 || Number(day) > 31) return null
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 60) return null

  return `${year}-${month}-${day}T${hour}:${minute}:${second}`
}

/**
 * The capture time in a file's EXIF, or null when it has none.
 *
 * Prefers DateTimeOriginal — when the shutter opened. DateTimeDigitized and
 * DateTime are later moments (scanning, editing), taken only as fallbacks.
 */
export function readTakenAt(bytes: ArrayBuffer): TakenAt | null {
  try {
    const view = new DataView(bytes)

    const tiff = findExifSegment(view)
    if (tiff === null) return null

    const order = readUint16(view, tiff, false)
    if (order !== TIFF_LITTLE_ENDIAN && order !== TIFF_BIG_ENDIAN) return null

    const littleEndian = order === TIFF_LITTLE_ENDIAN
    if (readUint16(view, tiff + 2, littleEndian) !== TIFF_MAGIC) return null

    const firstDirectory = readUint32(view, tiff + 4, littleEndian)
    if (firstDirectory === null || firstDirectory < 8) return null

    const ifd0 = readDirectory(view, tiff, firstDirectory, littleEndian)

    const exifPointer = ifd0.find((entry) => entry.tag === TAG_EXIF_IFD)
    if (exifPointer) {
      const offset = readUint32(view, exifPointer.valueOffset, littleEndian)
      if (offset !== null) {
        const exif = readDirectory(view, tiff, offset, littleEndian)
        const original =
          dateFrom(exif, view, TAG_DATE_TIME_ORIGINAL) ??
          dateFrom(exif, view, TAG_DATE_TIME_DIGITIZED)
        if (original) return original
      }
    }

    return dateFrom(ifd0, view, TAG_DATE_TIME)
  } catch {
    // A parser that reads attacker-shaped bytes should fail as "no date", never
    // as an exception that stops the photograph being uploaded at all.
    return null
  }
}
