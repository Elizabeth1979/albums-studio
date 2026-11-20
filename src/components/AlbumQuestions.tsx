import { useEffect, useState } from 'react'
import {
  type PhotoQuestion,
  QUESTION_PHOTO_LIMIT,
  QUESTIONS_PER_REQUEST,
  answerNote,
  askForQuestions,
  listOpenQuestions,
  settleQuestion,
  withoutWords,
} from '../lib/albumQuestions'
import { joinDictated } from '../lib/dictation'
import type { Photo } from '../lib/photos'
import type { Story } from '../lib/stories'
import { DictateButton } from './DictateButton'
import { LiveStatus } from './LiveStatus'

type AlbumQuestionsProps = {
  albumId: string
  photos: Photo[]
  /** Signed URLs by storage path, as the album holds them. */
  thumbnails: Map<string, string>
  stories: Story[]
  /** Saves an answer as a private note on its photograph. */
  onAnswer: (photoId: string, note: string) => Promise<void>
}

const ANSWER_LIMIT = 5000

/**
 * The studio asks about photographs nobody has written about yet.
 *
 * How many have no words is counted here, from what the album already holds, so
 * it costs nothing and is always shown. Questions are asked only when the owner
 * asks for them, and each one is answered — kept as a private note on its
 * photograph, question and answer together — or set aside. Nobody else is ever
 * contacted: a question may say who might know, and that is all.
 */
export function AlbumQuestions({ albumId, photos, thumbnails, stories, onAnswer }: AlbumQuestionsProps) {
  const [questions, setQuestions] = useState<PhotoQuestion[]>([])
  const [asking, setAsking] = useState(false)
  const [answering, setAnswering] = useState<string | null>(null)
  const [answer, setAnswer] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('')

  useEffect(() => {
    let active = true
    listOpenQuestions(albumId)
      .then((open) => {
        if (active) setQuestions(open)
      })
      // Waiting questions failing to load hides them; it does not stop the album.
      .catch(() => {})
    return () => {
      active = false
    }
  }, [albumId])

  const noted = new Set(stories.map((story) => story.photoId))
  const silent = withoutWords(photos, noted)
  const position = new Map(photos.map((photo, index) => [photo.id, index + 1]))
  // A question about a photograph that has since gone is not shown.
  const shown = questions.filter((question) => position.has(question.photoId))

  if (photos.length === 0) return null

  async function ask() {
    setAsking(true)
    setError(null)
    setStatus('Looking at your photos for questions to ask. This takes up to a minute.')
    try {
      const result = await askForQuestions(albumId)
      setQuestions((current) => [...current, ...result.questions])
      setStatus(
        result.questions.length === 0
          ? 'Every photo either has words already or a question waiting.'
          : `${result.questions.length} new ${result.questions.length === 1 ? 'question' : 'questions'}. ${result.used} of ${result.limit} requests used this month.`,
      )
    } catch (caught) {
      setStatus('')
      setError(caught instanceof Error ? caught.message : 'No questions could be asked.')
    } finally {
      setAsking(false)
    }
  }

  async function saveAnswer(question: PhotoQuestion) {
    setSaving(true)
    setError(null)
    try {
      await onAnswer(question.photoId, answerNote(question.question, answer))
      await settleQuestion(question.id, 'answered')
      setQuestions((current) => current.filter((one) => one.id !== question.id))
      setAnswering(null)
      setAnswer('')
      setStatus('Answer kept as a private note on the photo.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The answer could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function dismiss(question: PhotoQuestion) {
    setError(null)
    try {
      await settleQuestion(question.id, 'dismissed')
      setQuestions((current) => current.filter((one) => one.id !== question.id))
      setStatus('Question set aside.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The question could not be set aside.')
    }
  }

  return (
    <section className="album-questions" aria-labelledby="questions-title">
      <h2 id="questions-title">Questions about your photos</h2>
      <LiveStatus>{status}</LiveStatus>

      <p className="album-note">
        {silent.length === 0
          ? 'Every photo has something written about it.'
          : silent.length === 1
            ? `1 of ${photos.length} photos has nothing written about it yet.`
            : `${silent.length} of ${photos.length} photos have nothing written about them yet.`}
      </p>

      {shown.length > 0 && (
        <ul className="question-list">
          {shown.map((question) => {
            const number = position.get(question.photoId) ?? 0
            const photo = photos[number - 1]
            const url = photo?.thumbnailPath ? thumbnails.get(photo.thumbnailPath) : undefined
            const isAnswering = answering === question.id
            return (
              <li className="question" key={question.id}>
                {url ? (
                  <img src={url} alt={photo?.alt ?? `Photo ${number}`} />
                ) : (
                  <span className="question-photo-missing">Photo {number}</span>
                )}
                <div className="question-body">
                  <p className="question-text">{question.question}</p>
                  {question.reason && <p className="field-hint">{question.reason}</p>}

                  {isAnswering ? (
                    <form
                      className="rename-form"
                      onSubmit={(event) => {
                        event.preventDefault()
                        void saveAnswer(question)
                      }}
                    >
                      <label htmlFor={`answer-${question.id}`}>
                        <span>Your answer</span>
                        <textarea
                          id={`answer-${question.id}`}
                          value={answer}
                          onChange={(event) => setAnswer(event.target.value)}
                          maxLength={ANSWER_LIMIT}
                          rows={3}
                          autoFocus
                        />
                      </label>
                      <DictateButton
                        target="your answer"
                        onWords={(words) => setAnswer((current) => joinDictated(current, words).slice(0, ANSWER_LIMIT))}
                        disabled={saving}
                      />
                      <div className="rename-actions">
                        <button className="primary-button" type="submit" disabled={saving || !answer.trim()}>
                          {saving ? 'Saving…' : 'Save answer'}
                        </button>
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => {
                            setAnswering(null)
                            setAnswer('')
                          }}
                          disabled={saving}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="question-actions">
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => {
                          setAnswering(question.id)
                          setAnswer('')
                        }}
                        aria-label={`Answer: ${question.question}`}
                      >
                        Answer
                      </button>
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => void dismiss(question)}
                        aria-label={`Set aside: ${question.question}`}
                      >
                        Set aside
                      </button>
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {silent.length > 0 && (
        <>
          <button className="secondary-button" type="button" onClick={() => void ask()} disabled={asking}>
            {asking ? 'Looking…' : 'Suggest questions with AI'}
          </button>
          <p className="field-hint">
            Looks at up to {QUESTION_PHOTO_LIMIT} photos with nothing written about them and asks you up
            to {QUESTIONS_PER_REQUEST} questions. Answers are kept as private notes. Nobody else is
            contacted.
          </p>
        </>
      )}

      {error && (
        <p className="form-message error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
