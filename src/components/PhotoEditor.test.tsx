import { type ComponentProps } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PhotoEditor } from './PhotoEditor'
import type { Photo } from '../lib/photos'
import type { Story } from '../lib/stories'

function photo(overrides: Partial<Photo> = {}): Photo {
  return {
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
    ...overrides,
  }
}

function story(overrides: Partial<Story> = {}): Story {
  return {
    id: 'story-1',
    photoId: 'photo-1',
    body: 'The cake was my aunt’s recipe.',
    visibility: 'hidden',
    createdAt: '2026-08-17T10:00:00Z',
    ...overrides,
  }
}

function renderEditor(props: Partial<ComponentProps<typeof PhotoEditor>> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined)

  const result = render(
    <PhotoEditor
      photo={photo()}
      position={1}
      thumbnail="https://signed/1"
      stories={[]}
      onSave={onSave}
      onAddStory={vi.fn().mockResolvedValue(undefined)}
      onEditStory={vi.fn().mockResolvedValue(undefined)}
      onDeleteStory={vi.fn().mockResolvedValue(undefined)}
      isCover={false}
      onUseAsCover={vi.fn().mockResolvedValue(undefined)}
      onMoveEarlier={vi.fn().mockResolvedValue(undefined)}
      onMoveLater={vi.fn().mockResolvedValue(undefined)}
      onDelete={vi.fn().mockResolvedValue(undefined)}
      onClose={vi.fn()}
      {...props}
    />,
  )

  return { ...result, onSave }
}

