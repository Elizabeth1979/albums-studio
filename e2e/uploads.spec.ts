import { type Page, expect, test } from '@playwright/test'
import { sampleFile } from './support/sample-image'
import { type StubOptions, albumRecord, stubSupabase } from './support/supabase-stub'

/** The `<img>` the stub serves for a signed URL is a single pixel. */
const STUB_PIXEL_WIDTH = 1

async function openAlbum(page: Page, options: StubOptions = {}) {
  const calls = await stubSupabase(page, { albums: [albumRecord()], ...options })

  await page.goto('/')
  await page.getByLabel('Email', { exact: true }).fill('person@example.com')
  await page.getByLabel('Password', { exact: true }).fill('the-right-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('button', { name: /Summer by the lake/ }).click()
  await expect(page.getByRole('heading', { name: 'No photos yet' })).toBeVisible()

  return calls
}

test.describe('uploading photos', () => {
  test('processes a real image in the browser and records what it measured', async ({ page }) => {
    // Nothing is faked between choosing the file and the insert: Chromium
    // decodes the PNG, resizes it on a canvas, and computes the hash and
    // sharpness from the actual pixels.
    const calls = await openAlbum(page)

    await page.getByLabel('Choose photos').setInputFiles(sampleFile())

    await expect(page.getByText('Added 1 of 1.')).toBeVisible()

    const insert = calls.all.find(
      (call) => call.method === 'POST' && call.path.endsWith('/rest/v1/photos'),
    )
    const body = insert?.body as Record<string, unknown>

    expect(body).toMatchObject({ album_id: 'album-1', mime: 'image/jpeg', sort_order: 0 })

    // A 96px source is already under the 2000px ceiling, so it keeps its size.
    expect(body.width).toBe(96)
    expect(body.height).toBe(96)

    // 64 bits, and not all the same: a constant hash would mean the transform
    // never saw the image.
    expect(String(body.phash)).toMatch(/^[01]{64}$/)
    expect(new Set(String(body.phash)).size).toBe(2)

    // A checkerboard has real edges, so the focus measure must be well above zero.
    expect(Number(body.sharpness)).toBeGreaterThan(0)
  })

  test('shrinks a photo larger than the ceiling, keeping its shape', async ({ page }) => {
    // Every photo off a real camera takes this branch; the small sample used by
    // the other cases already fits and never exercises it.
    const calls = await openAlbum(page)

    await page.getByLabel('Choose photos').setInputFiles(sampleFile('wide.png', 2400, 400))
    await expect(page.getByText('Added 1 of 1.')).toBeVisible()

    const insert = calls.all.find(
      (call) => call.method === 'POST' && call.path.endsWith('/rest/v1/photos'),
    )
    const body = insert?.body as Record<string, unknown>

    // 2400x400 capped at 2000 on the longest edge.
    expect(body.width).toBe(2000)
    expect(body.height).toBe(333)
  })

  test('uploads a full image and a thumbnail under the owner prefix', async ({ page }) => {
    const calls = await openAlbum(page)

    await page.getByLabel('Choose photos').setInputFiles(sampleFile())
    await expect(page.getByText('Added 1 of 1.')).toBeVisible()

    const objects = calls.objects()
    expect(objects).toHaveLength(2)

    // Both the Storage policy and a database check require the owner's uuid to
    // start the key.
    for (const key of objects) {
      expect(key.startsWith('00000000-0000-4000-8000-000000000001/album-1/')).toBe(true)
    }
    expect(objects.filter((key) => key.endsWith('-thumb.jpg'))).toHaveLength(1)
  })

  test('shows the photos it added, in the album layout', async ({ page }) => {
    await openAlbum(page)

    await page.getByLabel('Choose photos').setInputFiles([
      sampleFile('one.png'),
      sampleFile('two.png'),
    ])

    await expect(page.getByText('Added 2 of 2.')).toBeVisible()
    await expect(page.locator('.photo-gallery img')).toHaveCount(2)
    await expect(page.locator('.photo-gallery')).toHaveClass(/layout-masonry/)

    // An <img> exists even when its source 404s, so check the bytes arrived.
    // Signed URLs are the one part of this path the browser resolves itself.
    const loaded = await page
      .locator('.photo-gallery img')
      .evaluateAll((images) =>
        images.every((image) => (image as HTMLImageElement).naturalWidth > 0),
      )
    expect(loaded).toBe(true)
  })

  test('keeps the photos after a reload', async ({ page }) => {
    // The Phase 3 checkpoint: upload a batch, refresh, and still see them.
    await openAlbum(page)

    await page.getByLabel('Choose photos').setInputFiles([
      sampleFile('one.png'),
      sampleFile('two.png'),
      sampleFile('three.png'),
    ])
    await expect(page.getByText('Added 3 of 3.')).toBeVisible()

    await page.reload()

    await expect(page.locator('.photo-gallery img')).toHaveCount(3)
    await expect(page.getByRole('heading', { name: 'No photos yet' })).toBeHidden()
  })

  test('numbers photos in the order they were chosen', async ({ page }) => {
    const calls = await openAlbum(page)

    await page.getByLabel('Choose photos').setInputFiles([
      sampleFile('one.png'),
      sampleFile('two.png'),
      sampleFile('three.png'),
    ])
    await expect(page.getByText('Added 3 of 3.')).toBeVisible()

    expect(calls.photos().map((photo) => photo.sort_order).sort()).toEqual([0, 1, 2])
  })

  test('names a photo the database refused', async ({ page }) => {
    await openAlbum(page, {
      photoWrite: { status: 403, body: { message: 'permission denied for table photos' } },
    })

    await page.getByLabel('Choose photos').setInputFiles(sampleFile('one.png'))

    const alert = page.getByRole('alert')
    await expect(alert).toContainText('1 photo could not be added.', { timeout: 15000 })
    await expect(page.getByText('one.png')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'No photos yet' })).toBeVisible()
  })

  test('does not call an empty file damaged', async ({ page }) => {
    // The real report: a photograph chosen on Android failed with "may be
    // damaged, or in a format this browser does not support". A file that hands
    // over no bytes is neither, and sending someone to check a photo that is
    // perfectly fine is the wrong advice.
    await openAlbum(page)

    await page.getByLabel('Choose photos').setInputFiles({
      name: 'cloud-only.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.alloc(0),
    })

    const item = page.locator('.upload-item')
    await expect(item).toContainText('could not be read from your device', { timeout: 15000 })
    await expect(item).toContainText('open it once in your gallery')
    await expect(item).not.toContainText('damaged')

    // And says how many bytes turned up, so a report is diagnosable.
    await expect(page.locator('.upload-detail')).toContainText('0 bytes')
  })

  test('gives up on an empty file immediately rather than retrying', async ({ page }) => {
    await openAlbum(page)

    const started = Date.now()
    await page.getByLabel('Choose photos').setInputFiles({
      name: 'cloud-only.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.alloc(0),
    })
    await expect(page.getByRole('alert')).toContainText('Retrying will not help', {
      timeout: 15000,
    })

    // Three attempts with backoff would take well over a second.
    expect(Date.now() - started).toBeLessThan(4000)
  })

  test('reports what the browser said about a file it cannot decode', async ({ page }) => {
    await openAlbum(page)

    await page.getByLabel('Choose photos').setInputFiles({
      name: 'not-really.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('this is not an image at all'),
    })

    const item = page.locator('.upload-item')
    await expect(item).toContainText('could not be read as an image here', { timeout: 15000 })

    // The browser's own words, which is the only thing that can contradict the
    // guess above it when the guess is wrong.
    await expect(page.locator('.upload-detail')).not.toBeEmpty()
  })

  test('does not leave orphaned objects when the row is refused', async ({ page }) => {
    // Bytes with no row are invisible to the owner; the upload path removes
    // them rather than letting the bucket fill with unreferenced objects.
    const calls = await openAlbum(page, {
      photoWrite: { status: 403, body: { message: 'permission denied for table photos' } },
    })

    await page.getByLabel('Choose photos').setInputFiles(sampleFile('one.png'))
    await expect(page.getByRole('alert')).toContainText('could not be added', {
      timeout: 15000,
    })

    expect(calls.objects()).toHaveLength(0)
  })

  test('puts the first photo on the album card in the library', async ({ page }) => {
    // The reason an owner uploads at all: the library stops being a list of
    // titles. Nothing here is faked past the insert — the cover is written,
    // read back by id, signed, and fetched by the browser.
    const calls = await openAlbum(page)

    await page.getByLabel('Choose photos').setInputFiles(sampleFile())
    await expect(page.getByText('Added 1 of 1.')).toBeVisible()

    await page.getByRole('button', { name: '← All albums' }).click()

    const cover = page.locator('.album-card img.album-cover')
    await expect(cover).toHaveCount(1)
    await expect(cover).toHaveJSProperty('naturalWidth', STUB_PIXEL_WIDTH)

    expect(calls.albums()[0].cover_photo_id).toBe('photo-1')
  })

  test('keeps a cover the album already had', async ({ page }) => {
    // Uploading more photos must not silently reassign a cover: once an owner
    // can choose one, this is the behaviour that protects the choice.
    const calls = await openAlbum(page, {
      albums: [albumRecord({ cover_photo_id: 'photo-chosen' })],
    })

    await page.getByLabel('Choose photos').setInputFiles(sampleFile())
    await expect(page.getByText('Added 1 of 1.')).toBeVisible()

    expect(calls.albums()[0].cover_photo_id).toBe('photo-chosen')
    expect(
      calls.all.some((call) => call.method === 'PATCH' && call.path.endsWith('/albums')),
    ).toBe(false)
  })

  test('leaves an empty album with no cover on its card', async ({ page }) => {
    await stubSupabase(page, { albums: [albumRecord()] })

    await page.goto('/')
    await page.getByLabel('Email', { exact: true }).fill('person@example.com')
    await page.getByLabel('Password', { exact: true }).fill('the-right-password')
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page.getByRole('button', { name: /Summer by the lake/ })).toBeVisible()
    await expect(page.locator('.album-card img.album-cover')).toHaveCount(0)
    await expect(page.locator('.album-card .album-cover.empty')).toHaveCount(1)
  })

  test('deleting an album takes the photographs with it', async ({ page }) => {
    // "Removes the album shell. Photos it holds go with it." said the
    // confirmation, while every file stayed in the bucket for good. Rows
    // cascade; bytes do not, and only this test walks the whole path.
    const calls = await openAlbum(page)

    await page.getByLabel('Choose photos').setInputFiles([
      sampleFile('one.png'),
      sampleFile('two.png'),
    ])
    await expect(page.getByText('Added 2 of 2.')).toBeVisible()
    expect(calls.objects()).toHaveLength(4)

    await page.getByRole('button', { name: 'Delete album' }).click()
    await page.getByRole('button', { name: 'Yes, delete this album' }).click()

    await expect(page.getByRole('heading', { name: 'No albums yet' })).toBeVisible()
    expect(calls.albums()).toHaveLength(0)
    expect(calls.objects()).toHaveLength(0)
  })

  test('keeps the photographs when the album could not be deleted', async ({ page }) => {
    // Removing bytes before the rows would leave an album of broken images.
    const calls = await openAlbum(page)

    await page.getByLabel('Choose photos').setInputFiles(sampleFile('one.png'))
    await expect(page.getByText('Added 1 of 1.')).toBeVisible()

    await page.route('**/rest/v1/albums?id=eq.*', async (route) =>
      route.request().method() === 'DELETE'
        ? route.fulfill({
            status: 403,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'permission denied for table albums' }),
          })
        : route.fallback(),
    )

    await page.getByRole('button', { name: 'Delete album' }).click()
    await page.getByRole('button', { name: 'Yes, delete this album' }).click()

    await expect(page.getByRole('alert')).toContainText('permission denied')
    expect(calls.objects()).toHaveLength(2)
  })

  test('clears the upload list on request', async ({ page }) => {
    await openAlbum(page)

    await page.getByLabel('Choose photos').setInputFiles(sampleFile())
    await expect(page.getByText('Added 1 of 1.')).toBeVisible()

    await page.getByRole('button', { name: 'Clear this list' }).click()

    await expect(page.getByText('Added 1 of 1.')).toBeHidden()
    await expect(page.locator('.photo-gallery img')).toHaveCount(1)
  })
})
