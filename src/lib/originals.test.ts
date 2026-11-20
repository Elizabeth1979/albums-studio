import { describe, expect, it } from 'vitest'
import { ORIGINAL_SIZE_LIMIT, originalDownloadName, originalFormat } from './originals'

const file = (name: string, type: string, size = 3_000_000) => ({ name, type, size })

describe('originalFormat', () => {
  it('keeps a phone JPEG under its own type', () => {
    expect(originalFormat(file('IMG_0001.JPG', 'image/jpeg'))).toEqual({
      mime: 'image/jpeg',
      extension: 'jpg',
    })
  })

  it('reads a HEIC from its name when the browser gives no type', () => {
    expect(originalFormat(file('IMG_0002.HEIC', ''))).toEqual({
      mime: 'image/heic',
      extension: 'heic',
    })
  })

  it('trusts a known type over a misleading name', () => {
    expect(originalFormat(file('exported.jpg', 'image/png'))?.mime).toBe('image/png')
  })

  it('does not keep a type the bucket would refuse', () => {
    expect(originalFormat(file('animation.gif', 'image/gif'))).toBeNull()
    expect(originalFormat(file('scan', ''))).toBeNull()
  })

  it('does not keep a file larger than the bucket accepts', () => {
    expect(originalFormat(file('huge.jpg', 'image/jpeg', ORIGINAL_SIZE_LIMIT))).not.toBeNull()
    expect(originalFormat(file('huge.jpg', 'image/jpeg', ORIGINAL_SIZE_LIMIT + 1))).toBeNull()
  })

  it('does not keep an empty file', () => {
    expect(originalFormat(file('empty.jpg', 'image/jpeg', 0))).toBeNull()
  })
})

describe('originalDownloadName', () => {
  it('names the download after the photograph, keeping its extension', () => {
    expect(originalDownloadName('owner/album/1234-abcd-original.heic')).toBe('photo-1234-abcd.heic')
  })
})
