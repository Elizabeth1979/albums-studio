import { type Page, expect, test } from '@aee/cli/test'
import { albumRecord, photoRecord, stubSupabase, type StubOptions } from './support/supabase-stub'

const THIS_MONTH = new Date().toISOString().slice(0, 7)

function aiCall(overrides: object = {}) {
  return {
    id: 'call-1',
    feature: 'album_story',
    album_id: 'album-1',
    outcome: 'ok',
    model: 'claude-sonnet-5-5',
    served_model: 'claude-sonnet-5-5',
    items: 20,
    input_tokens: 23_106,
    cache_write_tokens: 0,
    cache_read_tokens: 0,
    output_tokens: 464,
    // PostgREST sends `numeric` as a string.
    cost_usd: '0.050852',
    price_list: 'anthropic-2026-11-03',
    duration_ms: 18_000,
    created_at: `${THIS_MONTH}-02T10:00:00Z`,
    ...overrides,
  }
}

async function signIn(page: Page, options: StubOptions = {}) {
  const calls = await stubSupabase(page, {
    albums: [albumRecord()],
    photos: [photoRecord({ id: 'photo-1', alt: 'Arriving in the rain' })],
    ...options,
  })

  await page.goto('/')
  await page.getByLabel('Email', { exact: true }).fill('person@example.com')
  await page.getByLabel('Password', { exact: true }).fill('the-right-password')
  await page.getByRole('button', { name: 'Sign in' }).click()

  return calls
}

const panel = (page: Page) => page.getByRole('complementary', { name: 'AI costs' })

test.describe('the AI cost panel', () => {
  test('shows each paid feature with its total, its averages and its log', async ({ page }) => {
    await signIn(page, {
      aiCalls: [
        aiCall({ id: 'call-2', outcome: 'declined', cost_usd: '0.049148', items: 20, created_at: `${THIS_MONTH}-03T09:00:00Z` }),
        aiCall(),
      ],
    })

    const toggle = page.getByRole('button', { name: 'AI costs' })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')

    const story = panel(page).getByRole('region', { name: 'Album story' })
    // Two calls for ten cents: five a story, a quarter of a cent a photograph.
    await expect(story.getByRole('definition').nth(0)).toHaveText('2')
    await expect(story.getByRole('definition').nth(1)).toHaveText('$0.10')
    await expect(story.getByRole('definition').nth(2)).toHaveText('$0.05')
    await expect(story.getByRole('definition').nth(3)).toHaveText('$0.0025')
    await expect(story.getByText(/Includes 1 declined and 0 failed/)).toBeVisible()

    const log = story.getByRole('listitem')
    await expect(log).toHaveCount(2)
    await expect(log.first()).toContainText('Declined · Summer by the lake · 20 photos · 23,106 tokens in, 464 out')
    await expect(log.last()).toContainText('$0.0509')

    // Each paid feature has its own section, used or not, so they can be priced apart.
    await expect(
      panel(page).getByRole('region', { name: 'Questions about your photos' }).getByText('Not used yet.'),
    ).toBeVisible()

    // Free features are named as free, so they can be weighed as well.
    await expect(panel(page).getByRole('region', { name: 'No charge per use' })).toContainText('Blurry photos')

    // It sits beside the page, never over it: the first version hid Sign out on a laptop.
    await page.getByRole('button', { name: 'Sign out' }).click({ trial: true, timeout: 2_000 })

    // Escape closes it and puts focus back where it came from.
    await panel(page).getByRole('button', { name: 'Refresh' }).focus()
    await page.keyboard.press('Escape')
    await expect(panel(page)).toHaveCount(0)
    await expect(toggle).toBeFocused()
  })

  test("adds a story's cost to the log while the panel is open", async ({ page }) => {
    await signIn(page, { aiCallOnDraft: aiCall({ id: 'call-new' }) })

    await page.getByRole('button', { name: 'AI costs' }).click()
    const story = panel(page).getByRole('region', { name: 'Album story' })
    await expect(story.getByText('Not used yet.')).toBeVisible()

    await page.getByRole('button', { name: /Summer by the lake/ }).click()
    await page.getByRole('button', { name: 'Draft the story with AI' }).click()
    await page.getByRole('button', { name: 'Draft the story' }).click()
    await expect(page.getByLabel(/Draft — edit it as you like/)).toHaveValue('We arrived in the rain.')

    await expect(story.getByRole('listitem')).toHaveCount(1)
    await expect(story.getByRole('listitem')).toContainText('$0.0509')
  })

  test('says when the log cannot be read, rather than showing an empty one', async ({ page }) => {
    await signIn(page, { aiCallsRead: { status: 500, body: { message: 'the database is down' } } })

    await page.getByRole('button', { name: 'AI costs' }).click()

    await expect(panel(page).getByRole('alert')).toContainText('The cost log could not be read: the database is down')
    await expect(panel(page).getByText('Not used yet.')).toHaveCount(0)
  })

  test('keeps a call with no known price out of the money, and says so', async ({ page }) => {
    await signIn(page, { aiCalls: [aiCall(), aiCall({ id: 'call-2', cost_usd: null, served_model: 'claude-new-model' })] })

    await page.getByRole('button', { name: 'AI costs' }).click()
    const story = panel(page).getByRole('region', { name: 'Album story' })

    await expect(story.getByRole('definition').nth(1)).toHaveText('$0.0509')
    await expect(story.getByText(/1 call used a model with no price on file/)).toBeVisible()
    await expect(story.getByRole('listitem').last()).toContainText('No price')
  })
})
