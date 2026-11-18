/**
 * The studio's questions about photographs nobody has written about yet.
 *
 * Shared by the `album-questions` Edge Function and the album page, so the
 * count the owner sees and the photographs the server asks about are decided by
 * the same rule. Plain TypeScript with no imports, so Deno and the browser can
 * both use it.
 */

/** The most photographs one request looks at. */
export const QUESTION_PHOTO_LIMIT = 12

/** The most questions one request asks. Few enough to answer in one sitting. */
export const QUESTIONS_PER_REQUEST = 5

/** The longest question or reason kept; the database holds the same line. */
export const QUESTION_TEXT_LIMIT = 500

/**
 * Photographs with no words at all: no caption, and no note of any kind.
 *
 * Alt text does not count. It describes what is visible for someone who cannot
 * see it, which is exactly what a question here is not asking about.
 */
export function withoutWords<T extends { id: string; caption: string | null }>(
  photos: readonly T[],
  notedPhotoIds: ReadonlySet<string>,
): T[] {
  return photos.filter((photo) => !photo.caption?.trim() && !notedPhotoIds.has(photo.id))
}

/** What the model is asked to return: one entry per question, by photograph number. */
export const QUESTIONS_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          photo: { type: 'integer' },
          question: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['photo', 'question', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['questions'],
  additionalProperties: false,
} as const

export type Question = { photo: number; question: string; reason: string | null }

/**
 * Reads the model's answer, keeping only what can be saved as it stands.
 *
 * A question for a photograph that was not shown, a blank one, or a second one
 * for the same photograph is dropped rather than repaired, and anything past
 * the limit is cut. Text that does not parse yields nothing at all.
 */
export function readQuestions(text: string, photoCount: number): Question[] {
  // Without a schema a reply can arrive wrapped ("Here you are: {...}"), so read
  // from the first brace to the last.
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < start) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    return []
  }

  const entries = (parsed as { questions?: unknown })?.questions
  if (!Array.isArray(entries)) return []

  const seen = new Set<number>()
  const kept: Question[] = []
  for (const entry of entries) {
    const { photo, question, reason } = (entry ?? {}) as Record<string, unknown>
    if (typeof photo !== 'number' || !Number.isInteger(photo) || photo < 1 || photo > photoCount) continue
    if (seen.has(photo)) continue
    if (typeof question !== 'string' || !question.trim()) continue

    seen.add(photo)
    const why = typeof reason === 'string' ? reason.trim() : ''
    kept.push({
      photo,
      question: question.trim().slice(0, QUESTION_TEXT_LIMIT),
      reason: why ? why.slice(0, QUESTION_TEXT_LIMIT) : null,
    })
    if (kept.length === QUESTIONS_PER_REQUEST) break
  }
  return kept
}

/** How an answered question is kept on its photograph: the question, then the answer. */
export function answerNote(question: string, answer: string): string {
  return `${question.trim()}\n${answer.trim()}`
}
