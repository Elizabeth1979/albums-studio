/**
 * What the alt text writer is told about a photograph, besides the picture.
 *
 * Shared by the `alt-draft` Edge Function and its tests, and by the photo
 * editor for the allowance it shows. Plain TypeScript with no imports, so Deno
 * and the browser can both use it.
 *
 * Only text a visitor can already read goes in. Alt text is always given to
 * visitors, whatever the owner chose for the caption, so a hidden caption or a
 * private note sent here could come back out inside a public description. An
 * album story may read private notes because the owner reviews a whole story;
 * a one-line description is exactly where a private name would go unnoticed.
 */

/** Descriptions each owner may ask for in a calendar month, on the platform's key. */
export const ALT_DRAFTS_PER_MONTH = 50

/** The longest alt text the photo editor accepts, and so the longest worth keeping. */
export const ALT_MAX_LENGTH = 1000

type Visibility = 'hidden' | 'visible' | string

export type AltContextInput = {
  album: { title: string; description: string | null }
  photo: { caption: string | null; captionVisibility: Visibility }
  stories: { body: string; visibility: Visibility }[]
}

export function altContext({ album, photo, stories }: AltContextInput): string {
  const visibleNotes = stories
    .filter((story) => story.visibility === 'visible')
    .map((story) => story.body.trim())
    .filter(Boolean)
  const caption =
    photo.captionVisibility === 'visible' && photo.caption?.trim() ? photo.caption.trim() : null

  return [
    `Album: ${album.title}`,
    album.description?.trim() ? `Album description: ${album.description.trim()}` : null,
    // A screen reader reads the description and then the caption under it, so
    // the description should add to the caption rather than say it twice.
    caption ? `Visitors will also hear this caption, shown under the photograph: ${caption}` : null,
    ...visibleNotes.map((note) => `Note shown under the photograph: ${note}`),
  ]
    .filter(Boolean)
    .join('\n')
}
