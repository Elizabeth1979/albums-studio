/**
 * Removes where a photograph was taken from its bytes, without touching the picture.
 *
 * Shared by the `shared-album` Edge Function, which runs it on every original a
 * visitor downloads, and by the unit suite. Plain TypeScript with no Deno or
 * browser API, so both can import it.
 *
 * In place, never re-encoded. The location lives in metadata beside the image,
 * so blanking those bytes leaves every pixel exactly as the camera wrote it and
 * the file the same length — nothing else in the file has to move.
 *
 * Two places a phone records location:
 *
 * - **EXIF's GPS block.** JPEG keeps EXIF in an APP1 segment and HEIC in an
 *   item of its own, but in both the block begins "Exif\0\0" followed by a TIFF
 *   header, so one search finds it in either. The GPS block is emptied: its
 *   entry count set to zero and every byte it held zeroed, so no reader can
 *   find a coordinate in it — not even 0°, 0°.
 * - **XMP.** Some apps copy the coordinates into the XMP packet as text, as
 *   `exif:GPSLatitude="…"` or `<exif:GPSLatitude>…</exif:GPSLatitude>`. Those
 *   values are overwritten with spaces, which keeps the packet's length.
 *
 * Nothing in the file is trusted. Every read is bounds-checked, and a block
 * that does not parse is left alone rather than half-changed.
 */

const EXIF_MARKER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00] // "Exif\0\0"
const TAG_GPS_IFD = 0x8825

/** Bytes per value for each TIFF field type; unknown types are skipped. */
const TYPE_SIZE: Record<number, number> = {
  1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8,
}

export type LocationRemoval = {
  /** A copy of the file with every location found blanked. */
  bytes: Uint8Array
  /** How many EXIF GPS blocks were emptied. */
  gpsBlocks: number
  /** How many XMP location values were blanked. */
  xmpValues: number
}

function matchesAt(bytes: Uint8Array, at: number, pattern: number[]): boolean {
  if (at + pattern.length > bytes.length) return false
  for (let i = 0; i < pattern.length; i += 1) if (bytes[at + i] !== pattern[i]) return false
  return true
}

/** Empties the GPS block of the TIFF structure starting at `tiff`. True if one was emptied. */
function blankGpsAt(bytes: Uint8Array, tiff: number): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const end = bytes.length
  if (tiff + 8 > end) return false

  const order = view.getUint16(tiff)
  const little = order === 0x4949
  if (!little && order !== 0x4d4d) return false
  if (view.getUint16(tiff + 2, little) !== 42) return false

  const u16 = (at: number) => (at + 2 <= end ? view.getUint16(at, little) : null)
  const u32 = (at: number) => (at + 4 <= end ? view.getUint32(at, little) : null)

  const ifd0 = u32(tiff + 4)
  if (ifd0 === null) return false
  const count0 = u16(tiff + ifd0)
  if (count0 === null || count0 > 500) return false

  let gps: number | null = null
  for (let i = 0; i < count0; i += 1) {
    const entry = tiff + ifd0 + 2 + i * 12
    if (entry + 12 > end) return false
    if (u16(entry) === TAG_GPS_IFD) gps = u32(entry + 8)
  }
  if (gps === null) return false

  const start = tiff + gps
  const count = u16(start)
  if (count === null || count > 500 || start + 2 + count * 12 > end) return false

  // Zero what each entry points to before zeroing the entries themselves.
  for (let i = 0; i < count; i += 1) {
    const entry = start + 2 + i * 12
    const size = TYPE_SIZE[u16(entry + 2) ?? 0]
    const values = u32(entry + 4)
    if (!size || values === null) continue

    const length = size * values
    if (length > 4) {
      const at = u32(entry + 8)
      if (at !== null && tiff + at + length <= end) bytes.fill(0, tiff + at, tiff + at + length)
    }
  }

  bytes.fill(0, start, start + 2 + count * 12)

  return true
}

/** Text of XMP location fields, as attributes or as elements. */
const XMP_LOCATION = /(exif:GPS\w+\s*=\s*")([^"]*)(")|(<exif:GPS\w+>)([^<]*)(<\/exif:GPS\w+>)/g

/** Blanks location values in any XMP text, keeping every byte where it was. */
function blankXmp(bytes: Uint8Array): number {
  // Latin-1 maps each byte to one character, so string offsets are byte offsets.
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }

  let blanked = 0
  for (const match of text.matchAll(XMP_LOCATION)) {
    const value = match[2] ?? match[5] ?? ''
    if (value.length === 0) continue

    const lead = (match[1] ?? match[4] ?? '').length
    const at = (match.index ?? 0) + lead
    bytes.fill(0x20, at, at + value.length)
    blanked += 1
  }

  return blanked
}

/** Returns a copy of `file` with its location removed, and says how much was found. */
export function removeLocation(file: Uint8Array): LocationRemoval {
  const bytes = new Uint8Array(file)
  let gpsBlocks = 0

  for (let at = 0; at + EXIF_MARKER.length < bytes.length; at += 1) {
    if (bytes[at] !== 0x45 || !matchesAt(bytes, at, EXIF_MARKER)) continue
    if (blankGpsAt(bytes, at + EXIF_MARKER.length)) gpsBlocks += 1
  }

  return { bytes, gpsBlocks, xmpValues: blankXmp(bytes) }
}
