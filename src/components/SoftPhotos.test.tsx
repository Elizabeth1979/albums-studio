import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SoftPhotos } from './SoftPhotos'
import type { Photo } from '../lib/photos'

const blurred: Photo = {
  id: 'photo-1',
  storagePath: 'owner/album-1/photo-1.jpg',
  thumbnailPath: 'owner/album-1/photo-1-thumb.jpg',
  width: 2000,
  height: 1500,
  caption: null,
  captionVisibility: 'hidden',
  alt: null,
  sortOrder: 0,
  phash: null,
  sharpness: null,
  takenAt: null,
}

describe('SoftPhotos', () => {
  it('gives focus back to the remove button when the owner keeps them', () => {
    render(
      <SoftPhotos soft={[{ photo: blurred, blur: 0.6 }]} thumbnails={new Map()} onRemove={vi.fn()} />,
    )
    fireEvent.click(screen.getByLabelText('Remove photo 1'))
    fireEvent.click(screen.getByRole('button', { name: 'Remove 1 ticked photo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep them' }))

    expect(screen.getByRole('button', { name: 'Remove 1 ticked photo' })).toHaveFocus()
  })
})
