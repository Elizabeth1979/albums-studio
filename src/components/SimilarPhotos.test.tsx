import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SimilarPhotos } from './SimilarPhotos'
import type { Photo } from '../lib/photos'

function photo(id: string, sortOrder: number): Photo {
  return {
    id,
    storagePath: `owner/album-1/${id}.jpg`,
    thumbnailPath: `owner/album-1/${id}-thumb.jpg`,
    width: 2000,
    height: 1500,
    caption: null,
    captionVisibility: 'hidden',
    alt: null,
    sortOrder,
    phash: null,
    sharpness: null,
    takenAt: null,
  }
}

/** Two near-duplicates, the second ticked and its removal asked for. */
function askToRemove() {
  const photos = [photo('photo-1', 0), photo('photo-2', 1)]
  render(
    <SimilarPhotos
      groups={[{ photos, suggested: photos[0], spread: 2 }]}
      thumbnails={new Map()}
      onRemove={vi.fn()}
    />,
  )

  fireEvent.click(screen.getByLabelText('Remove photo 2'))
  fireEvent.click(screen.getByRole('button', { name: 'Remove 1 ticked photo' }))
}

describe('SimilarPhotos', () => {
  it('hands focus to the safe choice once removal is asked for', () => {
    // The button pressed is replaced by the confirmation, so focus has to go
    // somewhere: to keeping them, so a second Enter loses nothing.
    askToRemove()

    expect(screen.getByRole('button', { name: 'Keep them' })).toHaveFocus()
  })

  it('gives focus back to the remove button when the owner keeps them', () => {
    askToRemove()
    fireEvent.click(screen.getByRole('button', { name: 'Keep them' }))

    expect(screen.getByRole('button', { name: 'Remove 1 ticked photo' })).toHaveFocus()
  })

  it('leaves focus on a box ticked while the confirmation is open', () => {
    // Ticking another photo puts the confirmation away, since it no longer
    // says what would go. Focus is on the box, so it stays there.
    askToRemove()
    const first = screen.getByLabelText('Remove photo 1')
    first.focus()
    fireEvent.click(first)

    expect(first).toHaveFocus()
  })
})
