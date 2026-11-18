import { useEffect, useRef, useState } from 'react'
import { dictationSupported, startDictation } from '../lib/dictation'
import { LiveStatus } from './LiveStatus'

type DictateButtonProps = {
  /** Called with each stretch of settled words, to add to the box it belongs to. */
  onWords: (text: string) => void
  /** What is being spoken into, for the button's accessible name. */
  target: string
  disabled?: boolean
}

/**
 * A "Speak" button beside a box someone writes in. What they say lands in the
 * box as text, where they can correct it like anything they typed.
 *
 * Not offered where the browser cannot do it, rather than offered and failing.
 */
export function DictateButton({ onWords, target, disabled = false }: DictateButtonProps) {
  const [listening, setListening] = useState(false)
  const [guess, setGuess] = useState('')
  const [problem, setProblem] = useState('')
  const stop = useRef<(() => void) | null>(null)

  // Stop listening if the box goes away mid-sentence.
  useEffect(() => () => stop.current?.(), [])

  if (!dictationSupported()) return null

  function toggle() {
    if (listening) {
      stop.current?.()
      return
    }
    setProblem('')
    setListening(true)
    stop.current = startDictation({
      onWords,
      onGuess: setGuess,
      onStop: (found) => {
        setListening(false)
        setGuess('')
        setProblem(found)
        stop.current = null
      },
    })
  }

  return (
    <div className="dictate">
      <button
        className="secondary-button dictate-button"
        type="button"
        aria-pressed={listening}
        aria-label={listening ? `Stop speaking into ${target}` : `Speak into ${target}`}
        onClick={toggle}
        disabled={disabled}
      >
        {listening ? 'Stop' : 'Speak'}
      </button>
      <LiveStatus>{listening ? 'Listening. Speak now.' : ''}</LiveStatus>
      {listening && guess && (
        <p className="dictate-guess" aria-hidden="true">
          {guess}…
        </p>
      )}
      <p className="field-hint dictate-note">
        Your browser turns speech into text, through Google in Chrome or Apple in Safari. Nothing is
        recorded.
      </p>
      {problem && (
        <p className="form-message error" role="alert">
          {problem}
        </p>
      )}
    </div>
  )
}
