import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FULL_SIZE,
  THUMBNAIL_SIZE,
  detailOf,
  fitWithin,
  isPermanentFailure,
  processImage,
} from './process'

/**
 * fitWithin decides the dimensions of every stored photo and thumbnail. The
 * end-to-end suite uses a small sample that already fits, so without these the
 * downscale branch every real photo takes would run untested.
 */
describe('fitWithin', () => {
  it('leaves an image that already fits alone', () => {
    expect(fitWithin(800, 600, FULL_SIZE)).toEqual({ width: 800, height: 600 })
  })

  it('never enlarges a small image', () => {
    expect(fitWithin(50, 40, FULL_SIZE)).toEqual({ width: 50, height: 40 })
  })

  it('caps the longest edge when the image is wider than tall', () => {
    expect(fitWithin(4000, 3000, FULL_SIZE)).toEqual({ width: 2000, height: 1500 })
  })

  it('caps the longest edge when the image is taller than wide', () => {
    expect(fitWithin(3000, 4000, FULL_SIZE)).toEqual({ width: 1500, height: 2000 })
  })

  it('keeps the aspect ratio through a downscale', () => {
    const source = { width: 4032, height: 3024 } // a common phone sensor
    const fitted = fitWithin(source.width, source.height, FULL_SIZE)

    expect(fitted.width / fitted.height).toBeCloseTo(source.width / source.height, 2)
    expect(Math.max(fitted.width, fitted.height)).toBe(FULL_SIZE)
  })

  it('produces whole pixels', () => {
    const fitted = fitWithin(1476, 1500, FULL_SIZE)

    expect(Number.isInteger(fitted.width)).toBe(true)
    expect(Number.isInteger(fitted.height)).toBe(true)
  })

  it('never rounds an extreme ratio down to zero', () => {
    // A canvas of zero width throws, and the dimensions columns require > 0.
    const fitted = fitWithin(8000, 3, THUMBNAIL_SIZE)

    expect(fitted.width).toBeGreaterThan(0)
    expect(fitted.height).toBeGreaterThan(0)
  })

  it('caps a square at the thumbnail size too', () => {
    expect(fitWithin(3000, 3000, THUMBNAIL_SIZE)).toEqual({
      width: THUMBNAIL_SIZE,
      height: THUMBNAIL_SIZE,
    })
  })
})

/**
 * Decoding itself needs a real browser, so the end-to-end suite owns the happy
 * path. What can be checked here is how failures are told apart — which is the
 * part that was wrong: every failure claimed the photo was damaged or in an
 * unsupported format, including failures that had nothing to do with the image.
 */
describe('reading a file that yields nothing', () => {
  const decoder = vi.fn()

  afterEach(() => {
    vi.unstubAllGlobals()
    decoder.mockReset()
  })

  function file(bytes: number, name = 'photo.jpg'): File {
    return new File([new Uint8Array(bytes)], name, { type: 'image/jpeg' })
  }

  it('does not blame the format when the file is empty', async () => {
    // An Android picker can hand over a cloud-only photo as an empty File. The
    // photograph is fine; it simply is not on the device.
    vi.stubGlobal('createImageBitmap', decoder)

    await expect(processImage(file(0), 'photo.jpg')).rejects.toThrow(/could not be read from your device/)
    expect(decoder).not.toHaveBeenCalled()
  })

  it('says what to do about it', async () => {
    vi.stubGlobal('createImageBitmap', decoder)

    await expect(processImage(file(0), 'photo.jpg')).rejects.toThrow(/open it once in your gallery/)
  })

  it('records how many bytes arrived', async () => {
    vi.stubGlobal('createImageBitmap', decoder)

    const error = await processImage(file(0), 'photo.jpg').catch((caught) => caught)

    expect(detailOf(error)).toContain('0 bytes')
  })

  it('is not worth retrying', async () => {
    // Three attempts at a file the device will not hand over is three times the
    // wait for the same answer.
    vi.stubGlobal('createImageBitmap', decoder)

    const error = await processImage(file(0), 'photo.jpg').catch((caught) => caught)

    expect(isPermanentFailure(error)).toBe(true)
  })

  it('reports a file the device refuses to read at all', async () => {
    vi.stubGlobal('createImageBitmap', decoder)
    const unreadable = {
      type: 'image/jpeg',
      arrayBuffer: () => Promise.reject(new DOMException('Could not read', 'NotReadableError')),
    } as unknown as File

    const error = await processImage(unreadable, 'photo.jpg').catch((caught) => caught)

    expect(error.message).toMatch(/could not be read from your device/)
    expect(detailOf(error)).toContain('NotReadableError')
  })
})

describe('a file whose bytes will not decode', () => {
  const decoder = vi.fn()

  afterEach(() => {
    vi.unstubAllGlobals()
    decoder.mockReset()
  })

  function file(name = 'photo.jpg', type = 'image/jpeg'): File {
    return new File([new Uint8Array([1, 2, 3, 4])], name, { type })
  }

  it('tries again at a bounded size before giving up', async () => {
    // A phone camera writes frames too large to decode whole on the phone that
    // took them. Asking the decoder to scale as it reads is the difference
    // between a photo that uploads and one that does not.
    vi.stubGlobal('createImageBitmap', decoder)
    decoder
      .mockRejectedValueOnce(new DOMException('Out of memory', 'InvalidStateError'))
      .mockResolvedValueOnce({ width: 2000, height: 1500, close: vi.fn() })

    // The draw step needs a canvas this environment has not got; reaching it at
    // all is the point, so the failure after that is expected and ignored.
    await processImage(file(), 'photo.jpg').catch(() => undefined)

    expect(decoder).toHaveBeenCalledTimes(2)
    expect(decoder.mock.calls[1][1]).toMatchObject({ resizeWidth: FULL_SIZE })
  })

  it('keeps the aspect ratio on the retry by constraining one edge only', async () => {
    vi.stubGlobal('createImageBitmap', decoder)
    decoder
      .mockRejectedValueOnce(new Error('too big'))
      .mockResolvedValueOnce({ width: 2000, height: 1500, close: vi.fn() })

    await processImage(file(), 'photo.jpg').catch(() => undefined)

    expect(decoder.mock.calls[1][1]).not.toHaveProperty('resizeHeight')
  })

  it('reports the browser’s own reason once both attempts fail', async () => {
    vi.stubGlobal('createImageBitmap', decoder)
    decoder.mockRejectedValue(new DOMException('The source image could not be decoded', 'EncodingError'))

    const error = await processImage(file(), 'photo.jpg').catch((caught) => caught)

    expect(error.message).toMatch(/damaged, or in a format/)
    expect(detailOf(error)).toContain('EncodingError')
    expect(isPermanentFailure(error)).toBe(true)
  })

  it('still names HEIC specifically, with its own remedy', async () => {
    vi.stubGlobal('createImageBitmap', decoder)
    decoder.mockRejectedValue(new Error('unsupported'))

    const error = await processImage(file('IMG_0001.heic', 'image/heic'), 'IMG_0001.heic').catch(
      (caught) => caught,
    )

    expect(error.message).toMatch(/HEIC/)
  })
})
