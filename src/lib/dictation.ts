/**
 * Speaking instead of typing, through the browser's own speech recognition.
 *
 * Voice and text are equal ways in. This uses what Chrome, Edge and Safari
 * already provide (the Web Speech API) rather than a model of our own: it costs
 * nothing, needs no key, and keeps no recording. The browser does send the audio
 * to its maker (Google, Apple) to turn it into text, which the interface says
 * beside the button. Firefox has no speech recognition, so there the button is
 * not offered and the keyboard's own microphone remains.
 *
 * The browser API is untyped in TypeScript's DOM library, so the part used here
 * is described below rather than assumed.
 */

type SpeechAlternative = { transcript: string }
type SpeechResult = { isFinal: boolean; length: number; [index: number]: SpeechAlternative }
type SpeechResultList = { length: number; [index: number]: SpeechResult }

export type SpeechEvent = { resultIndex: number; results: SpeechResultList }

type Recognizer = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: SpeechEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

type RecognizerConstructor = new () => Recognizer

function recognizerConstructor(): RecognizerConstructor | null {
  if (typeof window === 'undefined') return null
  const scope = window as unknown as {
    SpeechRecognition?: RecognizerConstructor
    webkitSpeechRecognition?: RecognizerConstructor
  }
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null
}

/** Whether this browser can turn speech into text at all. */
export function dictationSupported(): boolean {
  return recognizerConstructor() !== null
}

/**
 * Splits one recognition event into what is settled and what is still a guess.
 *
 * Settled text arrives once and is kept; the guess is rewritten as the speaker
 * goes on, so it is shown but never stored.
 */
export function readSpeech(event: SpeechEvent): { settled: string; guess: string } {
  let settled = ''
  let guess = ''
  for (let index = event.resultIndex; index < event.results.length; index += 1) {
    const result = event.results[index]
    const text = result[0]?.transcript ?? ''
    if (result.isFinal) settled += text
    else guess += text
  }
  return { settled: settled.trim(), guess: guess.trim() }
}

/**
 * Adds spoken words to what is already in the box, as a person would type them.
 *
 * One space between, none doubled, and a capital letter where a new sentence
 * starts: recognition hands back "and then it rained" whatever came before it.
 */
export function joinDictated(existing: string, spoken: string): string {
  const words = spoken.trim()
  if (!words) return existing
  const before = existing.replace(/\s+$/, '')
  if (!before) return words.charAt(0).toUpperCase() + words.slice(1)
  const startsSentence = /[.!?]$/.test(before)
  const next = startsSentence ? words.charAt(0).toUpperCase() + words.slice(1) : words
  return `${before} ${next}`
}

/** What went wrong, in words the person can act on. */
export function dictationProblem(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'The microphone is blocked for this site. Allow it in your browser settings, then try again.'
    case 'audio-capture':
      return 'No microphone was found.'
    case 'network':
      return 'Speech could not be turned into text: your browser needs an internet connection for this.'
    case 'no-speech':
      return 'Nothing was heard. Try again, a little closer to the microphone.'
    case 'aborted':
      return ''
    default:
      return 'Speech could not be turned into text. Try again, or type instead.'
  }
}

/**
 * Starts listening. Settled words go to `onWords`, the running guess to
 * `onGuess`, and `onStop` says it has finished, with a problem if there was one.
 * Returns a function that stops it.
 *
 * Created when the person asks, never ahead of time: a recognizer built at mount
 * would ask for the microphone before anyone wanted it.
 */
export function startDictation(handlers: {
  onWords: (text: string) => void
  onGuess: (text: string) => void
  onStop: (problem: string) => void
}): () => void {
  const Recognition = recognizerConstructor()
  if (!Recognition) {
    handlers.onStop('This browser cannot turn speech into text. Your keyboard’s microphone may work instead.')
    return () => {}
  }

  const recognizer = new Recognition()
  recognizer.lang = navigator.language || 'en-US'
  recognizer.continuous = true
  recognizer.interimResults = true

  let problem = ''
  recognizer.onresult = (event) => {
    const { settled, guess } = readSpeech(event)
    if (settled) handlers.onWords(settled)
    handlers.onGuess(guess)
  }
  recognizer.onerror = (event) => {
    problem = dictationProblem(event.error)
  }
  recognizer.onend = () => {
    handlers.onGuess('')
    handlers.onStop(problem)
  }

  try {
    recognizer.start()
  } catch {
    handlers.onStop(dictationProblem('unknown'))
    return () => {}
  }

  return () => recognizer.stop()
}
