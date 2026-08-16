import { expect, test } from '@playwright/test'
import { recoveryUrl, stubSupabase } from './support/supabase-stub'

test.describe('sign-in', () => {
  test('reveals and re-hides the password', async ({ page }) => {
    await stubSupabase(page)
    await page.goto('/')

    const password = page.getByLabel('Password', { exact: true })
    await expect(password).toHaveAttribute('type', 'password')

    await page.getByRole('button', { name: 'Show password' }).click()
    await expect(password).toHaveAttribute('type', 'text')

    await page.getByRole('button', { name: 'Hide password' }).click()
    await expect(password).toHaveAttribute('type', 'password')
  })

  test('keeps a revealed password readable while typing', async ({ page }) => {
    await stubSupabase(page)
    await page.goto('/')

    await page.getByRole('button', { name: 'Show password' }).click()
    await page.getByLabel('Password', { exact: true }).fill('a-visible-password')

    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('a-visible-password')
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text')
  })

  test('reports rejected credentials without leaving the form', async ({ page }) => {
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

    await expect(page.getByRole('alert')).toContainText('Invalid login credentials')
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  })

  test('opens the library on a successful sign-in', async ({ page }) => {
    await stubSupabase(page)
    await page.goto('/')

    await page.getByLabel('Email', { exact: true }).fill('person@example.com')
    await page.getByLabel('Password', { exact: true }).fill('the-right-password')
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page.getByRole('heading', { name: 'Your albums' })).toBeVisible()
  })
})

test.describe('password reset', () => {
  test('requests a reset link that returns to this origin', async ({ page }) => {
    const calls = await stubSupabase(page)
    await page.goto('/')

    await page.getByLabel('Email', { exact: true }).fill('person@example.com')
    await page.getByRole('button', { name: 'Forgot password?' }).click()

    await expect(page.getByRole('status')).toContainText('If that address has an account')

    const recover = calls.find('/auth/v1/recover')
    expect(recover?.body).toMatchObject({ email: 'person@example.com' })
  })

  test('does not disclose whether an address has an account', async ({ page }) => {
    await stubSupabase(page)
    await page.goto('/')

    await page.getByLabel('Email', { exact: true }).fill('nobody@example.com')
    await page.getByRole('button', { name: 'Forgot password?' }).click()

    const status = page.getByRole('status')
    await expect(status).toContainText('If that address has an account')
    await expect(status).not.toContainText('nobody@example.com')
  })

  test('refuses to send without an email address', async ({ page }) => {
    const calls = await stubSupabase(page)
    await page.goto('/')

    await page.getByRole('button', { name: 'Forgot password?' }).click()

    await expect(page.getByRole('alert')).toContainText('Enter your email first.')
    expect(calls.find('/auth/v1/recover')).toBeUndefined()
  })

  test('sets a new password from a recovery link', async ({ page }) => {
    const calls = await stubSupabase(page)
    await page.goto(recoveryUrl())

    await expect(page.getByRole('heading', { name: 'Set a new password' })).toBeVisible()

    await page.getByRole('button', { name: 'Show new password' }).click()
    await page.getByLabel('New password', { exact: true }).fill('a-freshly-chosen-password')
    await expect(page.getByLabel('New password', { exact: true })).toHaveAttribute('type', 'text')

    await page.getByRole('button', { name: 'Save password' }).click()

    await expect(page.getByRole('heading', { name: 'Your albums' })).toBeVisible()

    const update = calls.all.find(
      (call) => call.method === 'PUT' && call.path.endsWith('/auth/v1/user'),
    )
    expect(update?.body).toMatchObject({ password: 'a-freshly-chosen-password' })
  })

  test('a recovery link cannot skip straight into the library', async ({ page }) => {
    await stubSupabase(page)
    await page.goto(recoveryUrl())

    await expect(page.getByRole('heading', { name: 'Set a new password' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Your albums' })).toBeHidden()
  })

  test('cancelling recovery returns to sign-in', async ({ page }) => {
    await stubSupabase(page)
    await page.goto(recoveryUrl())

    await expect(page.getByRole('heading', { name: 'Set a new password' })).toBeVisible()
    await page.getByRole('button', { name: 'Cancel and sign out' }).click()

    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  })
})

test.describe('magic link', () => {
  test('explains a rate-limited request in its own words', async ({ page }) => {
    // Supabase throttles auth email per address, so asking for a magic link
    // just after a reset link is refused. Its own wording names no cause.
    await stubSupabase(page, {
      emailSend: {
        status: 429,
        body: {
          message: 'For security purposes, you can only request this after 53 seconds.',
          code: 'over_email_send_rate_limit',
        },
      },
    })
    await page.goto('/')

    await page.getByLabel('Email', { exact: true }).fill('person@example.com')
    await page.getByRole('button', { name: 'Email me a magic link' }).click()

    await expect(page.getByRole('alert')).toContainText('Too many sign-in emails at once')
    await expect(page.getByRole('alert')).toContainText('about 53 seconds')
  })

  test('never creates an account from a magic link request', async ({ page }) => {
    const calls = await stubSupabase(page)
    await page.goto('/')

    await page.getByLabel('Email', { exact: true }).fill('person@example.com')
    await page.getByRole('button', { name: 'Email me a magic link' }).click()

    await expect(page.getByRole('status')).toContainText('one-time sign-in link')

    const otp = calls.find('/auth/v1/otp')
    expect(otp?.body).toMatchObject({ email: 'person@example.com', create_user: false })
  })
})
