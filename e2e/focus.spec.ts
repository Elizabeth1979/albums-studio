import { type Page, expect, test } from '@playwright/test'
import { blurredPng, sharpPng, softPng } from './support/sample-image'
import { type StubOptions, albumRecord, photoRecord, stubSupabase } from './support/supabase-stub'

/** Signs in and opens an album already holding `options.photos`. */
async function openAlbum(page: Page, options: StubOptions = {}) {
  const calls = await stubSupabase(page, { albums: [albumRecord()], ...options })

  await page.goto('/')
  await page.getByLabel('Email', { exact: true }).fill('person@example.com')
  await page.getByLabel('Password', { exact: true }).fill('the-right-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('button', { name: /Summer by the lake/ }).click()

  return calls
}

const photos = [
  photoRecord({ id: 'photo-1', sort_order: 0 }),
  photoRecord({
    id: 'photo-2',
    storage_path: 'owner/album-1/photo-2.jpg',
    thumbnail_path: 'owner/album-1/photo-2-thumb.jpg',
    sort_order: 1,
  }),
]

/** The first photograph came out; the second did not. */
const oneOfEach = {
  photos,
  objectBytes: {
    'owner/album-1/photo-1-thumb.jpg': sharpPng(),
    'owner/album-1/photo-2-thumb.jpg': blurredPng(),
  },
}

test.describe('photos that are out of focus', () => {
  test('judges the photographs the album already held, from what the browser decodes', async ({
    page,
  }) => {
    // End to end because nothing else can prove this: the measurement runs on
    // pixels a real browser decoded, and every unit test above it works on
    // numbers someone chose.
    await openAlbum(page, oneOfEach)

    await expect(page.getByRole('heading', { name: 'Photos that look out of focus' })).toBeVisible()
    await expect(page.locator('section.soft .similar-item')).toHaveCount(1)
    await expect(page.getByLabel(/Remove photo 2/)).toBeVisible()

    // Two deliberate acts, and the row leaves the album only after the second.
    await page.getByLabel(/Remove photo 2/).check()
    await page.getByRole('button', { name: 'Remove 1 ticked photo' }).click()
    await page.getByRole('button', { name: 'Yes, remove 1 blurred photo' }).click()

    await expect(page.getByRole('heading', { name: '1 photo' })).toBeVisible()
  })

  test('offers a photograph that is soft rather than ruined', async ({ page }) => {
    // The guard for the fault that shipped. Focus is a property of the frame
    // the camera wrote, and every reduction on the way here takes some of it
    // away: measured one step smaller than the thumbnail, this same photograph
    // reads as sharp enough to say nothing about, and a real album went quiet.
    await openAlbum(page, {
      photos,
      objectBytes: {
        'owner/album-1/photo-1-thumb.jpg': sharpPng(),
        'owner/album-1/photo-2-thumb.jpg': softPng(),
      },
    })

    await expect(page.getByRole('heading', { name: 'Photos that look out of focus' })).toBeVisible()
    await expect(page.getByLabel(/Remove photo 2/)).toBeVisible()
    await expect(page.locator('section.soft .similar-item')).toHaveCount(1)
  })

  test('says so when the photographs could not be read for measuring', async ({ page }) => {
    // The failure mode that no earlier test could see. Reading an object's
    // bytes is a different permission from drawing it in a tile, so the album
    // can look perfectly normal while nothing in it is ever measured. Silence
    // there is indistinguishable from "your photographs are fine".
    await openAlbum(page, {
      photos,
      objectBytes: oneOfEach.objectBytes,
      objectRead: { status: 403, body: { message: 'not allowed' } },
    })

    await expect(page.getByText(/could not read 2/)).toBeVisible()
  })

  test('says nothing about an album that is in focus', async ({ page }) => {
    await openAlbum(page, {
      photos: [photos[0]],
      objectBytes: { 'owner/album-1/photo-1-thumb.jpg': sharpPng() },
    })

    await expect(page.getByText('Choose a photo to add a caption')).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Photos that look out of focus' }),
    ).toHaveCount(0)
  })

  test('reads on a phone', async ({ page }) => {
    // Every visual fault found so far was found on a phone, so the tiles, the
    // reading and the tick box are measured at that width rather than assumed.
    await page.setViewportSize({ width: 390, height: 844 })
    await openAlbum(page, oneOfEach)

    const section = page.locator('section.soft')
    await expect(section).toBeVisible()

    const box = (await section.boundingBox())!
    expect(box.width).toBeLessThanOrEqual(390)

    const choice = (await page.getByLabel(/Remove photo 2/).boundingBox())!
    expect(choice.height).toBeGreaterThanOrEqual(16)
    expect(choice.x + choice.width).toBeLessThanOrEqual(390)
  })
})
