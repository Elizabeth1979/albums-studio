import { type Page, expect, test } from '@playwright/test'
import { blurredPng, facePng, sharpPng, softPng } from './support/sample-image'
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

/**
 * The size the fixtures are served at.
 *
 * The stored image, not the thumbnail — that is what the album now measures,
 * because a 400px thumbnail is a tenfold reduction of what the camera wrote and
 * blur shrinks along with everything else in it.
 */
const STORED = 800

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
    'owner/album-1/photo-1.jpg': sharpPng(STORED),
    'owner/album-1/photo-2.jpg': blurredPng(STORED),
  },
}

test.describe('finding the people in a photograph', () => {
  test('says who it found, and tells that apart from not being able to look', async ({ page }) => {
    // The one question this round exists to answer, and the only place it can
    // be answered honestly is a browser: the detector is a WebAssembly runtime
    // and a model served from this app's own origin, and nothing below the
    // browser can prove those load, start, and run.
    //
    // Both halves are asserted on purpose. "Found nobody in this photograph"
    // and "the detector never loaded" are different facts, and this feature has
    // been debugged blind three times by letting outcomes like those look the
    // same on screen. A test that only checked the count would pass just as
    // happily with a detector that had never started.
    await openAlbum(page, {
      photos,
      objectBytes: {
        'owner/album-1/photo-1.jpg': facePng(STORED),
        'owner/album-1/photo-2.jpg': sharpPng(STORED),
      },
    })

    const line = page.locator('p.focus-unchecked', { hasText: 'People:' })

    await expect(line).toContainText('found someone in 1 of 2', { timeout: 30_000 })
    await expect(line).toContainText('found nobody in 1')
    await expect(line).not.toContainText('could not run')

    // Displayed and not acted on. Judging the subject rather than the frame is
    // the next piece of work, and until it exists no photograph may be offered
    // or held back on the strength of a face.
    await expect(page.getByRole('heading', { name: 'Photos that look out of focus' })).toBeHidden()
  })

  test('finds a face too small for the whole frame, by looking through tiles', async ({
    page,
  }) => {
    // The reason tiling exists, and the only honest way to prove it: a face
    // spanning a twentieth of the frame is missed outright when the whole
    // photograph is handed to the model, because BlazeFace resizes everything
    // to 128x128 and there is not enough of him left. Cropping to a third of
    // the frame hands the same face over three times larger, and it is found.
    //
    // If this test ever fails, tiling has stopped working — and the whole-frame
    // test above will still pass, which is precisely why this one is separate.
    await openAlbum(page, {
      photos,
      objectBytes: {
        'owner/album-1/photo-1.jpg': facePng(STORED, 0.05),
        'owner/album-1/photo-2.jpg': sharpPng(STORED),
      },
    })

    const line = page.locator('p.focus-unchecked', { hasText: 'People:' })

    await expect(line).toContainText('found someone in 1 of 2', { timeout: 30_000 })
    // And it says how near the floor that was, which is the number that decides
    // whether this approach has any room left in her album.
    await expect(line).toContainText('Smallest face found:')
  })

  test('names the failure when the detector cannot be loaded', async ({ page }) => {
    // The fault that must never look like silence. With the model unreachable
    // every photograph is unjudgeable, and an album that says nothing would be
    // indistinguishable from an album full of landscapes.
    await page.route('**/mediapipe/**', (route) => route.abort())

    await openAlbum(page, {
      photos,
      objectBytes: {
        'owner/album-1/photo-1.jpg': facePng(STORED),
        'owner/album-1/photo-2.jpg': sharpPng(STORED),
      },
    })

    const line = page.locator('p.focus-unchecked', { hasText: 'People:' })

    await expect(line).toContainText('could not run on 2', { timeout: 30_000 })
    await expect(line).toContainText('found someone in 0 of 2')
  })
})

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
        'owner/album-1/photo-1.jpg': sharpPng(STORED),
        'owner/album-1/photo-2.jpg': softPng(STORED),
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
      objectBytes: { 'owner/album-1/photo-1.jpg': sharpPng(STORED) },
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