describe('captions and alt text', () => {
  it('opens with what the owner wrote last time', async () => {
    renderEditor({ photo: photo({ caption: 'Dinner', alt: 'A table by the sea' }) })

    expect(screen.getByLabelText('Caption')).toHaveValue('Dinner')
    expect(screen.getByLabelText('Alt text')).toHaveValue('A table by the sea')
  })

  it('saves the caption, its visibility, and the alt text together', async () => {
    const { onSave } = renderEditor()

    fireEvent.change(screen.getByLabelText('Caption'), { target: { value: 'Dinner' } })
    fireEvent.click(screen.getByRole('radio', { name: /Show it under the photo/ }))
    fireEvent.change(screen.getByLabelText('Alt text'), {
      target: { value: 'A table by the sea' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        caption: 'Dinner',
        captionVisibility: 'visible',
        alt: 'A table by the sea',
      }),
    )
  })

  it('starts a new caption hidden', async () => {
    // Nothing an owner writes becomes public without them saying so. The
    // database default agrees, and this is the half a reader can see.
    renderEditor()

    expect(screen.getByRole('radio', { name: /Keep it to myself/ })).toBeChecked()
  })

  it('shows an existing choice rather than resetting it', async () => {
    renderEditor({ photo: photo({ caption: 'Dinner', captionVisibility: 'visible' }) })

    expect(screen.getByRole('radio', { name: /Show it under the photo/ })).toBeChecked()
  })

  it('confirms a save', async () => {
    renderEditor()

    fireEvent.change(screen.getByLabelText('Caption'), { target: { value: 'Dinner' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Saved.')).toBeInTheDocument()
  })

  it('reports a refused save without losing what was typed', async () => {
    // Retyping a paragraph because the network dropped is how people stop
    // writing them.
    const onSave = vi.fn().mockRejectedValue(new Error('permission denied for column alt'))
    renderEditor({ onSave })

    fireEvent.change(screen.getByLabelText('Caption'), { target: { value: 'Dinner' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('permission denied')
    expect(screen.getByLabelText('Caption')).toHaveValue('Dinner')
  })

  it('tells the owner what alt text is for', async () => {
    // The field is useless if nobody knows what to type in it.
    renderEditor()

    const alt = screen.getByLabelText('Alt text')
    expect(alt).toHaveAccessibleDescription(/screen reader/i)
  })

  it('leaves the preview out of the accessibility tree', async () => {
    // The photo is on screen twice while the editor is open, and neither copy
    // has anything truthful to announce until alt text exists.
    const { container } = renderEditor()

    expect(container.querySelector('.photo-editor-preview')).toBeInTheDocument()
    expect(screen.queryAllByRole('img')).toHaveLength(0)
  })
})

describe('choosing the album cover', () => {
  it('offers a photo that is not the cover', async () => {
    const onUseAsCover = vi.fn().mockResolvedValue(undefined)
    renderEditor({ onUseAsCover })

    fireEvent.click(screen.getByRole('button', { name: 'Use as album cover' }))

    await waitFor(() => expect(onUseAsCover).toHaveBeenCalled())
  })

  it('says so instead when this photo is already the cover', async () => {
    // A button that reassigns the cover to the photo that already holds it does
    // nothing, so it should not be there to press.
    renderEditor({ isCover: true })

    expect(screen.getByText('Album cover')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Use as album cover' }),
    ).not.toBeInTheDocument()
  })

  it('reports a refused cover rather than doing nothing visible', async () => {
    // The cover chosen automatically for a new album fails quietly, because
    // nobody asked for it. This one was asked for.
    const onUseAsCover = vi
      .fn()
      .mockRejectedValue(new Error('violates foreign key constraint'))
    renderEditor({ onUseAsCover })

    fireEvent.click(screen.getByRole('button', { name: 'Use as album cover' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'violates foreign key constraint',
    )
  })
})

describe('where a photo sits, and removing it', () => {
  it('moves a photo earlier', async () => {
    const onMoveEarlier = vi.fn().mockResolvedValue(undefined)
    renderEditor({ onMoveEarlier })

    fireEvent.click(screen.getByRole('button', { name: '← Move earlier' }))

    await waitFor(() => expect(onMoveEarlier).toHaveBeenCalled())
  })

  it('moves a photo later', async () => {
    const onMoveLater = vi.fn().mockResolvedValue(undefined)
    renderEditor({ onMoveLater })

    fireEvent.click(screen.getByRole('button', { name: 'Move later →' }))

    await waitFor(() => expect(onMoveLater).toHaveBeenCalled())
  })

  it('disables the direction that has nowhere to go', async () => {
    // Kept on screen rather than removed, so the row does not reflow as the
    // owner steps from the first photo to the second.
    renderEditor({ onMoveEarlier: null })

    expect(screen.getByRole('button', { name: '← Move earlier' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move later →' })).toBeEnabled()
  })

  it('reports a refused move', async () => {
    const onMoveLater = vi.fn().mockRejectedValue(new Error('permission denied'))
    renderEditor({ onMoveLater })

    fireEvent.click(screen.getByRole('button', { name: 'Move later →' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('permission denied')
  })

  it('asks before removing a photograph', async () => {
    // A product invariant: photos are never deleted without confirmation.
    const onDelete = vi.fn().mockResolvedValue(undefined)
    renderEditor({ onDelete })

    fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }))
    expect(onDelete).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove it' }))
    await waitFor(() => expect(onDelete).toHaveBeenCalled())
  })

  it('says what will be lost with it', async () => {
    renderEditor()

    fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }))

    expect(screen.getByText(/everything written about it go for good/)).toBeInTheDocument()
  })

  it('lets the owner back out', async () => {
    const onDelete = vi.fn()
    renderEditor({ onDelete })

    fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }))

    expect(screen.queryByRole('button', { name: 'Yes, remove it' })).not.toBeInTheDocument()
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('reports a refused removal', async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error('permission denied for table photos'))
    renderEditor({ onDelete })

    fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove it' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('permission denied')
  })
})

describe('story notes', () => {
  it('adds a story', async () => {
    const onAddStory = vi.fn().mockResolvedValue(undefined)
    renderEditor({ onAddStory })

    fireEvent.change(screen.getByLabelText('Add a story'), {
      target: { value: 'We had been walking since six.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save story' }))

    await waitFor(() =>
      expect(onAddStory).toHaveBeenCalledWith({
        body: 'We had been walking since six.',
        visibility: 'hidden',
      }),
    )
  })

  it('refuses an empty story', async () => {
    const onAddStory = vi.fn()
    renderEditor({ onAddStory })

    fireEvent.click(screen.getByRole('button', { name: 'Save story' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Write the story')
    expect(onAddStory).not.toHaveBeenCalled()
  })

  it('clears the form after a story is saved, ready for the next', async () => {
    renderEditor()

    fireEvent.change(screen.getByLabelText('Add a story'), { target: { value: 'A long day.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save story' }))

    await waitFor(() => expect(screen.getByLabelText('Add a story')).toHaveValue(''))
  })

  it('shows the stories a photo already has, and who they are for', async () => {
    renderEditor({
      stories: [
        story(),
        story({ id: 'story-2', body: 'Nobody admitted they were tired.', visibility: 'visible' }),
      ],
    })

    expect(screen.getByText('The cake was my aunt’s recipe.')).toBeInTheDocument()
    expect(screen.getByText('Nobody admitted they were tired.')).toBeInTheDocument()
    expect(screen.getByText('Kept to yourself')).toBeInTheDocument()
    expect(screen.getByText('Shown with the album')).toBeInTheDocument()
  })

  it('invites another story once one exists', async () => {
    renderEditor({ stories: [story()] })

    expect(screen.getByLabelText('Add another story')).toBeInTheDocument()
  })

  it('edits a story', async () => {
    const onEditStory = vi.fn().mockResolvedValue(undefined)
    renderEditor({ stories: [story()], onEditStory })

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('Edit this story note'), {
      target: { value: 'It was my grandmother’s recipe, actually.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(onEditStory).toHaveBeenCalledWith('story-1', {
        body: 'It was my grandmother’s recipe, actually.',
      }),
    )
  })

  it('publishes a story without rewriting it', async () => {
    const onEditStory = vi.fn().mockResolvedValue(undefined)
    renderEditor({ stories: [story()], onEditStory })

    fireEvent.click(screen.getByRole('button', { name: 'Show with album' }))

    await waitFor(() =>
      expect(onEditStory).toHaveBeenCalledWith('story-1', { visibility: 'visible' }),
    )
  })

  it('takes a published story back', async () => {
    const onEditStory = vi.fn().mockResolvedValue(undefined)
    renderEditor({ stories: [story({ visibility: 'visible' })], onEditStory })

    fireEvent.click(screen.getByRole('button', { name: 'Keep to myself' }))

    await waitFor(() =>
      expect(onEditStory).toHaveBeenCalledWith('story-1', { visibility: 'hidden' }),
    )
  })

  it('asks before deleting a story', async () => {
    // A written memory is not something to lose to a mis-tap.
    const onDeleteStory = vi.fn().mockResolvedValue(undefined)
    renderEditor({ stories: [story()], onDeleteStory })

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onDeleteStory).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Delete for good' }))
    await waitFor(() => expect(onDeleteStory).toHaveBeenCalledWith('story-1'))
  })

  it('lets the owner back out of a delete', async () => {
    const onDeleteStory = vi.fn()
    renderEditor({ stories: [story()], onDeleteStory })

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }))

    expect(screen.queryByRole('button', { name: 'Delete for good' })).not.toBeInTheDocument()
    expect(onDeleteStory).not.toHaveBeenCalled()
  })
})

describe('when a photograph was taken', () => {
  it('shows the capture time when the file carried one', () => {
    renderEditor({ photo: photo({ takenAt: '2026-08-19T13:45:02' }) })

    expect(screen.getByText(/^Taken /)).toBeInTheDocument()
  })

  it('says nothing at all when it did not', () => {
    // A screenshot, or anything a messaging app stripped. An empty "Taken"
    // line would be worse than no line.
    renderEditor({ photo: photo({ takenAt: null }) })

    expect(screen.queryByText(/^Taken /)).not.toBeInTheDocument()
  })

  it('shows the hour the camera showed, not the reader\u2019s', () => {
    // EXIF carries no zone. Reading it as UTC and rendering it locally would
    // move a photograph taken at dawn into the previous night.
    renderEditor({ photo: photo({ takenAt: '2026-08-19T06:30:00' }) })

    expect(screen.getByText(/06:30|6:30/)).toBeInTheDocument()
  })

  it('falls back to the raw value rather than showing "Invalid Date"', () => {
    renderEditor({ photo: photo({ takenAt: 'not a date' }) })

    expect(screen.getByText('Taken not a date')).toBeInTheDocument()
  })
})
