import { describe, expect, it } from 'vitest'
import { type SpeechEvent, dictationProblem, joinDictated, readSpeech } from './dictation'

function event(resultIndex: number, results: [string, boolean][]): SpeechEvent {
  const list = results.map(([transcript, isFinal]) => Object.assign([{ transcript }], { isFinal }))
  return { resultIndex, results: Object.assign(list, { length: list.length }) } as unknown as SpeechEvent
}

describe('readSpeech', () => {
  it('keeps settled words apart from the guess still being rewritten', () => {
    expect(readSpeech(event(0, [['we arrived in the rain', true], [' and the', false]]))).toEqual({
      settled: 'we arrived in the rain',
      guess: 'and the',
    })
  })

  it('reads only what is new in this event, not what was settled before it', () => {
    const later = event(1, [['we arrived in the rain', true], [' and the kids laughed', true]])
    expect(readSpeech(later).settled).toBe('and the kids laughed')
  })
})

describe('joinDictated', () => {
  it('starts an empty box with a capital', () => {
    expect(joinDictated('', 'we arrived in the rain')).toBe('We arrived in the rain')
  })

  it('carries on a sentence with one space and no capital', () => {
    expect(joinDictated('We arrived in the rain', 'and the kids laughed')).toBe(
      'We arrived in the rain and the kids laughed',
    )
  })

  it('starts a new sentence after a full stop, without doubling spaces', () => {
    expect(joinDictated('We arrived in the rain.  ', 'the next day was clear')).toBe(
      'We arrived in the rain. The next day was clear',
    )
  })

  it('leaves the box alone when nothing was said', () => {
    expect(joinDictated('As it was', '   ')).toBe('As it was')
  })
})

describe('dictationProblem', () => {
  it('tells someone how to fix a blocked microphone', () => {
    expect(dictationProblem('not-allowed')).toMatch(/Allow it in your browser settings/)
  })

  it('says nothing when listening was simply stopped', () => {
    expect(dictationProblem('aborted')).toBe('')
  })

  it('never shows a raw error code', () => {
    expect(dictationProblem('bad-grammar')).not.toMatch(/bad-grammar/)
  })
})
