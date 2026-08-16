import { type Page, expect, test } from '@playwright/test'
import { type StubOptions, albumRecord, stubSupabase } from './support/supabase-stub'

async function signIn(page: Page, options: StubOptions = {}) {
  const calls = await stubSupabase(page, options)

  await page.goto('/')
  await page.getByLabel('Email', { exact: true }).fill('person@example.com')
  await page.getByLabel('Password', { exact: true }).fill('the-right-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Your albums' })).toBeVisible()

  return calls
}

test.describe('albums', () => {
  test('starts empty and offers to create the first album', async ({ page }) => {
    await signIn(page)

    await expect(page.getByRole('heading', { name: 'No albums yet' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create album' })).toBeVisible()
  })

  test('creates a masonry album and lists it', async ({ page }) => {
    const calls = await signIn(page)

    await page.getByLabel('Album title').fill('Summer by the lake')
    await page.getByRole('button', { name: 'Create album' }).click()

    await expect(page.getByRole('heading', { name: '1 album' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Summer by the lake/ })).toBeVisible()

    const insert = calls.all.find(
      (call) => call.method === 'POST' && call.path.endsWith('/rest/v1/albums'),
    )
    expect(insert?.body).toMatchObject({
      title: 'Summer by the lake',
      slug: 'summer-by-the-lake',
      layout: 'masonry',
    })
  })

  test('creates a grid album when grid is chosen', async ({ page }) => {
    const calls = await signIn(page)

    await page.getByLabel('Album title').fill('School trip')
    await page.getByRole('radio', { name: 'Grid' }).check()
    await page.getByRole('button', { name: 'Create album' }).click()

    await expect(page.getByRole('heading', { name: '1 album' })).toBeVisible()

    const insert = calls.all.find(
      (call) => call.method === 'POST' && call.path.endsWith('/rest/v1/albums'),
    )
    expect(insert?.body).toMatchObject({ layout: 'grid' })
  })

  test('reports a failed creation without listing the album', async ({ page }) => {
    await signIn(page, {
      albumWrite: { status: 403, body: { message: 'permission denied for table albums' } },
    })

    await page.getByLabel('Album title').fill('Summer by the lake')
    await page.getByRole('button', { name: 'Create album' }).click()

    await expect(page.getByRole('alert')).toContainText('permission denied')
    await expect(page.getByRole('heading', { name: 'No albums yet' })).toBeVisible()
  })

  test('opens an album in its layout and returns to the library', async ({ page }) => {
    await signIn(page, { albums: [albumRecord({ layout: 'grid' })] })

    await page.getByRole('button', { name: /Summer by the lake/ }).click()

    await expect(page.getByRole('heading', { name: 'Summer by the lake' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'No photos yet' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Grid' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await page.getByRole('button', { name: '← All albums' }).click()
    await expect(page.getByRole('heading', { name: '1 album' })).toBeVisible()
  })

  test('renames an album and keeps its slug', async ({ page }) => {
    const calls = await signIn(page, { albums: [albumRecord()] })

    await page.getByRole('button', { name: /Summer by the lake/ }).click()
    await page.getByRole('button', { name: 'Rename album' }).click()
    await page.getByLabel('Album title').fill('Lake days')
    await page.getByRole('button', { name: 'Save title' }).click()

    await expect(page.getByRole('heading', { name: 'Lake days' })).toBeVisible()

    const patch = calls.all.find((call) => call.method === 'PATCH')
    expect(patch?.body).toEqual({ title: 'Lake days' })
    expect(calls.albums()[0].slug).toBe('summer-by-the-lake')

    await page.getByRole('button', { name: '← All albums' }).click()
    await expect(page.getByRole('button', { name: /Lake days/ })).toBeVisible()
  })

  test('switches an album between the two layouts', async ({ page }) => {
    const calls = await signIn(page, { albums: [albumRecord()] })

    await page.getByRole('button', { name: /Summer by the lake/ }).click()
    await expect(page.getByRole('button', { name: 'Masonry' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await page.getByRole('button', { name: 'Grid' }).click()

    await expect(page.getByRole('button', { name: 'Grid' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.getByText(/Grid crops to equal tiles/)).toBeVisible()

    const patch = calls.all.find((call) => call.method === 'PATCH')
    expect(patch?.body).toEqual({ layout: 'grid' })
  })

  test('a layout choice survives leaving and reopening the album', async ({ page }) => {
    await signIn(page, { albums: [albumRecord()] })

    await page.getByRole('button', { name: /Summer by the lake/ }).click()
    await page.getByRole('button', { name: 'Grid' }).click()
    await expect(page.getByRole('button', { name: 'Grid' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await page.getByRole('button', { name: '← All albums' }).click()
    await page.getByRole('button', { name: /Summer by the lake/ }).click()

    await expect(page.getByRole('button', { name: 'Grid' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  test('never deletes an album on a single click', async ({ page }) => {
    const calls = await signIn(page, { albums: [albumRecord()] })

    await page.getByRole('button', { name: /Summer by the lake/ }).click()
    await page.getByRole('button', { name: 'Delete album' }).click()

    await expect(page.getByRole('button', { name: 'Yes, delete this album' })).toBeVisible()
    expect(calls.all.some((call) => call.method === 'DELETE')).toBe(false)
    expect(calls.albums()).toHaveLength(1)
  })

  test('deletes an album once confirmed and returns to the library', async ({ page }) => {
    const calls = await signIn(page, { albums: [albumRecord()] })

    await page.getByRole('button', { name: /Summer by the lake/ }).click()
    await page.getByRole('button', { name: 'Delete album' }).click()
    await page.getByRole('button', { name: 'Yes, delete this album' }).click()

    await expect(page.getByRole('heading', { name: 'No albums yet' })).toBeVisible()
    expect(calls.albums()).toHaveLength(0)
  })
})
