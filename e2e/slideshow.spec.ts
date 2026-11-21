import { type Page, expect, test } from '@aee/cli/test'
import { albumRecord, photoRecord, stubSupabase } from './support/supabase-stub'

const STORY = 'We drove up on the Friday and it rained the whole way.'

const SHARED = {
  'good-token': {
    album: {
      title: 'Summer by the lake',
      description: 'A week by the water',
      layout: 'masonry' as const,
      story: STORY,
    },
    photos: [1, 2, 3].map((n) => ({
      id: `photo-${n}`,
      caption: n === 1 ? 'Dinner on the last night' : null,
      alt: `Photograph number ${n}`,
      sortOrder: n - 1,
      thumbnailUrl: `/thumb-${n}.png`,
      fullUrl: `/full-${n}.png`,
      stories: n === 1 ? ['A note under the first photograph.'] : [],
    })),
  },
}

async function openShared(page: Page) {
  await stubSupabase(page, { shared: SHARED })
  await page.goto('/shared/good-token')
  await expect(page.getByRole('heading', { name: 'Summer by the lake' })).toBeVisible()
}

test.describe('a visitor plays the album as a slideshow', () => {
  test('opens on the story, then the photographs in order, and needs no account', async ({ page }) => {
    await openShared(page)
    await page.getByRole('button', { name: 'Play slideshow' }).click()

    const show = page.getByRole('dialog')
    await expect(show).toContainText(STORY)

    // The pause control is where focus lands, so it is the first thing a
    // keyboard or screen-reader user meets (WCAG 2.2.2).
    await expect(show.getByRole('button', { name: 'Pause slideshow' })).toBeFocused()

    await page.keyboard.press('ArrowRight')
    await expect(show).toContainText('1 of 3')
    await expect(show.getByRole('img', { name: 'Photograph number 1' })).toHaveAttribute(
      'src',
      '/full-1.png',
    )
    await expect(show).toContainText('Dinner on the last night')
    await expect(show).not.toContainText('A note under the first photograph.')
  })

  test('moves on by itself, and Space pauses it', async ({ page }) => {
    await page.clock.install()
    await openShared(page)
    await page.getByRole('button', { name: 'Play slideshow' }).click()
    const show = page.getByRole('dialog')
    await page.keyboard.press('ArrowRight')
    await expect(show).toContainText('1 of 3')

    await page.clock.runFor(5_000)
    await expect(show).toContainText('2 of 3')

    // Focus is on the pause button; Space there presses it, as on any button.
    await page.keyboard.press('Space')
    await expect(show.getByRole('button', { name: 'Play slideshow' })).toBeVisible()
    await page.clock.runFor(15_000)
    await expect(show).toContainText('2 of 3')
  })

  test('starts paused when the device asks for reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.clock.install()
    await openShared(page)
    await page.getByRole('button', { name: 'Play slideshow' }).click()

    const show = page.getByRole('dialog')
    await expect(show.getByRole('button', { name: 'Play slideshow' })).toBeVisible()
    // The opening slide's album title is a heading, not a large paragraph (WCAG 1.3.1).
    await expect(show.getByRole('heading', { name: SHARED['good-token'].album.title })).toBeVisible()
    await page.clock.runFor(60_000)
    await expect(show).toContainText(STORY)
  })

  test('closes on Escape and gives focus back to Play slideshow', async ({ page }) => {
    await openShared(page)
    const opener = page.getByRole('button', { name: 'Play slideshow' })
    await opener.click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(opener).toBeFocused()
  })

  test('closes on its own button too', async ({ page }) => {
    await openShared(page)
    await page.getByRole('button', { name: 'Play slideshow' }).click()
    await page.getByRole('button', { name: 'Close slideshow' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
  })
})

test.describe('the owner plays her album as a slideshow', () => {
  test('shows published captions and keeps hidden ones off the screen', async ({ page }) => {
    await stubSupabase(page, {
      albums: [albumRecord({ story: STORY })],
      photos: [
        photoRecord({ id: 'photo-1', alt: 'The jetty', caption: 'Out on the jetty', caption_visibility: 'visible' }),
        photoRecord({
          id: 'photo-2',
          storage_path: 'owner/album-1/photo-2.jpg',
          thumbnail_path: 'owner/album-1/photo-2-thumb.jpg',
          alt: 'The boat',
          caption: 'Only for me',
          caption_visibility: 'hidden',
          sort_order: 1,
        }),
      ],
    })
    await page.goto('/')
    await page.getByLabel('Email', { exact: true }).fill('person@example.com')
    await page.getByLabel('Password', { exact: true }).fill('the-right-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByRole('button', { name: /Summer by the lake/ }).click()

    const opener = page.getByRole('button', { name: 'Play slideshow' })
    await opener.click()
    const show = page.getByRole('dialog')
    await expect(show).toHaveAccessibleName('Summer by the lake')
    await expect(show).toContainText(STORY)

    await page.keyboard.press('ArrowRight')
    await expect(show.getByRole('img', { name: 'The jetty' })).toHaveAttribute(
      'src',
      /photo-1\.jpg/,
    )
    await expect(show).toContainText('Out on the jetty')

    await page.keyboard.press('ArrowRight')
    await expect(show.getByRole('img', { name: 'The boat' })).toBeVisible()
    await expect(show).not.toContainText('Only for me')

    await page.keyboard.press('Escape')
    await expect(opener).toBeFocused()
  })
})

test.describe('choosing which photographs play', () => {
  const PHOTOS = [
    photoRecord({ id: 'photo-1', alt: 'The jetty' }),
    photoRecord({
      id: 'photo-2',
      storage_path: 'owner/album-1/photo-2.jpg',
      thumbnail_path: 'owner/album-1/photo-2-thumb.jpg',
      alt: 'The boat',
      sort_order: 1,
    }),
    photoRecord({
      id: 'photo-3',
      storage_path: 'owner/album-1/photo-3.jpg',
      thumbnail_path: 'owner/album-1/photo-3-thumb.jpg',
      alt: 'The pier',
      sort_order: 2,
    }),
  ]

  async function openOwnerAlbum(page: Page, options = {}) {
    const calls = await stubSupabase(page, { albums: [albumRecord()], photos: PHOTOS, ...options })
    await page.goto('/')
    await page.getByLabel('Email', { exact: true }).fill('person@example.com')
    await page.getByLabel('Password', { exact: true }).fill('the-right-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByRole('button', { name: /Summer by the lake/ }).click()
    await page.getByText(/Choose which photos play/).click()
    return calls
  }

  test('a photo the owner leaves out is saved, and the slideshow skips it', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const calls = await openOwnerAlbum(page)

    await expect(page.getByText('Choose which photos play (3 of 3)')).toBeVisible()
    await page.getByRole('checkbox', { name: 'Plays photo 2: The boat' }).uncheck()
    await expect(page.getByText('Choose which photos play (2 of 3)')).toBeVisible()
    await expect.poll(() => calls.photos().find((row) => row.id === 'photo-2')?.in_slideshow).toBe(false)

    await page.getByRole('button', { name: 'Play slideshow' }).click()
    const show = page.getByRole('dialog')
    await expect(show).toContainText('1 of 2')
    await page.keyboard.press('ArrowRight')
    await expect(show.getByRole('img', { name: 'The pier' })).toBeVisible()
  })

  test('play all and leave all out each save in one go', async ({ page }) => {
    const calls = await openOwnerAlbum(page)

    await page.getByRole('button', { name: 'Leave all out' }).click()
    await expect(page.getByText('Choose which photos play (0 of 3)')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Play slideshow' })).toHaveCount(0)
    await expect.poll(() => calls.photos().every((row) => row.in_slideshow === false)).toBe(true)

    await page.getByRole('button', { name: 'Play all' }).click()
    await expect(page.getByText('Choose which photos play (3 of 3)')).toBeVisible()
    await expect.poll(() => calls.photos().every((row) => row.in_slideshow === true)).toBe(true)
  })

  test('a refused save puts the box back and says why', async ({ page }) => {
    await openOwnerAlbum(page, {
      photoUpdate: { status: 403, body: { message: 'permission denied for table photos' } },
    })

    const box = page.getByRole('checkbox', { name: 'Plays photo 2: The boat' })
    await box.uncheck({ force: true })
    await expect(page.getByRole('alert')).toContainText('permission denied')
    await expect(box).toBeChecked()
  })

  test('a visitor’s slideshow plays only what the owner chose', async ({ page }) => {
    const shared = {
      'good-token': {
        ...SHARED['good-token'],
        photos: SHARED['good-token'].photos.map((photo, index) => ({
          ...photo,
          inSlideshow: index !== 1,
        })),
      },
    }
    await stubSupabase(page, { shared })
    await page.goto('/shared/good-token')

    // Left out of the slideshow is not left out of the album.
    await expect(page.getByRole('img', { name: 'Photograph number 2' })).toBeVisible()

    await page.getByRole('button', { name: 'Play slideshow' }).click()
    const show = page.getByRole('dialog')
    await page.keyboard.press('ArrowRight')
    await expect(show).toContainText('1 of 2')
    await page.keyboard.press('ArrowRight')
    await expect(show.getByRole('img', { name: 'Photograph number 3' })).toBeVisible()
  })
})
