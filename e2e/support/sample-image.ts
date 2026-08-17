import { crc32, deflateSync } from 'node:zlib'

function chunk(tag: string, data: Buffer): Buffer {
  const type = Buffer.from(tag, 'ascii')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)

  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([type, data])) >>> 0)

  return Buffer.concat([length, type, data, checksum])
}

/**
 * A real PNG, built here rather than committed as a fixture blob.
 *
 * The pattern varies along both axes on purpose: the upload path computes a
 * perceptual hash and a sharpness score from whatever it decodes, and a flat
 * or single-axis image would exercise those with degenerate input.
 */
export function samplePng(width = 96, height = width): Buffer {
  const raw = Buffer.alloc(height * (width * 3 + 1))
  let offset = 0

  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0 // no per-scanline filter
    offset += 1

    for (let x = 0; x < width; x += 1) {
      raw[offset] = 120 + 100 * ((Math.floor(x / 8) + Math.floor(y / 8)) % 2)
      raw[offset + 1] = 80 + ((x * 2) % 160)
      raw[offset + 2] = 200 - ((y * 2) % 160)
      offset += 3
    }
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 2 // truecolour

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

export function sampleFile(name = 'reef.png', width = 96, height = width) {
  return { name, mimeType: 'image/png', buffer: samplePng(width, height) }
}
