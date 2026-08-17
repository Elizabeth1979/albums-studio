import { describe, expect, it } from 'vitest'
import { explainUnreadable } from './formats'

describe('explainUnreadable', () => {
  it('names the file, whatever the format', () => {
    expect(explainUnreadable('holiday.tif', 'image/tiff')).toContain('holiday.tif')
    expect(explainUnreadable('broken.jpg', 'image/jpeg')).toContain('broken.jpg')
  })

  it('offers a remedy for HEIC rather than only a refusal', () => {
    const message = explainUnreadable('IMG_0001.HEIC', '')

    expect(message).toContain('HEIC')
    expect(message).toContain('iPhone')
    expect(message).toContain('JPEG')
  })

  it('recognises HEIC by extension or by type, in any case', () => {
    for (const [name, type] of [
      ['photo.heic', ''],
      ['photo.HEIC', ''],
      ['photo.heif', ''],
      ['no-extension', 'image/heic'],
      ['no-extension', 'image/heif'],
    ]) {
      expect(explainUnreadable(name, type)).toContain('HEIC photo')
    }
  })

  it('does not blame HEIC for an unrelated failure', () => {
    const message = explainUnreadable('scan.tif', 'image/tiff')

    expect(message).not.toContain('HEIC')
    expect(message).toContain('may be damaged')
  })

  it('is not fooled by heic appearing elsewhere in the name', () => {
    expect(explainUnreadable('heicopter.jpg', 'image/jpeg')).not.toContain('HEIC photo')
  })
})
