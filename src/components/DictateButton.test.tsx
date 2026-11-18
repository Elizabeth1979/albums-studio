import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DictateButton } from './DictateButton'

/** The browser's recognizer, played by a test: it says what the test tells it to. */
class FakeRecognizer {
  static last: FakeRecognizer | null = null
  lang = ''
  continuous = false
  interimResults = false
  onresult: ((event: unknown) => void) | null = null
  onerror: ((event: { error: string }) => void) | null = null
  onend: (() => void) | null = null
  start = vi.fn()
  stop = vi.fn(() => this.onend?.())
  constructor() {
    FakeRecognizer.last = this
  }
  hear(text: string, isFinal: boolean) {
    const result = Object.assign([{ transcript: text }], { isFinal })
    this.onresult?.({ resultIndex: 0, results: Object.assign([result], { length: 1 }) })
  }
}

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition
  FakeRecognizer.last = null
})

function supportSpeech() {
  ;(window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRecognizer
}

describe('DictateButton', () => {
  it('is not offered where the browser cannot turn speech into text', () => {
    const { container } = render(<DictateButton target="the story" onWords={vi.fn()} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('hands over settled words only, and shows the guess while listening', () => {
    supportSpeech()
    const onWords = vi.fn()
    render(<DictateButton target="the story" onWords={onWords} />)

    fireEvent.click(screen.getByRole('button', { name: 'Speak into the story' }))
    expect(FakeRecognizer.last?.start).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Stop speaking into the story' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('status')).toHaveTextContent('Listening')

    act(() => FakeRecognizer.last?.hear('we arrived in', false))
    expect(screen.getByText('we arrived in…')).toBeInTheDocument()
    expect(onWords).not.toHaveBeenCalled()

    act(() => FakeRecognizer.last?.hear('we arrived in the rain', true))
    expect(onWords).toHaveBeenCalledWith('we arrived in the rain')

    fireEvent.click(screen.getByRole('button', { name: 'Stop speaking into the story' }))
    expect(screen.getByRole('button', { name: 'Speak into the story' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByText(/…$/)).not.toBeInTheDocument()
  })

  it('says how to unblock the microphone when it is refused', () => {
    supportSpeech()
    render(<DictateButton target="the story" onWords={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Speak into the story' }))
    act(() => {
      FakeRecognizer.last?.onerror?.({ error: 'not-allowed' })
      FakeRecognizer.last?.onend?.()
    })

    expect(screen.getByRole('alert')).toHaveTextContent(/microphone is blocked/)
  })

  it('stops listening when the box it belongs to goes away', () => {
    supportSpeech()
    const { unmount } = render(<DictateButton target="the story" onWords={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Speak into the story' }))
    const recognizer = FakeRecognizer.last
    unmount()

    expect(recognizer?.stop).toHaveBeenCalled()
  })
})
