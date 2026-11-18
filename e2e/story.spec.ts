import { type Page, expect, test } from '@aee/cli/test'
import { albumRecord, photoRecord, stubSupabase, type StubOptions } from './support/supabase-stub'

const PHOTOS = [
  photoRecord({ id: 'photo-1', sort_order: 0, alt: 'Arriving in the rain' }),
  photoRecord({ id: 'photo-2', sort_order: 1, alt: 'The lake at dawn' }),
  photoRecord({ id: 'photo-3', sort_order: 2, alt: 'Dinner on the last night' }),
]

async function openAlbum(page: Page, options: StubOptions = {}) {
  const calls = await stubSupabase(page, { albums: [albumRecord()], photos: PHOTOS, ...options })

  await page.goto('/')
  await page.getByLabel('Email', { exact: true }).fill('person@example.com')
  await page.getByLabel('Password', { exact: true }).fill('the-right-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('button', { name: /Summer by the lake/ }).click()

  return calls
}

test.describe("an album's story", () => {
  test('is drafted, edited by the owner, and only then put on the album', async ({ page }) => {
    const calls = await openAlbum(page)

    await page.getByRole('button', { name: 'Draft the story with AI' }).click()
    await page.getByLabel(/Anything the story should say/).fill('The rain on day two was the best part.')
    // Leave the dawn photograph out of this story.
    await page.getByRole('checkbox', { name: 'The lake at dawn' }).uncheck()
    await expect(page.getByText('2 of up to 20 chosen.')).toBeVisible()
    await page.getByRole('button', { name: 'Draft the story' }).click()

    const draft = page.getByLabel(/Draft — edit it as you like/)
    await expect(draft).toHaveValue('We arrived in the rain.')
    expect(calls.find('/functions/v1/story-draft')?.body).toMatchObject({
      albumId: 'album-1',
      photoIds: ['photo-1', 'photo-3'],
    })
    // A draft is not a story: nothing has been written to the album yet.
    expect(calls.albums()[0].story ?? null).toBeNull()

    await draft.fill('We arrived in the rain, laughing.')
    await page.getByRole('button', { name: 'Use this story' }).click()

    await expect(page.getByText('We arrived in the rain, laughing.')).toBeVisible()
    expect(calls.albums()[0].story).toBe('We arrived in the rain, laughing.')
    expect(calls.albums()[0].story_draft_id).toBe('draft-1')
    // Recorded after the story is saved, so waited for rather than read at once.
    await expect
      .poll(() => calls.all.find((call) => call.method === 'PATCH' && call.path.endsWith('/rest/v1/ai_drafts'))?.body)
      .toEqual({ status: 'accepted' })
  })

  test("says in the server's words why a draft could not be made", async ({ page }) => {
    await openAlbum(page, {
      storyDraft: { status: 429, body: { error: 'You have used all 5 story drafts for this month.' } },
    })

    await page.getByRole('button', { name: 'Draft the story with AI' }).click()
    await expect(page.getByRole('checkbox')).toHaveCount(3)
    await page.getByRole('button', { name: 'Draft the story' }).click()

    await expect(page.getByRole('alert')).toHaveText('You have used all 5 story drafts for this month.')
  })

  test('reaches a visitor on the share link', async ({ page }) => {
    await stubSupabase(page, {
      shared: {
        'good-token': {
          album: {
            title: 'Summer by the lake',
            description: null,
            layout: 'masonry',
            story: 'We arrived in the rain.\n\nBy Friday nobody wanted to leave.',
          },
          photos: [],
        },
      },
    })
    await page.goto('/shared/good-token')

    await expect(page.getByText('We arrived in the rain.')).toBeVisible()
    await expect(page.getByText('By Friday nobody wanted to leave.')).toBeVisible()
  })
})
