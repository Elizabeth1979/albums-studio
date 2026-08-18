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

  test('changes the album cover, and the library card follows', async ({ page }) => {
    // The first upload takes the cover by default. This is the owner overruling
    // that, which is the whole point of the control.
    const calls = await stubSupabase(page, { albums: [albumRecord()] })

    await page.goto('/')
    await page.getByLabel('Email', { exact: true }).fill('person@example.com')
    await page.getByLabel('Password', { exact: true }).fill('the-right-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByRole('button', { name: /Summer by the lake/ }).click()

    await page
      .getByLabel('Choose photos')
      .setInputFiles([sampleFile('one.png'), sampleFile('two.png')])
    await expect(page.getByText('Added 2 of 2.')).toBeVisible()

    // Photo 1 took the cover automatically.
    await expect(page.getByRole('button', { name: /^Edit photo 1 .*album cover/ })).toBeVisible()

    await page.getByRole('button', { name: /^Edit photo 2/ }).click()
    await page.getByRole('button', { name: 'Use as album cover' }).click()

    await expect(page.getByRole('button', { name: /^Edit photo 2 .*album cover/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Edit photo 1$/ })).toBeVisible()

    // Derived, not assumed: rows are numbered as uploads land and four run at
    // once, so the second photo in the album is not reliably the second row.
    const second = calls.photos().find((photo) => photo.sort_order === 1)
    expect(calls.albums()[0].cover_photo_id).toBe(second?.id)

    // And the library shows the photo that was chosen, not the first one. The
    // editor is a modal, so it holds the page until it is closed — which is
    // what a modal is for.
    await page.getByRole('button', { name: 'Close' }).click()
    await page.getByRole('button', { name: '← All albums' }).click()

    const cover = page.locator('.album-card img.album-cover')
    await expect(cover).toHaveCount(1)
    await expect(cover).toHaveJSProperty('naturalWidth', 1)
  })

  test('does not offer to re-cover the photo that already is', async ({ page }) => {
    await openPhoto(page)

    await expect(page.getByText('Album cover', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Use as album cover' })).toBeHidden()
  })

  test('reports a refused cover change', async ({ page }) => {
    const calls = await stubSupabase(page, {
      albums: [albumRecord()],
      albumWrite: { status: 403, body: { message: 'violates foreign key constraint' } },
    })

    await page.goto('/')
    await page.getByLabel('Email', { exact: true }).fill('person@example.com')
    await page.getByLabel('Password', { exact: true }).fill('the-right-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByRole('button', { name: /Summer by the lake/ }).click()

    await page.getByLabel('Choose photos').setInputFiles(sampleFile('one.png'))
    await expect(page.getByText('Added 1 of 1.')).toBeVisible()

    // The automatic cover was refused too, and stayed silent — that one was not
    // asked for. This one is.
    expect(calls.albums()[0].cover_photo_id).toBeNull()

    await page.getByRole('button', { name: /^Edit photo 1/ }).click()
    await page.getByRole('button', { name: 'Use as album cover' }).click()

    await expect(page.getByRole('alert')).toContainText('violates foreign key constraint')
  })

  test('reorders photos, and the order survives a reload', async ({ page }) => {
    const calls = await stubSupabase(page, { albums: [albumRecord()] })

    await page.goto('/')
    await page.getByLabel('Email', { exact: true }).fill('person@example.com')
    await page.getByLabel('Password', { exact: true }).fill('the-right-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByRole('button', { name: /Summer by the lake/ }).click()

    await page
      .getByLabel('Choose photos')
      .setInputFiles([sampleFile('one.png'), sampleFile('two.png')])
    await expect(page.getByText('Added 2 of 2.')).toBeVisible()

    const second = calls.photos().find((photo) => photo.sort_order === 1)

    await page.getByRole('button', { name: /^Edit photo 2/ }).click()
    await page.getByRole('button', { name: '← Move earlier' }).click()

    // The photo that was second now holds position zero in the stored rows.
    await expect
      .poll(() => calls.photos().find((photo) => photo.id === second?.id)?.sort_order)
      .toBe(0)

    await page.reload()
    await page.getByRole('button', { name: /^Edit photo 1/ }).click()
    await expect(page.getByRole('button', { name: '← Move earlier' })).toBeDisabled()
  })

  test('removes a photo, its bytes, and its stories', async ({ page }) => {
    const calls = await openPhoto(page)

    await page.getByLabel('Add a story').fill('A long day.')
    await page.getByRole('button', { name: 'Save story' }).click()
    await expect(savedStories(page)).toHaveText(['A long day.'])
    expect(calls.objects()).toHaveLength(2)

    await page.getByRole('button', { name: 'Remove photo' }).click()
    await page.getByRole('button', { name: 'Yes, remove it' }).click()

    await expect(page.getByRole('heading', { name: 'No photos yet' })).toBeVisible()
    expect(calls.photos()).toHaveLength(0)
    expect(calls.objects()).toHaveLength(0)
  })

  test('never removes a photo on a single click', async ({ page }) => {
    const calls = await openPhoto(page)

    await page.getByRole('button', { name: 'Remove photo' }).click()

    expect(calls.photos()).toHaveLength(1)
    await expect(page.getByRole('button', { name: 'Yes, remove it' })).toBeVisible()
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
