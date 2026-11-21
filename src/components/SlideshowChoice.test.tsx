import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Photo } from '../lib/photos'
import { SlideshowChoice } from './SlideshowChoice'

function photo(id: string, sortOrder: number, inSlideshow = true): Photo {
  return {
    id,
    storagePath: `owner/${id}.jpg`,
    thumbnailPath: `owner/${id}-thumb.jpg`,
    displayPath: null,
    originalPath: null,
    width: 2000,
    height: 1500,
    caption: null,
    captionVisibility: 'hidden',
    alt: sortOrder === 0 ? 'The jetty' : null,
    sortOrder,
    phash: null,
    sharpness: null,
    takenAt: null,
    inSlideshow,
  }
}

const PHOTOS = [photo('a', 0), photo('b', 1, false), photo('c', 2)]

function renderChoice(onChange = vi.fn(async () => {})) {
  const { container } = render(
    <SlideshowChoice photos={PHOTOS} thumbnails={new Map()} onChange={onChange} />,
  )
  const details = container.querySelector('details') as HTMLDetailsElement
  details.open = true
  fireEvent(details, new Event('toggle'))
  return onChange
}

describe('SlideshowChoice', () => {
  it('draws no pictures until it is opened', () => {
    const { container } = render(
      <SlideshowChoice photos={PHOTOS} thumbnails={new Map()} onChange={vi.fn()} />,
    )
    expect(container.querySelectorAll('li')).toHaveLength(0)
    expect(screen.getByText(/Choose which photos play \(2 of 3\)/)).toBeInTheDocument()
  })

  it('says how many photos play, and ticks exactly those', () => {
    renderChoice()

    expect(screen.getByText(/Choose which photos play \(2 of 3\)/)).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Plays photo 1: The jetty' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Plays photo 2' })).not.toBeChecked()
  })

  it('leaves one photo out, or puts it back, on its own box', () => {
    const onChange = renderChoice()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Plays photo 1: The jetty' }))
    expect(onChange).toHaveBeenLastCalledWith(['a'], false)

    fireEvent.click(screen.getByRole('checkbox', { name: 'Plays photo 2' }))
    expect(onChange).toHaveBeenLastCalledWith(['b'], true)
  })

  it('plays all, touching only the photos that change', () => {
    const onChange = renderChoice()
    fireEvent.click(screen.getByRole('button', { name: 'Play all' }))
    expect(onChange).toHaveBeenCalledWith(['b'], true)
  })

  it('leaves all out, touching only the photos that change', () => {
    const onChange = renderChoice()
    fireEvent.click(screen.getByRole('button', { name: 'Leave all out' }))
    expect(onChange).toHaveBeenCalledWith(['a', 'c'], false)
  })

  it('says so when a choice could not be saved', async () => {
    renderChoice(vi.fn(async () => Promise.reject(new Error('permission denied'))))

    fireEvent.click(screen.getByRole('checkbox', { name: 'Plays photo 2' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('permission denied')
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Plays photo 2' })).toBeEnabled())
  })
})
