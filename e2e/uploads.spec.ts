import { type Page, expect, test } from '@playwright/test'
import { sampleFile } from './support/sample-image'
import { type StubOptions, albumRecord, stubSupabase } from './support/supabase-stub'

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

  test('clears the upload list on request', async ({ page }) => {
    await openAlbum(page)

    await page.getByLabel('Choose photos').setInputFiles(sampleFile())
    await expect(page.getByText('Added 1 of 1.')).toBeVisible()

    await page.getByRole('button', { name: 'Clear this list' }).click()

    await expect(page.getByText('Added 1 of 1.')).toBeHidden()
    await expect(page.locator('.photo-gallery img')).toHaveCount(1)
  })
})
