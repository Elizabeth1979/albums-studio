import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Photo } from '../lib/photos'
import type { Story } from '../lib/stories'
import { AlbumQuestions } from './AlbumQuestions'

const { listOpenQuestions, askForQuestions, settleQuestion } = vi.hoisted(() => ({
  listOpenQuestions: vi.fn(),
  askForQuestions: vi.fn(),
  settleQuestion: vi.fn(),
}))

// The counting rule and the note's shape are the real ones: they are under test.
vi.mock('../lib/albumQuestions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/albumQuestions')>()),
  listOpenQuestions,
  askForQuestions,
  settleQuestion,
}))

function photo(id: string, caption: string | null = null): Photo {
  return {
    id,
    storagePath: `owner/a/${id}.jpg`,
    thumbnailPath: `owner/a/${id}-thumb.jpg`,
    displayPath: null,
    originalPath: null,
    width: 2000,
    height: 1500,
    caption,
    captionVisibility: 'hidden',
    alt: null,
    sortOrder: 0,
    phash: null,
    sharpness: null,
    takenAt: null,
    inSlideshow: true,
  }
}

function story(photoId: string): Story {
  return { id: `story-${photoId}`, photoId, body: 'Something', visibility: 'hidden', createdAt: '2026-11-18T10:00:00Z' } as Story
}

const PHOTOS = [photo('p1'), photo('p2', 'Dinner on the last night'), photo('p3')]
// Keyed by storage path, exactly as the album holds them.
const THUMBS = new Map(PHOTOS.map((one) => [one.thumbnailPath as string, `https://signed/${one.id}`]))

beforeEach(() => {
  vi.clearAllMocks()
  listOpenQuestions.mockResolvedValue([])
  settleQuestion.mockResolvedValue(undefined)
})

function renderQuestions(stories: Story[] = [story('p3')], onAnswer = vi.fn().mockResolvedValue(undefined)) {
  render(
    <AlbumQuestions albumId="album-1" photos={PHOTOS} thumbnails={THUMBS} stories={stories} onAnswer={onAnswer} />,
  )
  return onAnswer
}

describe('AlbumQuestions', () => {
  it('says how many photos have no words at all, for free, before anything is asked', () => {
    renderQuestions()

    // p2 has a caption and p3 a note; only p1 is silent.
    expect(screen.getByText('1 of 3 photos has nothing written about it yet.')).toBeInTheDocument()
    expect(askForQuestions).not.toHaveBeenCalled()
  })

  it('offers nothing to ask when every photo has words', () => {
    renderQuestions([story('p1'), story('p3')])

    expect(screen.getByText('Every photo has something written about it.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Suggest questions with AI' })).not.toBeInTheDocument()
  })

  it('keeps an answer on its photo with the question, privately, and closes the question', async () => {
    askForQuestions.mockResolvedValue({
      questions: [{ id: 'q1', photoId: 'p1', question: 'Who carved the pumpkins?', reason: 'Your sister might know.' }],
      used: 1,
      limit: 5,
    })
    const onAnswer = renderQuestions()

    fireEvent.click(screen.getByRole('button', { name: 'Suggest questions with AI' }))
    expect(await screen.findByText('Who carved the pumpkins?')).toBeInTheDocument()
    expect(screen.getByText('Your sister might know.')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Photo 1' })).toHaveAttribute('src', 'https://signed/p1')
    expect(screen.getByRole('status')).toHaveTextContent('1 new question. 1 of 5 requests used this month.')

    fireEvent.click(screen.getByRole('button', { name: 'Answer: Who carved the pumpkins?' }))
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'My sister and the boys.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save answer' }))

    await waitFor(() => expect(settleQuestion).toHaveBeenCalledWith('q1', 'answered'))
    expect(onAnswer).toHaveBeenCalledWith('p1', 'Who carved the pumpkins?\nMy sister and the boys.')
    expect(screen.queryByText('Who carved the pumpkins?')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Answer kept as a private note on the photo.')
  })

  it('sets a question aside without writing anything', async () => {
    listOpenQuestions.mockResolvedValue([{ id: 'q2', photoId: 'p1', question: 'Where was this?', reason: null }])
    const onAnswer = renderQuestions()

    fireEvent.click(await screen.findByRole('button', { name: 'Set aside: Where was this?' }))

    await waitFor(() => expect(settleQuestion).toHaveBeenCalledWith('q2', 'dismissed'))
    expect(onAnswer).not.toHaveBeenCalled()
    expect(screen.queryByText('Where was this?')).not.toBeInTheDocument()
  })

  it('does not close a question whose answer failed to save', async () => {
    listOpenQuestions.mockResolvedValue([{ id: 'q3', photoId: 'p1', question: 'Who is this?', reason: null }])
    renderQuestions([story('p3')], vi.fn().mockRejectedValue(new Error('The note could not be saved.')))

    fireEvent.click(await screen.findByRole('button', { name: 'Answer: Who is this?' }))
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'Grandpa.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save answer' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The note could not be saved.')
    expect(settleQuestion).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Your answer')).toHaveValue('Grandpa.')
  })

  it("says why no questions came, in the server's own words", async () => {
    askForQuestions.mockRejectedValue(new Error('You have asked for questions 5 times this month.'))
    renderQuestions()

    fireEvent.click(screen.getByRole('button', { name: 'Suggest questions with AI' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('5 times this month')
  })
})
