import { expect, test } from '@playwright/test'
import { albumRecord, stubSupabase } from './support/supabase-stub'

/** Roughly a Galaxy S-class phone in CSS pixels. */
const PHONE = { width: 412, height: 915 }

test.use({ viewport: PHONE })

test.describe('phone layout', () => {
  test('the create form fields stay a sensible height', async ({ page }) => {
    // `flex: 1 1 18rem` sets a comfortable field *width* while the form is a
    // row. Once it stacks on a phone, flex-basis measures height instead and
    // the title field grew to 18rem tall.
    await stubSupabase(page, { albums: [] })
    await page.goto('/')
    await page.getByLabel('Email', { exact: true }).fill('person@example.com')
    await page.getByLabel('Password', { exact: true }).fill('the-right-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('heading', { name: 'Your albums' })).toBeVisible()
    await page.getByRole('button', { name: 'Start your first album' }).click()

    const title = await page.getByLabel('Album title').boundingBox()
    expect(title).not.toBeNull()
    expect(title!.height).toBeLessThan(80)

    const description = await page.getByLabel(/^Description/).boundingBox()
    expect(description).not.toBeNull()
    expect(description!.height).toBeLessThan(160)
  })

  test('an album is on screen without scrolling', async ({ page }) => {
    // The create form used to sit open above the list and ran to about one and
    // a half screens, so arriving at your own library showed you a form and no
    // albums. The list is what this page is for.
    await stubSupabase(page, { albums: [albumRecord()] })
    await page.goto('/')
    await page.getByLabel('Email', { exact: true }).fill('person@example.com')
    await page.getByLabel('Password', { exact: true }).fill('the-right-password')
    await page.getByRole('button', { name: 'Sign in' }).click()

    const card = page.getByRole('button', { name: /Summer by the lake/ })
    await expect(card).toBeVisible()

    // From the top of the page, not from wherever focus may have scrolled it:
    // boundingBox is viewport-relative, so measuring after a scroll would call
    // anything visible "above the fold".
    await page.evaluate(() => window.scrollTo(0, 0))
    expect(await page.evaluate(() => window.scrollY)).toBe(0)

    const box = await card.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.y).toBeLessThan(PHONE.height)
  })

  test('nothing overflows the viewport sideways', async ({ page }) => {
    await stubSupabase(page, { albums: [albumRecord()] })
    await page.goto('/')
    await page.getByLabel('Email', { exact: true }).fill('person@example.com')
    await page.getByLabel('Password', { exact: true }).fill('the-right-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('heading', { name: 'Your albums' })).toBeVisible()

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('an album can be created from a phone', async ({ page }) => {
    const calls = await stubSupabase(page, { albums: [] })
    await page.goto('/')
    await page.getByLabel('Email', { exact: true }).fill('person@example.com')
    await page.getByLabel('Password', { exact: true }).fill('the-right-password')
    await page.getByRole('button', { name: 'Sign in' }).click()

    await page.getByRole('button', { name: 'Start your first album' }).click()
    await page.getByLabel('Album title').fill('Eilat')
    await page.getByLabel(/^Description/).fill('Red sea, October')
    await page.getByRole('button', { name: 'Create album' }).click()

    await expect(page.getByRole('heading', { name: '1 album' })).toBeVisible()

    const insert = calls.all.find(
      (call) => call.method === 'POST' && call.path.endsWith('/rest/v1/albums'),
    )
    expect(insert?.body).toMatchObject({
      title: 'Eilat',
      slug: 'eilat',
      description: 'Red sea, October',
    })
  })

  test('the album page fits a phone', async ({ page }) => {
    await stubSupabase(page, { albums: [albumRecord()] })
    await page.goto('/')
    await page.getByLabel('Email', { exact: true }).fill('person@example.com')
    await page.getByLabel('Password', { exact: true }).fill('the-right-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByRole('button', { name: /Summer by the lake/ }).click()
    await expect(page.getByRole('heading', { name: 'No photos yet' })).toBeVisible()

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
