import { type Page, expect, test } from '@playwright/test'
import { sampleFile } from './support/sample-image'
import { albumRecord, stubSupabase } from './support/supabase-stub'

async function openAlbum(page: Page, options = {}) {
  const calls = await stubSupabase(page, { albums: [albumRecord()], ...options })

  await page.goto('/')
  await page.getByLabel('Email', { exact: true }).fill('person@example.com')
  await page.getByLabel('Password', { exact: true }).fill('the-right-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('button', { name: /Summer by the lake/ }).click()

  return calls
}

test.describe('sharing an album', () => {
  test('starts private, with no link anywhere on the page', async ({ page }) => {
    await openAlbum(page)

    await expect(page.getByRole('radio', { name: /Only me/ })).toBeChecked()
    await expect(page.getByLabel('The link', { exact: true })).toBeHidden()
  })

  test('produces a link once sharing is turned on', async ({ page }) => {
    const calls = await openAlbum(page)

    // Clicked rather than `.check()`: the control is fully controlled by the
    // album's stored visibility, so it only moves once the save comes back.
    await page.getByRole('radio', { name: /Anyone with the link/ }).click()

    await expect(page.getByLabel('The link', { exact: true })).toHaveValue(
      /\/shared\/token-for-the-album$/,
    )
    expect(calls.albums()[0].visibility).toBe('link')
  })

  test('turning sharing off is recorded immediately', async ({ page }) => {
    const calls = await openAlbum(page, { albums: [albumRecord({ visibility: 'link' })] })

    await page.getByRole('radio', { name: /Only me/ }).click()

    await expect(page.getByLabel('The link', { exact: true })).toBeHidden()
    expect(calls.albums()[0].visibility).toBe('private')
  })

  test('replaces the link only after confirming', async ({ page }) => {
    await openAlbum(page, { albums: [albumRecord({ visibility: 'link' })] })
    await expect(page.getByLabel('The link', { exact: true })).toHaveValue(/token-for-the-album$/)

    await page.getByRole('button', { name: 'Replace this link' }).click()
    await expect(page.getByLabel('The link', { exact: true })).toHaveValue(/token-for-the-album$/)

    await page.getByRole('button', { name: 'Replace the link' }).click()
    await expect(page.getByLabel('The link', { exact: true })).toHaveValue(/token-after-1-rotations$/)
  })
})

test.describe('opening a shared album as a visitor', () => {
  const SHARED = {
    'good-token': {
      album: {
        title: 'Summer by the lake',
        description: 'A week by the water',
        layout: 'masonry' as const,
      },
      photos: [
        {
          id: 'photo-1',
          caption: 'Dinner on the last night',
          alt: 'A long table set for twelve',
          sortOrder: 0,
          thumbnailUrl: '/shared-pixel.png',
          fullUrl: '/shared-full.png',
          stories: ['We had been walking since six.'],
        },
      ],
    },
  }

  test('needs no account at all', async ({ page }) => {
    // The whole point. A visitor arriving cold must never meet a sign-in form.
    await stubSupabase(page, { shared: SHARED })

    await page.goto('/shared/good-token')

    await expect(page.getByRole('heading', { name: 'Summer by the lake' })).toBeVisible()
    await expect(page.getByLabel('Email', { exact: true })).toBeHidden()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeHidden()
  })

  test('shows the published caption, story and alt text', async ({ page }) => {
    await stubSupabase(page, { shared: SHARED })

    await page.goto('/shared/good-token')

    await expect(page.getByText('Dinner on the last night')).toBeVisible()
    await expect(page.getByText('We had been walking since six.')).toBeVisible()
    await expect(page.getByRole('img', { name: 'A long table set for twelve' })).toBeVisible()
  })

  test('offers a visitor nothing to change', async ({ page }) => {
    await stubSupabase(page, { shared: SHARED })

    await page.goto('/shared/good-token')
    await expect(page.getByRole('heading', { name: 'Summer by the lake' })).toBeVisible()

    expect(await page.getByRole('button').count()).toBe(0)
    expect(await page.getByRole('textbox').count()).toBe(0)
  })

  test('shows the full photograph, not the thumbnail stretched', async ({ page }) => {
    // A thumbnail is 400px on its longest edge. A phone filling its width with
    // one upscales it about three times, which is what a visitor reported: the
    // album loaded, and every photograph in it was soft.
    await stubSupabase(page, { shared: SHARED })

    await page.goto('/shared/good-token')

    const image = page.getByRole('img', { name: 'A long table set for twelve' })
    await expect(image).toHaveAttribute('src', '/shared-full.png')
    await expect(image).toHaveAttribute('srcset', /shared-full\.png 2000w/)
    await expect(image).toHaveAttribute('srcset', /shared-pixel\.png 400w/)
  })

  test('lays the album out the way its owner chose', async ({ page }) => {
    // The owner picks masonry or grid for their own gallery. A visitor was
    // shown a single column regardless, which is not the album that was shared.
    await stubSupabase(page, {
      shared: {
        'good-token': {
          ...SHARED['good-token'],
          album: { ...SHARED['good-token'].album, layout: 'grid' as const },
        },
      },
    })

    await page.goto('/shared/good-token')
    await expect(page.getByRole('heading', { name: 'Summer by the lake' })).toBeVisible()

    await expect(page.locator('ul.shared-photos')).toHaveClass(/layout-grid/)
  })

  test('still shows a photograph when only the thumbnail could be signed', async ({ page }) => {
    await stubSupabase(page, {
      shared: {
        'good-token': {
          ...SHARED['good-token'],
          photos: [{ ...SHARED['good-token'].photos[0], fullUrl: null }],
        },
      },
    })

    await page.goto('/shared/good-token')

    const image = page.getByRole('img', { name: 'A long table set for twelve' })
    await expect(image).toHaveAttribute('src', '/shared-pixel.png')
  })

  test('says the same thing for a wrong link as a withdrawn one', async ({ page }) => {
    // Distinguishing them would turn a share link into a way to probe for
    // albums that exist.
    await stubSupabase(page, { shared: SHARED })

    await page.goto('/shared/never-existed')

    await expect(
      page.getByRole('heading', { name: 'This album is not available.' }),
    ).toBeVisible()
  })
})
