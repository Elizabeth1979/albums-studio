import AxeBuilder from '@axe-core/playwright'
import { type Page, expect, test } from '@playwright/test'
import { sampleFile } from './support/sample-image'
import { albumRecord, recoveryUrl, stubSupabase } from './support/supabase-stub'

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

/**
 * Reports the rule and the offending markup rather than a bare count, so a
 * failure says what to fix without reopening the browser.
 */
async function expectNoViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze()

  expect(
    violations.map((violation) => ({
      rule: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.map((node) => node.html),
    })),
  ).toEqual([])
}

async function signIn(page: Page, albums = [albumRecord()]) {
  await stubSupabase(page, { albums })
  await page.goto('/')
  await page.getByLabel('Email', { exact: true }).fill('person@example.com')
  await page.getByLabel('Password', { exact: true }).fill('the-right-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Your albums' })).toBeVisible()
}

test.describe('accessibility', () => {
  test('sign-in form', async ({ page }) => {
    await stubSupabase(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()

    await expectNoViolations(page)
  })

  test('create-account form', async ({ page }) => {
    await stubSupabase(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Show account creation form' }).click()
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()

    await expectNoViolations(page)
  })

  test('sign-in form showing an error', async ({ page }) => {
    await stubSupabase(page, {
      passwordGrant: {
        status: 400,
        body: { error: 'invalid_grant', error_description: 'Invalid login credentials' },
      },
    })
    await page.goto('/')
    await page.getByLabel('Email', { exact: true }).fill('person@example.com')
    await page.getByLabel('Password', { exact: true }).fill('the-wrong-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('alert')).toBeVisible()

    await expectNoViolations(page)
  })

  test('set a new password', async ({ page }) => {
    await stubSupabase(page)
    await page.goto(recoveryUrl())
    await expect(page.getByRole('heading', { name: 'Set a new password' })).toBeVisible()

    await expectNoViolations(page)
  })

  test('empty library', async ({ page }) => {
    await signIn(page, [])
    await expect(page.getByRole('heading', { name: 'No albums yet' })).toBeVisible()

    await expectNoViolations(page)
  })

  test('library listing albums', async ({ page }) => {
    await signIn(page, [
      albumRecord(),
      albumRecord({ id: 'album-2', title: 'School trip', slug: 'school-trip', layout: 'grid' }),
    ])
    await expect(page.getByRole('heading', { name: '2 albums' })).toBeVisible()

    await expectNoViolations(page)
  })

  test('album page in masonry', async ({ page }) => {
    await signIn(page)
    await page.getByRole('button', { name: /Summer by the lake/ }).click()
    await expect(page.getByRole('heading', { name: 'No photos yet' })).toBeVisible()

    await expectNoViolations(page)
  })

  test('album page in grid, mid-edit', async ({ page }) => {
    await signIn(page, [albumRecord({ layout: 'grid', description: 'A week by the water' })])
    await page.getByRole('button', { name: /Summer by the lake/ }).click()
    await page.getByRole('button', { name: 'Rename album' }).click()
    await expect(page.getByLabel('Album title')).toBeVisible()

    await expectNoViolations(page)
  })

  test('album page awaiting delete confirmation', async ({ page }) => {
    await signIn(page)
    await page.getByRole('button', { name: /Summer by the lake/ }).click()
    await page.getByRole('button', { name: 'Delete album' }).click()
    await expect(page.getByRole('button', { name: 'Yes, delete this album' })).toBeVisible()

    await expectNoViolations(page)
  })

  test('album page with photos in it', async ({ page }) => {
    await signIn(page)
    await page.getByRole('button', { name: /Summer by the lake/ }).click()
    await page.getByLabel('Choose photos').setInputFiles([
      sampleFile('one.png'),
      sampleFile('two.png'),
    ])
    await expect(page.getByText('Added 2 of 2.')).toBeVisible()

    await expectNoViolations(page)
  })

  test('photo editor, empty', async ({ page }) => {
    await signIn(page)
    await page.getByRole('button', { name: /Summer by the lake/ }).click()
    await page.getByLabel('Choose photos').setInputFiles(sampleFile('one.png'))
    await expect(page.getByText('Added 1 of 1.')).toBeVisible()

    await page.getByRole('button', { name: 'Edit photo 1' }).click()
    await expect(page.getByLabel('Caption')).toBeVisible()

    await expectNoViolations(page)
  })

  test('photo editor holding a story', async ({ page }) => {
    // The written state is a different page: radio groups, a list of notes, and
    // the delete confirmation all appear only once there is something to show.
    await signIn(page)
    await page.getByRole('button', { name: /Summer by the lake/ }).click()
    await page.getByLabel('Choose photos').setInputFiles(sampleFile('one.png'))
    await expect(page.getByText('Added 1 of 1.')).toBeVisible()

    await page.getByRole('button', { name: 'Edit photo 1' }).click()
    await page.getByLabel('Caption').fill('Dinner on the last night')
    await page.getByLabel('Alt text').fill('A long table set for twelve')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Saved.')).toBeVisible()

    await page.getByLabel('Add a story').fill('We had been walking since six.')
    await page.getByRole('button', { name: 'Save story' }).click()
    await expect(page.getByText('Kept to yourself')).toBeVisible()

    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Delete for good' })).toBeVisible()

    await expectNoViolations(page)
  })

  test('album page reporting a failed upload', async ({ page }) => {
    await stubSupabase(page, {
      albums: [albumRecord()],
      photoWrite: { status: 403, body: { message: 'permission denied for table photos' } },
    })
    await page.goto('/')
    await page.getByLabel('Email', { exact: true }).fill('person@example.com')
    await page.getByLabel('Password', { exact: true }).fill('the-right-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByRole('button', { name: /Summer by the lake/ }).click()
    await page.getByLabel('Choose photos').setInputFiles(sampleFile('one.png'))
    await expect(page.getByRole('alert')).toContainText('could not be added', {
      timeout: 15000,
    })

    await expectNoViolations(page)
  })

  test('unknown album address', async ({ page }) => {
    await signIn(page)
    await page.goto('/albums/never-existed')
    await expect(page.getByRole('heading', { name: 'Album not found' })).toBeVisible()

    await expectNoViolations(page)
  })
})
