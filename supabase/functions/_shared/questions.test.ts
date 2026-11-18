import { describe, expect, it } from 'vitest'
import { QUESTIONS_PER_REQUEST, answerNote, readQuestions, withoutWords } from './questions'

describe('withoutWords', () => {
  const photos = [
    { id: 'a', caption: null },
    { id: 'b', caption: 'Dinner on the last night' },
    { id: 'c', caption: '   ' },
    { id: 'd', caption: null },
  ]

  it('finds photographs with neither a caption nor a note', () => {
    expect(withoutWords(photos, new Set(['d'])).map((photo) => photo.id)).toEqual(['a', 'c'])
  })

  it('counts a caption of only spaces as no caption', () => {
    expect(withoutWords(photos, new Set()).map((photo) => photo.id)).toContain('c')
  })
})

describe('readQuestions', () => {
  const answer = (questions: unknown[]) => JSON.stringify({ questions })

  it('keeps questions as asked, with an empty reason read as none', () => {
    expect(
      readQuestions(
        answer([
          { photo: 1, question: ' Who carved the pumpkins? ', reason: 'Your sister might know.' },
          { photo: 2, question: 'Where was this trail?', reason: '' },
        ]),
        3,
      ),
    ).toEqual([
      { photo: 1, question: 'Who carved the pumpkins?', reason: 'Your sister might know.' },
      { photo: 2, question: 'Where was this trail?', reason: null },
    ])
  })

  it('drops questions about photographs that were not shown, blank ones, and repeats', () => {
    const kept = readQuestions(
      answer([
        { photo: 0, question: 'Before the first?', reason: '' },
        { photo: 4, question: 'Past the last?', reason: '' },
        { photo: 2.5, question: 'Half a photo?', reason: '' },
        { photo: 1, question: '   ', reason: '' },
        { photo: 2, question: 'Who is holding the dog?', reason: '' },
        { photo: 2, question: 'And again?', reason: '' },
      ]),
      3,
    )
    expect(kept.map((one) => one.question)).toEqual(['Who is holding the dog?'])
  })

  it('stops at the limit', () => {
    const many = Array.from({ length: 9 }, (_, index) => ({ photo: index + 1, question: `Q${index}`, reason: '' }))
    expect(readQuestions(answer(many), 12)).toHaveLength(QUESTIONS_PER_REQUEST)
  })

  it('reads an answer wrapped in other words', () => {
    const wrapped = '```json\n' + answer([{ photo: 1, question: 'Who baked this?', reason: '' }]) + '\n```'
    expect(readQuestions(wrapped, 1).map((one) => one.question)).toEqual(['Who baked this?'])
  })

  it('yields nothing for an answer that is not the agreed shape', () => {
    expect(readQuestions('Here are some questions!', 3)).toEqual([])
    expect(readQuestions(JSON.stringify({ items: [] }), 3)).toEqual([])
  })
})

describe('answerNote', () => {
  it('keeps the question with its answer, so the note still makes sense later', () => {
    expect(answerNote('Who carved the pumpkins? ', ' My sister did.')).toBe(
      'Who carved the pumpkins?\nMy sister did.',
    )
  })
})
