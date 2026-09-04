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

/**
 * A PNG built from a pixel function, so a test can serve a photograph that is
 * genuinely in or out of focus rather than a stand-in that only stands for one.
 */
function pngFrom(
  width: number,
  height: number,
  shade: (x: number, y: number) => number,
): Buffer {
  const raw = Buffer.alloc(height * (width * 3 + 1))
  let offset = 0

  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0
    offset += 1

    for (let x = 0; x < width; x += 1) {
      const value = Math.max(0, Math.min(255, Math.round(shade(x, y))))
      raw[offset] = value
      raw[offset + 1] = value
      raw[offset + 2] = value
      offset += 3
    }
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/**
 * A photograph at the size a camera writes one, before anything shrinks it.
 *
 * These build a thumbnail the way the app really gets one: detail at every
 * scale, blurred (or not) at camera size, and only then reduced. That order is
 * the whole point. A thumbnail drawn as a smooth gradient is "blurry" at any
 * size and proves nothing, while a real photograph's blur shrinks along with
 * the photograph — which is exactly how a plainly blurred picture once measured
 * as sharp enough to say nothing about.
 */
const CAMERA_WIDTH = 1200
const CAMERA_HEIGHT = 900

function noise(seed: number) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

function cameraFrame(): Float64Array {
  const random = noise(19)
  const out = new Float64Array(CAMERA_WIDTH * CAMERA_HEIGHT)
  let amplitude = 1
  let total = 0

  for (let cell = 300; cell >= 2; cell /= 2) {
    const columns = Math.ceil(CAMERA_WIDTH / cell) + 2
    const rows = Math.ceil(CAMERA_HEIGHT / cell) + 2
    const grid = Array.from({ length: rows * columns }, () => random())

    for (let y = 0; y < CAMERA_HEIGHT; y += 1) {
      for (let x = 0; x < CAMERA_WIDTH; x += 1) {
        const gx = x / cell
        const gy = y / cell
        const x0 = Math.floor(gx)
        const y0 = Math.floor(gy)
        const fx = gx - x0
        const fy = gy - y0
        const sx = fx * fx * (3 - 2 * fx)
        const sy = fy * fy * (3 - 2 * fy)
        const a = grid[y0 * columns + x0]
        const b = grid[y0 * columns + x0 + 1]
        const c = grid[(y0 + 1) * columns + x0]
        const d = grid[(y0 + 1) * columns + x0 + 1]
        const top = a + (b - a) * sx
        const bottom = c + (d - c) * sx

        out[y * CAMERA_WIDTH + x] += amplitude * (top + (bottom - top) * sy)
      }
    }

    total += amplitude
    amplitude *= 0.75
  }

  for (let i = 0; i < out.length; i += 1) {
    out[i] = 128 + 110 * (out[i] / total - 0.5)
  }

  return out
}

function blurAtCameraSize(source: Float64Array, sigma: number): Float64Array {
  const radius = Math.max(1, Math.ceil(sigma * 3))
  const weights: number[] = []
  for (let i = -radius; i <= radius; i += 1) {
    weights.push(Math.exp(-(i * i) / (2 * sigma * sigma)))
  }
  const sum = weights.reduce((a, b) => a + b, 0)
  const kernel = weights.map((w) => w / sum)

  const clamp = (value: number, limit: number) => Math.min(limit - 1, Math.max(0, value))
  const horizontal = new Float64Array(source.length)
  const out = new Float64Array(source.length)

  for (let y = 0; y < CAMERA_HEIGHT; y += 1) {
    for (let x = 0; x < CAMERA_WIDTH; x += 1) {
      let total = 0
      for (let i = -radius; i <= radius; i += 1) {
        total += kernel[i + radius] * source[y * CAMERA_WIDTH + clamp(x + i, CAMERA_WIDTH)]
      }
      horizontal[y * CAMERA_WIDTH + x] = total
    }
  }

  for (let y = 0; y < CAMERA_HEIGHT; y += 1) {
    for (let x = 0; x < CAMERA_WIDTH; x += 1) {
      let total = 0
      for (let i = -radius; i <= radius; i += 1) {
        total += kernel[i + radius] * horizontal[clamp(y + i, CAMERA_HEIGHT) * CAMERA_WIDTH + x]
      }
      out[y * CAMERA_WIDTH + x] = total
    }
  }

  return out
}

/** Averages the camera frame down to a thumbnail, as a canvas draw would. */
function toThumbnail(camera: Float64Array, size: number): { pixels: Float64Array; width: number; height: number } {
  const scale = size / CAMERA_WIDTH
  const width = Math.round(CAMERA_WIDTH * scale)
  const height = Math.round(CAMERA_HEIGHT * scale)
  const out = new Float64Array(width * height)

  for (let y = 0; y < height; y += 1) {
    const top = Math.floor((y * CAMERA_HEIGHT) / height)
    const bottom = Math.max(top + 1, Math.floor(((y + 1) * CAMERA_HEIGHT) / height))

    for (let x = 0; x < width; x += 1) {
      const left = Math.floor((x * CAMERA_WIDTH) / width)
      const right = Math.max(left + 1, Math.floor(((x + 1) * CAMERA_WIDTH) / width))

      let total = 0
      let counted = 0
      for (let sy = top; sy < bottom; sy += 1) {
        for (let sx = left; sx < right; sx += 1) {
          total += camera[sy * CAMERA_WIDTH + sx]
          counted += 1
        }
      }

      out[y * width + x] = counted > 0 ? total / counted : 0
    }
  }

  return { pixels: out, width, height }
}

function greyPng(plane: { pixels: Float64Array; width: number; height: number }): Buffer {
  const { pixels, width, height } = plane
  const raw = Buffer.alloc(height * (width * 3 + 1))
  let offset = 0

  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0
    offset += 1

    for (let x = 0; x < width; x += 1) {
      const value = Math.max(0, Math.min(255, Math.round(pixels[y * width + x])))
      raw[offset] = value
      raw[offset + 1] = value
      raw[offset + 2] = value
      offset += 3
    }
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** The thumbnail of a photograph that came out. */
export function sharpPng(size = 400): Buffer {
  return greyPng(toThumbnail(cameraFrame(), size))
}

/**
 * The thumbnail of a photograph the lens missed.
 *
 * Blurred at camera size by well past the line, then reduced — so it stays
 * blurred at the size the app measures, and stops looking blurred if anything
 * reduces it further. That is what makes this fixture a guard rather than a
 * prop.
 */
export function blurredPng(size = 400): Buffer {
  return greyPng(toThumbnail(blurAtCameraSize(cameraFrame(), 12), size))
}

/**
 * The thumbnail of a photograph that is soft rather than ruined — and the one
 * fixture here that can fail.
 *
 * `blurredPng` is blurred so far past the line that it reads as blurred at any
 * size, which makes it a poor guard: the bug that shipped measured photographs
 * at 256px instead of the thumbnail's own 400px, and that fixture would have
 * been caught either way. This one is blurred to the level a lens actually
 * misses by. Served at `STORED` it reads 0.559 and is offered; measured one
 * step smaller it reads 0.429 at 400px and 0.386 at 256px, and the album says
 * nothing about it. That gap is the guard.
 *
 * It only became a guard when the line moved to 0.46. Against the old 0.42 the
 * 400px reading of 0.429 still counted as offered, so this fixture passed at
 * either size and the one test written to catch a reduction going wrong could
 * not have caught the reduction that was wrong for two rounds. A fixture that
 * passes on both sides of the fault it guards is not guarding it.
 */
export function softPng(size = 400): Buffer {
  return greyPng(toThumbnail(blurAtCameraSize(cameraFrame(), 5), size))
}

/** Blends between two colours, softly, the way a lens renders an edge. */
function mix(a: number[], b: number[], t: number): number[] {
  const s = Math.max(0, Math.min(1, t))
  const e = s * s * (3 - 2 * s)
  return [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e]
}

/** A PNG built from a per-pixel colour, for scenes where colour is the point. */
function colourPngFrom(
  width: number,
  height: number,
  shade: (x: number, y: number) => number[],
): Buffer {
  const raw = Buffer.alloc(height * (width * 3 + 1))
  let offset = 0

  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0
    offset += 1

    for (let x = 0; x < width; x += 1) {
      const rgb = shade(x, y)
      for (let channel = 0; channel < 3; channel += 1) {
        raw[offset + channel] = Math.max(0, Math.min(255, Math.round(rgb[channel])))
      }
      offset += 3
    }
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/**
 * A photograph with a person in it, for proving the face check runs in the app.
 *
 * Drawn from arithmetic rather than shipped as a photograph of somebody: a
 * fixture that is a picture of a real person is a picture of a real person, and
 * it would live in this repository forever.
 *
 * Skin colour and soft edges are both load-bearing. A grey version of exactly
 * this geometry, with hard edges, is not detected at all — BlazeFace is trained
 * on photographs and wants something that looks like one. That is worth knowing
 * before anyone simplifies this.
 *
 * `share` is the face's width as a fraction of the frame's, and it is the only
 * thing detection depends on: BlazeFace resizes whatever it is given to
 * 128x128, so a photograph's pixel count never enters into it. Small values
 * make a face that only the tiled passes can find.
 *
 * What this proves is narrow and worth being plain about: that the detector
 * loads, runs, and reports inside the real app. Whether it can find a small
 * hatted boy at some distance on a beach is not a question any arithmetic here
 * can answer. Only the owner's album can.
 */
export function facePng(size = 480, share = 0.40): Buffer {
  const width = size
  const height = Math.round(size * 0.75)
  const cx = width / 2
  const cy = height * 0.52
  // `share` is the face's full width as a fraction of the frame's, which is the
  // only thing detection depends on — the model resizes everything to 128x128.
  const rx = (width * share) / 2
  const ry = rx * 1.7

  const BACKDROP = [107, 125, 140]
  const HAIR = [59, 43, 34]
  const SCLERA = [251, 251, 248]
  const IRIS = [74, 53, 36]
  const PUPIL = [23, 18, 20]
  const MOUTH = [142, 77, 70]

  return colourPngFrom(width, height, (x, y) => {
    const dx = (x - cx) / rx
    const dy = (y - cy) / ry
    const grain = ((x * 7 + y * 13) % 9) - 4

    // Skin, lit from the upper left the way a face usually is.
    const lit = Math.hypot(dx + 0.30, dy + 0.35)
    let rgb = mix([240, 208, 180], [185, 143, 112], (lit - 0.15) / 1.05)

    const face = Math.hypot(dx, dy)
    const hairY = (y - (cy - ry * 0.72)) / (ry * 0.42)
    const inHair = Math.hypot(dx / 1.04, hairY) < 1 && y < cy - ry * 0.28

    for (const side of [-1, 1]) {
      const ex = cx + side * rx * 0.38
      const ey = cy - ry * 0.16
      const eye = Math.hypot((x - ex) / (rx * 0.19), (y - ey) / (ry * 0.105))
      if (eye < 1.15) {
        const iris = Math.hypot((x - ex) / (rx * 0.088), (y - ey) / (ry * 0.088))
        const inner = iris < 0.48 ? PUPIL : iris < 1 ? IRIS : SCLERA
        rgb = mix(rgb, inner, (1.15 - eye) / 0.16)
      }

      const brow = Math.hypot((x - ex) / (rx * 0.26), (y - (ey - ry * 0.24)) / (ry * 0.062))
      if (brow < 1.3) rgb = mix(rgb, HAIR, (1.3 - brow) / 0.35)
    }

    // Nose shadow, then the mouth.
    const nose = Math.hypot((x - (cx - rx * 0.06)) / (rx * 0.12), (y - (cy + ry * 0.17)) / (ry * 0.11))
    if (nose < 1.2) rgb = mix(rgb, [163, 118, 90], (1.2 - nose) / 0.5)

    const smile = cy + ry * 0.45 + (ry * 0.10) * ((x - cx) / rx) * ((x - cx) / rx)
    const mouth = Math.hypot((x - cx) / (rx * 0.30), (y - smile) / (ry * 0.062))
    if (mouth < 1.25) rgb = mix(rgb, MOUTH, (1.25 - mouth) / 0.4)

    if (inHair) rgb = mix(rgb, HAIR, 1)
    else rgb = mix(rgb, BACKDROP, (face - 0.97) / 0.06)

    return [rgb[0] + grain, rgb[1] + grain, rgb[2] + grain]
  })
}

export function sampleFile(name = 'reef.png', width = 96, height = width) {
  return { name, mimeType: 'image/png', buffer: samplePng(width, height) }
}
