import { type Page, expect, test } from '@playwright/test'
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

const sharpAndSoft = [
  photoRecord({ id: 'photo-1', sort_order: 0, sharpness: 900 }),
  photoRecord({
    id: 'photo-2',
    storage_path: 'owner/album-1/photo-2.jpg',
    thumbnail_path: 'owner/album-1/photo-2-thumb.jpg',
    sort_order: 1,
    sharpness: 4,
  }),
]

test.describe('photos that are out of focus', () => {
  test('offers a blurred photograph that no near-duplicate group would catch', async ({
    page,
  }) => {
    await openAlbum(page, { photos: sharpAndSoft })

    await expect(page.getByRole('heading', { name: 'Photos that look out of focus' })).toBeVisible()
    await expect(page.locator('section.soft .similar-sharpness')).toHaveText('Out of focus')

    // Two deliberate acts, and the row is gone from the database only after the
    // second one.
    await page.getByLabel(/Remove photo 2/).check()
    await page.getByRole('button', { name: 'Remove 1 ticked photo' }).click()
    await page.getByRole('button', { name: 'Yes, remove 1 blurred photo' }).click()

    await expect(page.getByRole('heading', { name: '1 photo' })).toBeVisible()
  })

  test('says nothing about an album that is in focus', async ({ page }) => {
    await openAlbum(page, { photos: [photoRecord({ sharpness: 900 })] })

    await expect(page.getByText('Choose a photo to add a caption')).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Photos that look out of focus' }),
    ).toHaveCount(0)
  })

  test('reads on a phone', async ({ page }) => {
    // Every visual fault found so far was found on a phone, so the tiles, the
    // reading and the tick box are measured at that width rather than assumed.
    await page.setViewportSize({ width: 390, height: 844 })
    await openAlbum(page, { photos: sharpAndSoft })

    const section = page.locator('section.soft')
    await expect(section).toBeVisible()

    const box = (await section.boundingBox())!
    expect(box.width).toBeLessThanOrEqual(390)

    const choice = (await page.getByLabel(/Remove photo 2/).boundingBox())!
    // Comfortably tappable rather than a hairline check box.
    expect(choice.height).toBeGreaterThanOrEqual(16)
    expect(choice.x + choice.width).toBeLessThanOrEqual(390)
  })
})
