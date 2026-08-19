import { describe, expect, it, vi } from 'vitest'
import { UnreadableImageError } from './imaging/process'
import { type UploadItem, runUploads } from './uploads'
import type { Photo } from './photos'

function file(name: string): File {
  return new File(['bytes'], name, { type: 'image/jpeg' })
}

function processed() {
  return {
    full: new Blob(['full']),
    thumbnail: new Blob(['thumb']),
    width: 2000,
    height: 1500,
    phash: '0'.repeat(64),
    sharpness: 120,
    takenAt: null,
  }
}

function photo(id: string, sortOrder: number): Photo {
  return {
    id,
    storagePath: `owner/album/${id}.jpg`,
    thumbnailPath: `owner/album/${id}-thumb.jpg`,
    width: 2000,
    height: 1500,
    caption: null,
    captionVisibility: 'hidden',
    alt: null,
    sortOrder,
    phash: null,
    sharpness: null,
    takenAt: null,
  }
}

function harness(overrides: Partial<Parameters<typeof runUploads>[3]> = {}) {
  const items: UploadItem[] = []
  const photos: Photo[] = []

  return {
    items,
    photos,
    deps: {
      processor: {
        process: vi.fn().mockResolvedValue(processed()),
        dispose: vi.fn(),
      },
      store: vi.fn(async ({ sortOrder }) => photo(`photo-${sortOrder}`, sortOrder)),
      onItemChange: (item: UploadItem) => items.push(item),
      onPhoto: (created: Photo) => photos.push(created),
      wait: async () => {},
      ...overrides,
    } as Parameters<typeof runUploads>[3],
  }
}

/** The last reported state for one file. */
function finalState(items: UploadItem[], fileName: string): UploadItem | undefined {
  return [...items].reverse().find((item) => item.fileName === fileName)
}

describe('runUploads', () => {
  it('processes, uploads, and reports each file', async () => {
    const { items, photos, deps } = harness()

    await runUploads('album-1', [{ id: 'a', file: file('one.jpg') }], 0, deps)

    expect(items.map((item) => item.status)).toEqual(['processing', 'uploading', 'done'])
    expect(photos).toHaveLength(1)
  })

  it('numbers photos by their place in the batch, not by who finishes first', async () => {
    const { deps } = harness()

    await runUploads(
      'album-1',
      [
        { id: 'a', file: file('one.jpg') },
        { id: 'b', file: file('two.jpg') },
        { id: 'c', file: file('three.jpg') },
      ],
      0,
      deps,
    )

    const store = deps.store as ReturnType<typeof vi.fn>
    expect(store.mock.calls.map(([input]) => input.sortOrder).sort()).toEqual([0, 1, 2])
  })

  it('continues numbering after photos already in the album', async () => {
    const { deps } = harness()

    await runUploads('album-1', [{ id: 'a', file: file('one.jpg') }], 7, deps)

    const store = deps.store as ReturnType<typeof vi.fn>
    expect(store.mock.calls[0][0].sortOrder).toBe(7)
  })

  it('retries a failed upload and succeeds', async () => {
    const store = vi
      .fn()
      .mockRejectedValueOnce(new Error('network lost'))
      .mockResolvedValue(photo('photo-0', 0))
    const { items, photos, deps } = harness({ store })

    await runUploads('album-1', [{ id: 'a', file: file('one.jpg') }], 0, deps)

    expect(store).toHaveBeenCalledTimes(2)
    expect(finalState(items, 'one.jpg')?.status).toBe('done')
    expect(photos).toHaveLength(1)
  })

  it('gives up after the attempt limit and keeps the reason', async () => {
    const store = vi.fn().mockRejectedValue(new Error('storage unavailable'))
    const { items, photos, deps } = harness({ store })

    await runUploads('album-1', [{ id: 'a', file: file('one.jpg') }], 0, deps)

    expect(store).toHaveBeenCalledTimes(3)
    expect(finalState(items, 'one.jpg')).toMatchObject({
      status: 'failed',
      error: 'storage unavailable',
      permanent: false,
    })
    expect(photos).toHaveLength(0)
  })

  it('does not retry a format the browser cannot decode', async () => {
    const process = vi.fn().mockRejectedValue(new UnreadableImageError('holiday.heic'))
    const { items, deps } = harness({
      processor: { process, dispose: vi.fn() },
    })

    await runUploads('album-1', [{ id: 'a', file: file('holiday.heic') }], 0, deps)

    expect(process).toHaveBeenCalledOnce()
    expect(finalState(items, 'holiday.heic')).toMatchObject({
      status: 'failed',
      permanent: true,
    })
    // The message says what to do about it, not just that it failed.
    expect(finalState(items, 'holiday.heic')?.error).toContain('HEIC photo')
    expect(finalState(items, 'holiday.heic')?.error).toContain('JPEG')
  })

  it('treats a failure relayed from the worker as permanent too', async () => {
    // The class cannot survive postMessage, so the worker's rejection arrives as
    // a plain Error carrying only the name. Retrying it would be pointless.
    const relayed = new Error('holiday.heic is a HEIC photo, which this browser cannot open.')
    relayed.name = 'UnreadableImageError'
    const process = vi.fn().mockRejectedValue(relayed)
    const { items, deps } = harness({ processor: { process, dispose: vi.fn() } })

    await runUploads('album-1', [{ id: 'a', file: file('holiday.heic') }], 0, deps)

    expect(process).toHaveBeenCalledOnce()
    expect(finalState(items, 'holiday.heic')).toMatchObject({ permanent: true })
  })

  it('lets the rest of a batch through when one file is unreadable', async () => {
    const process = vi.fn(async (_file: File, name: string) => {
      if (name === 'broken.heic') throw new UnreadableImageError(name)
      return processed()
    })
    const { items, photos, deps } = harness({
      processor: { process, dispose: vi.fn() },
    })

    await runUploads(
      'album-1',
      [
        { id: 'a', file: file('one.jpg') },
        { id: 'b', file: file('broken.heic') },
        { id: 'c', file: file('three.jpg') },
      ],
      0,
      deps,
    )

    expect(photos).toHaveLength(2)
    expect(finalState(items, 'one.jpg')?.status).toBe('done')
    expect(finalState(items, 'broken.heic')?.status).toBe('failed')
    expect(finalState(items, 'three.jpg')?.status).toBe('done')
  })

  it('honours the concurrency limit across a large batch', async () => {
    let running = 0
    let peak = 0
    const process = vi.fn(async () => {
      running += 1
      peak = Math.max(peak, running)
      await Promise.resolve()
      running -= 1
      return processed()
    })
    const { deps } = harness({ processor: { process, dispose: vi.fn() }, concurrency: 4 })

    await runUploads(
      'album-1',
      Array.from({ length: 30 }, (_, index) => ({ id: `${index}`, file: file(`${index}.jpg`) })),
      0,
      deps,
    )

    expect(peak).toBeLessThanOrEqual(4)
    expect(process).toHaveBeenCalledTimes(30)
  })
})
