import AxeBuilder from '@axe-core/playwright'
import { type Page, expect, test } from '@aee/cli/test'
import { type StubOptions, albumRecord, photoRecord, stubSupabase } from './support/supabase-stub'

/** What `search_library` returns: one row per piece of text that matched. */
const ROWS = [
  {
    album_id: 'album-1',
    album_slug: 'summer-by-the-lake',
    album_title: 'Summer by the lake',
    photo_id: 'photo-2',
    thumbnail_path: 'owner/album-1/photo-2-thumb.jpg',
    field: 'caption',
    matched_text: 'Grandma Ruth with the יום הולדת cake',
  },
  {
    album_id: 'album-1',
    album_slug: 'summer-by-the-lake',
    album_title: 'Summer by the lake',
    photo_id: 'photo-2',
    thumbnail_path: 'owner/album-1/photo-2-thumb.jpg',
    field: 'story_note',
    matched_text: 'Who lit the candles?\nUncle Avi lit the cake candles.',
  },
  {
    album_id: 'album-1',
    album_slug: 'summer-by-the-lake',
    album_title: 'Summer by the lake',
    photo_id: 'photo-1',
    thumbnail_path: 'owner/album-1/photo-1-thumb.jpg',
    field: 'album_story',
    matched_text: 'The week ended with cake by the water.',
  },
]

async function signIn(page: Page, options: StubOptions = {}) {
  const calls = await stubSupabase(page, {
    albums: [albumRecord({ cover_photo_id: 'photo-1' })],
    photos: [
      photoRecord({ id: 'photo-1', sort_order: 0 }),
      photoRecord({
        id: 'photo-2',
        storage_path: 'owner/album-1/photo-2.jpg',
        thumbnail_path: 'owner/album-1/photo-2-thumb.jpg',
        caption: 'Grandma Ruth with the יום הולדת cake',
        sort_order: 1,
      }),
    ],
    search: { status: 200, body: ROWS },
    ...options,
  })

  await page.goto('/')
  await page.getByLabel('Email', { exact: true }).fill('person@example.com')
  await page.getByLabel('Password', { exact: true }).fill('the-right-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Your albums' })).toBeVisible()

  return calls
}

async function search(page: Page, text: string) {
  await page.getByRole('searchbox', { name: 'Search your words' }).fill(text)
  await page.getByRole('button', { name: 'Search', exact: true }).click()
}

test.describe('searching the library', () => {
  test('finds a photo by her words and opens it in its album', async ({ page }) => {
    const calls = await signIn(page)

    await search(page, 'הולדת')

    // Announced, not only drawn: the list appears below the fold on a phone.
    await expect(page.locator('.library-search').getByRole('status')).toContainText('2 results for “הולדת”.')
    expect(calls.find('/rest/v1/rpc/search_library')?.body).toEqual({ search_text: 'הולדת' })

    const results = page.getByRole('list', { name: 'Results for הולדת' })
    const photo = results.getByRole('button', { name: /Photo in Summer by the lake/ })
    await expect(photo).toContainText('Caption: Grandma Ruth with the יום הולדת cake')
    await expect(photo).toContainText('Story note: Who lit the candles? Uncle Avi')
    await expect(photo.locator('mark').first()).toHaveText('הולדת')
    await expect(photo.locator('img')).toHaveAttribute('src', /photo-2-thumb/)
    await expect(results.getByRole('button', { name: /Album: Summer by the lake/ })).toBeVisible()

    await photo.click()

    await expect(page).toHaveURL(/\/albums\/summer-by-the-lake\?photo=photo-2$/)
    await expect(
      page.getByRole('heading', { name: 'What do you want to remember?' }),
    ).toBeVisible()
    await expect(page.getByLabel('Caption')).toHaveValue('Grandma Ruth with the יום הולדת cake')
  })

  test('an album match opens the album with no photo chosen', async ({ page }) => {
    await signIn(page)
    await search(page, 'cake')

    await page.getByRole('button', { name: /Album: Summer by the lake/ }).click()

    await expect(page).toHaveURL(/\/albums\/summer-by-the-lake$/)
    await expect(page.getByRole('heading', { name: 'Summer by the lake' })).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'What do you want to remember?' }),
    ).toBeHidden()
  })

  test('says so when nothing matches', async ({ page }) => {
    await signIn(page, { search: { status: 200, body: [] } })
    await search(page, 'zebra')

    await expect(page.locator('.library-search').getByRole('status')).toContainText(
      'Nothing you have written matches “zebra”.',
    )
  })

  test('a search that failed never looks like one that found nothing', async ({ page }) => {
    await signIn(page, { search: { status: 500, body: { message: 'database unavailable' } } })
    await search(page, 'zebra')

    await expect(page.getByRole('alert')).toContainText('The search did not run')
    await expect(page.getByText(/Nothing you have written/)).toBeHidden()
  })

  test('the library with search results passes WCAG 2.1 AA', async ({ page }) => {
    await signIn(page)
    await search(page, 'cake')
    await expect(page.getByRole('list', { name: 'Results for cake' })).toBeVisible()

    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(violations.map((violation) => violation.id)).toEqual([])
  })
})
