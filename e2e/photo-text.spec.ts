import { type Page, expect, test } from '@playwright/test'
import { sampleFile } from './support/sample-image'
import { type StubOptions, albumRecord, stubSupabase } from './support/supabase-stub'

/**
 * The stories that have actually been saved.
 *
 * Not `getByText`: the compose box still holds the same words until the save
 * clears it, so a page-wide text match can pass on the draft alone.
 */
function savedStories(page: Page) {
  return page.locator('.story-body')
}

/** Signs in, opens the album, and puts one photograph in it. */
async function openPhoto(page: Page, options: StubOptions = {}) {
  const calls = await stubSupabase(page, { albums: [albumRecord()], ...options })

  await page.goto('/')
  await page.getByLabel('Email', { exact: true }).fill('person@example.com')
  await page.getByLabel('Password', { exact: true }).fill('the-right-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('button', { name: /Summer by the lake/ }).click()

  await page.getByLabel('Choose photos').setInputFiles(sampleFile())
  await expect(page.getByText('Added 1 of 1.')).toBeVisible()

  await page.getByRole('button', { name: 'Edit photo 1' }).click()
  await expect(
    page.getByRole('heading', { name: 'What do you want to remember?' }),
  ).toBeVisible()

  return calls
}

test.describe('writing about a photo', () => {
  test('saves a caption, its visibility, and alt text', async ({ page }) => {
    const calls = await openPhoto(page)

    await page.getByLabel('Caption').fill('Dinner on the last night')
    await page.getByRole('radio', { name: /Show it under the photo/ }).check()
    await page.getByLabel('Alt text').fill('A long table set for twelve, lit by candles')
    await page.getByRole('button', { name: 'Save', exact: true }).click()

    await expect(page.getByText('Saved.')).toBeVisible()

    const photo = calls.photos()[0]
    expect(photo.caption).toBe('Dinner on the last night')
    expect(photo.caption_visibility).toBe('visible')
    expect(photo.alt).toBe('A long table set for twelve, lit by candles')

    // Phase 5 will draft alt text. A human's wording has to stay recognisable
    // so a suggestion never quietly replaces it.
    expect(photo.alt_source).toBe('human')
  })

  test('keeps a caption to the owner unless they say otherwise', async ({ page }) => {
    const calls = await openPhoto(page)

    await page.getByLabel('Caption').fill('Ask Mum who the man on the left is')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Saved.')).toBeVisible()

    expect(calls.photos()[0].caption_visibility).toBe('hidden')
  })

  test('survives a reload', async ({ page }) => {
    // The point of writing any of this down.
    await openPhoto(page)

    await page.getByLabel('Caption').fill('Dinner on the last night')
    await page.getByLabel('Alt text').fill('A long table set for twelve')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Saved.')).toBeVisible()

    await page.reload()

    await page
      .getByRole('button', { name: 'Edit photo 1: A long table set for twelve' })
      .click()
    await expect(page.getByLabel('Caption')).toHaveValue('Dinner on the last night')
    await expect(page.getByLabel('Alt text')).toHaveValue('A long table set for twelve')
  })

  test('writes and keeps a story note', async ({ page }) => {
    const calls = await openPhoto(page)

    await page
      .getByLabel('Add a story')
      .fill('We had been walking since six and nobody wanted to admit they were tired.')
    await page.getByRole('radio', { name: 'Anyone I share the album with' }).check()
    await page.getByRole('button', { name: 'Save story' }).click()

    await expect(page.getByText('Shown with the album')).toBeVisible()
    expect(calls.stories()).toHaveLength(1)
    expect(calls.stories()[0].visibility).toBe('visible')

    await page.reload()
    await page.getByRole('button', { name: 'Edit photo 1' }).click()
    await expect(savedStories(page)).toHaveText([/nobody wanted to admit/])
  })

  test('holds several stories on one photo', async ({ page }) => {
    const calls = await openPhoto(page)

    await page.getByLabel('Add a story').fill('The first thing that happened.')
    await page.getByRole('button', { name: 'Save story' }).click()
    await expect(savedStories(page)).toHaveText(['The first thing that happened.'])

    await page.getByLabel('Add another story').fill('And then the second.')
    await page.getByRole('button', { name: 'Save story' }).click()
    await expect(savedStories(page)).toHaveText([
      'The first thing that happened.',
      'And then the second.',
    ])

    expect(calls.stories()).toHaveLength(2)
  })

  test('publishes a story without rewriting it', async ({ page }) => {
    const calls = await openPhoto(page)

    await page.getByLabel('Add a story').fill('A long day.')
    await page.getByRole('button', { name: 'Save story' }).click()
    await expect(page.getByText('Kept to yourself')).toBeVisible()

    await page.getByRole('button', { name: 'Show with album' }).click()

    await expect(page.getByText('Shown with the album')).toBeVisible()
    expect(calls.stories()[0].body).toBe('A long day.')
    expect(calls.stories()[0].visibility).toBe('visible')
  })

  test('deletes a story only after confirming', async ({ page }) => {
    const calls = await openPhoto(page)

    await page.getByLabel('Add a story').fill('A long day.')
    await page.getByRole('button', { name: 'Save story' }).click()
    await expect(savedStories(page)).toHaveText(['A long day.'])

    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    expect(calls.stories()).toHaveLength(1)

    await page.getByRole('button', { name: 'Delete for good' }).click()
    await expect(savedStories(page)).toHaveCount(0)
    expect(calls.stories()).toHaveLength(0)
  })

  test('marks which photos have been written about', async ({ page }) => {
    await openPhoto(page)

    await page.getByLabel('Caption').fill('Dinner on the last night')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Saved.')).toBeVisible()

    await expect(page.locator('.photo-written')).toHaveCount(1)
  })

  test('writes in the page typeface, not the browser default', async ({ page }) => {
    // A textarea defaults to monospace, and the reset only covered button and
    // input. Every earlier textarea had worked around it one rule at a time, so
    // the first one that did not looked like a code editor.
    await openPhoto(page)

    const body = await page.evaluate(() => getComputedStyle(document.body).fontFamily)

    for (const field of ['Caption', 'Alt text', 'Add a story']) {
      expect(
        await page.getByLabel(field).evaluate((el) => getComputedStyle(el).fontFamily),
      ).toBe(body)
    }
  })

  test('keeps each radio beside its own label', async ({ page }) => {
    // The label rule for the editor's fields also matched the labels around the
    // radios, which stacked every control above its text and centred it.
    await openPhoto(page)

    const option = page
      .locator('.visibility-option')
      .filter({ hasText: 'Keep it to myself' })

    const radio = (await option.locator('input[type="radio"]').boundingBox())!
    const text = (await option.locator('span').first().boundingBox())!

    expect(radio).not.toBeNull()
    expect(text).not.toBeNull()

    // Beside, not above. Stacking put the control in the same column as its
    // text, so the horizontal check is what actually distinguishes the two.
    expect(radio.x + radio.width).toBeLessThanOrEqual(text.x + 1)

    // And on the same line: the control's box has to overlap the text's, not
    // sit finished above it.
    expect(radio.y).toBeLessThan(text.y + text.height)
    expect(radio.y + radio.height).toBeGreaterThan(text.y)
  })

  test('reports a refused save and keeps the words on screen', async ({ page }) => {
    await openPhoto(page, {
      photoUpdate: { status: 403, body: { message: 'permission denied for column caption' } },
    })

    await page.getByLabel('Caption').fill('Dinner on the last night')
    await page.getByRole('button', { name: 'Save', exact: true }).click()

    await expect(page.getByRole('alert')).toContainText('permission denied')
    await expect(page.getByLabel('Caption')).toHaveValue('Dinner on the last night')
  })
})
