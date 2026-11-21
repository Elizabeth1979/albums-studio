import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { UploadItem } from '../lib/uploads'
import { PhotoUploader } from './PhotoUploader'

function item(overrides: Partial<UploadItem> = {}): UploadItem {
  return {
    id: 'upload-1',
    fileName: 'dawn.jpg',
    status: 'uploading',
    error: null,
    detail: null,
    permanent: false,
    ...overrides,
  }
}

describe('PhotoUploader', () => {
  it('says the first "Adding…" through a region that was already on the page', () => {
    // A live region created together with its text is said by some screen
    // readers and not others, so the region has to be there before there is
    // anything to say.
    const props = { busy: false, filled: true, onFiles: vi.fn(), onDismiss: vi.fn() }
    const { rerender } = render(<PhotoUploader {...props} items={[]} />)
    const region = screen.getByRole('status')
    expect(region).toBeEmptyDOMElement()

    rerender(<PhotoUploader {...props} busy items={[item()]} />)

    expect(screen.getByRole('status')).toBe(region)
    expect(region).toHaveTextContent('Adding 0 of 1…')
  })
})
