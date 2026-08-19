import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AlbumPhotos } from './AlbumPhotos'
import type { Album } from '../lib/albums'
import type { Photo } from '../lib/photos'

const { photosApi, processorApi, createImageProcessor, storiesApi } = vi.hoisted(() => ({
  photosApi: {
    listPhotos: vi.fn(),
    storePhoto: vi.fn(),
    signedUrls: vi.fn(),
    updatePhotoText: vi.fn(),
    deletePhoto: vi.fn(),
    swapPhotoOrder: vi.fn(),
  },
  processorApi: { process: vi.fn(), dispose: vi.fn() },
  createImageProcessor: vi.fn(),
  storiesApi: {
    listStories: vi.fn(),
    createStory: vi.fn(),
    updateStory: vi.fn(),
    deleteStory: vi.fn(),
  },
}))

vi.mock('../lib/photos', () => photosApi)
vi.mock('../lib/stories', () => storiesApi)
vi.mock('../lib/imaging/processor', () => ({ createImageProcessor }))

const album: Album = {
  id: 'album-1',
  title: 'Eilat',
  slug: 'eilat',
  layout: 'masonry',
  description: null,
  coverPhotoId: null,
  visibility: 'private',
  createdAt: '2026-08-16T20:27:38Z',
}

const onCoverChosen = vi.fn()

function renderPhotos(overrides: Partial<Album> = {}) {
  return render(
    <AlbumPhotos album={{ ...album, ...overrides }} onCoverChosen={onCoverChosen} />,
  )
}

function photo(index: number): Photo {
  return {
    id: `photo-${index}`,
    storagePath: `owner/album-1/photo-${index}.jpg`,
    thumbnailPath: `owner/album-1/photo-${index}-thumb.jpg`,
    width: 2000,
    height: 1500,
    caption: null,
    captionVisibility: 'hidden',
    alt: null,
    sortOrder: index,
    phash: null,
    sharpness: null,
    takenAt: null,
  }
}

function chooseFiles(names: string[]) {
  const input = screen.getByLabelText('Choose photos')
  const files = names.map((name) => new File(['bytes'], name, { type: 'image/jpeg' }))

  fireEvent.change(input, { target: { files } })
}

beforeEach(() => {
  vi.clearAllMocks()
  createImageProcessor.mockReturnValue(processorApi)
  storiesApi.listStories.mockResolvedValue([])
  onCoverChosen.mockResolvedValue(undefined)
  photosApi.listPhotos.mockResolvedValue([])
  photosApi.signedUrls.mockResolvedValue(new Map())
  processorApi.process.mockResolvedValue({
    full: new Blob(['full']),
    thumbnail: new Blob(['thumb']),
    width: 2000,
    height: 1500,
    phash: '0'.repeat(64),
    sharpness: 120,
  })
  photosApi.storePhoto.mockImplementation(async ({ sortOrder }: { sortOrder: number }) =>
    photo(sortOrder),
  )
})

describe('AlbumPhotos', () => {
  it('offers a way in that works without dragging', async () => {
    renderPhotos()

    // A phone has nothing to drag, so the control has to be the file input.
    expect(await screen.findByLabelText('Choose photos')).toBeInTheDocument()
  })

  it('shows the empty album in its layout', async () => {
    renderPhotos()

    expect(await screen.findByRole('heading', { name: 'No photos yet' })).toBeInTheDocument()
  })

  it('renders photos it loaded, using signed thumbnails', async () => {
    photosApi.listPhotos.mockResolvedValue([photo(0), photo(1)])
    photosApi.signedUrls.mockResolvedValue(
      new Map([
        ['owner/album-1/photo-0-thumb.jpg', 'https://signed/0'],
        ['owner/album-1/photo-1-thumb.jpg', 'https://signed/1'],
      ]),
    )

    const { container } = renderPhotos()

    // Queried through the DOM rather than by role: a photo with no alt text yet
    // is deliberately decorative, so it has no `img` role to find.
    await waitFor(() => expect(container.querySelectorAll('img')).toHaveLength(2))
    expect(container.querySelectorAll('img')[0]).toHaveAttribute('src', 'https://signed/0')
    expect(screen.queryByRole('heading', { name: 'No photos yet' })).not.toBeInTheDocument()
  })

  it('keeps the image itself out of the accessibility tree', async () => {
    // The tile is a button now, and the button carries the description. An image
    // that also announced itself would make a screen reader read every photo
    // twice over.
    photosApi.listPhotos.mockResolvedValue([{ ...photo(0), alt: 'The reef at sunset' }])
    photosApi.signedUrls.mockResolvedValue(
      new Map([['owner/album-1/photo-0-thumb.jpg', 'https://signed/0']]),
    )

    const { container } = renderPhotos()

    await waitFor(() => expect(container.querySelectorAll('img')).toHaveLength(1))
    expect(screen.queryAllByRole('img')).toHaveLength(0)
  })

  it('names a photo by its alt text once the owner has written some', async () => {
    photosApi.listPhotos.mockResolvedValue([{ ...photo(0), alt: 'The reef at sunset' }])
    photosApi.signedUrls.mockResolvedValue(
      new Map([['owner/album-1/photo-0-thumb.jpg', 'https://signed/0']]),
    )

    renderPhotos()

    expect(
      await screen.findByRole('button', { name: 'Edit photo 1: The reef at sunset' }),
    ).toBeInTheDocument()
  })

  it('still tells photos apart before anything has been written', async () => {
    // Position is the only thing that distinguishes two undescribed pictures,
    // so it stays in the name rather than leaving a row of identical buttons.
    photosApi.listPhotos.mockResolvedValue([photo(0), photo(1)])
    photosApi.signedUrls.mockResolvedValue(new Map())

    renderPhotos()

    expect(await screen.findByRole('button', { name: 'Edit photo 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit photo 2' })).toBeInTheDocument()
  })

  it('reports a failed load', async () => {
    photosApi.listPhotos.mockRejectedValue(new Error('Network unreachable'))

    renderPhotos()

    expect(await screen.findByRole('alert')).toHaveTextContent('Network unreachable')
  })

  it('uploads chosen files and counts them as they land', async () => {
    renderPhotos()
    await screen.findByLabelText('Choose photos')

    chooseFiles(['one.jpg', 'two.jpg'])

    await waitFor(() => expect(photosApi.storePhoto).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Added 2 of 2.')).toBeInTheDocument()
  })

  it('numbers new photos after the ones already in the album', async () => {
    photosApi.listPhotos.mockResolvedValue([photo(0), photo(1)])

    renderPhotos()
    await screen.findByLabelText('Choose photos')

    chooseFiles(['three.jpg'])

    await waitFor(() =>
      expect(photosApi.storePhoto).toHaveBeenCalledWith(
        expect.objectContaining({ albumId: 'album-1', sortOrder: 2 }),
      ),
    )
  })

  it('names a file that could not be uploaded', async () => {
    photosApi.storePhoto.mockRejectedValue(new Error('storage unavailable'))

    renderPhotos()
    await screen.findByLabelText('Choose photos')

    chooseFiles(['one.jpg'])

    expect(await screen.findByText('one.jpg')).toBeInTheDocument()

    // Retries back off for real here, so allow for the full attempt budget.
    const alert = await screen.findByRole('alert', {}, { timeout: 5000 })
    expect(alert).toHaveTextContent('1 photo could not be added.')
    expect(alert).toHaveTextContent('Choosing them again will try once more.')
  })

  it('clears the upload list on request', async () => {
    renderPhotos()
    await screen.findByLabelText('Choose photos')

    chooseFiles(['one.jpg'])
    await screen.findByText('Added 1 of 1.')

    fireEvent.click(screen.getByRole('button', { name: 'Clear this list' }))

    expect(screen.queryByText('Added 1 of 1.')).not.toBeInTheDocument()
  })

  describe('writing about a photo', () => {
    async function openEditor() {
      photosApi.listPhotos.mockResolvedValue([photo(0), photo(1)])
      photosApi.signedUrls.mockResolvedValue(
        new Map([['owner/album-1/photo-0-thumb.jpg', 'https://signed/0']]),
      )

      renderPhotos()
      fireEvent.click(await screen.findByRole('button', { name: 'Edit photo 1' }))

      return screen.findByRole('heading', { name: 'What do you want to remember?' })
    }

    it('opens an editor for the photo that was chosen', async () => {
      await openEditor()

      expect(screen.getByText('Photo 1')).toBeInTheDocument()
    })

    it('closes it again when the same photo is chosen twice', async () => {
      await openEditor()

      fireEvent.click(screen.getByRole('button', { name: 'Edit photo 1' }))

      expect(
        screen.queryByRole('heading', { name: 'What do you want to remember?' }),
      ).not.toBeInTheDocument()
    })

    it('saves the text against the right photo', async () => {
      photosApi.updatePhotoText.mockResolvedValue({ ...photo(1), caption: 'Dinner' })
      await openEditor()

      // Switch to the second photo before saving: the editor is one component
      // reused for whichever photo is open, so it has to write to that one.
      fireEvent.click(screen.getByRole('button', { name: 'Edit photo 2' }))
      fireEvent.change(screen.getByLabelText('Caption'), { target: { value: 'Dinner' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() =>
        expect(photosApi.updatePhotoText).toHaveBeenCalledWith(
          'photo-1',
          expect.objectContaining({ caption: 'Dinner' }),
        ),
      )
    })

    it('shows the saved text without reloading the album', async () => {
      photosApi.updatePhotoText.mockResolvedValue({
        ...photo(0),
        alt: 'A table by the sea',
      })
      await openEditor()

      fireEvent.change(screen.getByLabelText('Alt text'), {
        target: { value: 'A table by the sea' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      // The tile takes its name from the alt text, so this is the album seeing
      // the new value rather than the form still holding it.
      expect(
        await screen.findByRole('button', { name: 'Edit photo 1: A table by the sea' }),
      ).toBeInTheDocument()
    })

    it('starts a fresh draft when a different photo is opened', async () => {
      // Otherwise a half-typed caption follows the owner to the next picture and
      // gets saved to the wrong one.
      await openEditor()

      fireEvent.change(screen.getByLabelText('Caption'), { target: { value: 'Half a th' } })
      fireEvent.click(screen.getByRole('button', { name: 'Edit photo 2' }))

      expect(screen.getByLabelText('Caption')).toHaveValue('')
    })

    it('adds a story to the open photo', async () => {
      storiesApi.createStory.mockResolvedValue({
        id: 'story-1',
        photoId: 'photo-0',
        body: 'A long day.',
        visibility: 'hidden',
        createdAt: '2026-08-17T10:00:00Z',
      })
      await openEditor()

      fireEvent.change(screen.getByLabelText('Add a story'), {
        target: { value: 'A long day.' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Save story' }))

      await waitFor(() =>
        expect(storiesApi.createStory).toHaveBeenCalledWith({
          photoId: 'photo-0',
          body: 'A long day.',
          visibility: 'hidden',
        }),
      )
      expect(await screen.findByText('A long day.')).toBeInTheDocument()
    })

    it('shows each photo only its own stories', async () => {
      storiesApi.listStories.mockResolvedValue([
        {
          id: 'story-1',
          photoId: 'photo-1',
          body: 'Belongs to the second photo.',
          visibility: 'hidden',
          createdAt: '2026-08-17T10:00:00Z',
        },
      ])
      await openEditor()

      expect(screen.queryByText('Belongs to the second photo.')).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Edit photo 2' }))
      expect(screen.getByText('Belongs to the second photo.')).toBeInTheDocument()
    })

    it('takes a deleted story off the screen', async () => {
      storiesApi.listStories.mockResolvedValue([
        {
          id: 'story-1',
          photoId: 'photo-0',
          body: 'A long day.',
          visibility: 'hidden',
          createdAt: '2026-08-17T10:00:00Z',
        },
      ])
      storiesApi.deleteStory.mockResolvedValue(undefined)
      await openEditor()

      await screen.findByText('A long day.')
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
      fireEvent.click(screen.getByRole('button', { name: 'Delete for good' }))

      await waitFor(() => expect(screen.queryByText('A long day.')).not.toBeInTheDocument())
    })

    it('opens the album even when the stories cannot be read', async () => {
      // Story notes are the secondary half of this screen. A failure to read
      // them is not a reason to refuse to show the photographs.
      storiesApi.listStories.mockRejectedValue(new Error('timeout'))
      photosApi.listPhotos.mockResolvedValue([photo(0)])

      renderPhotos()

      expect(await screen.findByRole('button', { name: 'Edit photo 1' })).toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  describe('showing which photo is open', () => {
    async function openSecondOfThree() {
      photosApi.listPhotos.mockResolvedValue([photo(0), photo(1), photo(2)])
      photosApi.signedUrls.mockResolvedValue(new Map())

      renderPhotos()
      fireEvent.click(await screen.findByRole('button', { name: /^Edit photo 2/ }))
    }

    it('says which photo is open rather than only tinting it', async () => {
      // A coloured ring is drawn over a photograph, so how visible it is depends
      // on what the photograph contains. Words do not have that problem, and
      // colour alone would fail WCAG 1.4.1 besides.
      await openSecondOfThree()

      expect(screen.getByText('Editing')).toBeInTheDocument()
    })

    it('marks exactly one photo at a time', async () => {
      await openSecondOfThree()

      expect(screen.getAllByText('Editing')).toHaveLength(1)

      fireEvent.click(screen.getByRole('button', { name: /^Edit photo 3/ }))
      expect(screen.getAllByText('Editing')).toHaveLength(1)
    })

    it('drops the mark when the editor is closed', async () => {
      await openSecondOfThree()

      fireEvent.click(screen.getByRole('button', { name: 'Close' }))

      expect(screen.queryByText('Editing')).not.toBeInTheDocument()
    })

    it('tells assistive technology which tile is expanded', async () => {
      await openSecondOfThree()

      expect(screen.getByRole('button', { name: /^Edit photo 2/ })).toHaveAttribute(
        'aria-expanded',
        'true',
      )
      expect(screen.getByRole('button', { name: /^Edit photo 1/ })).toHaveAttribute(
        'aria-expanded',
        'false',
      )
    })
  })

  describe('choosing the album cover', () => {
    /** `name` is matched loosely: a cover's button carries a suffix. */
    async function openEditorFor(name: RegExp, overrides: Partial<Album> = {}) {
      photosApi.listPhotos.mockResolvedValue([photo(0), photo(1)])
      photosApi.signedUrls.mockResolvedValue(new Map())

      renderPhotos(overrides)
      fireEvent.click(await screen.findByRole('button', { name }))
    }

    it('sets the chosen photo as the cover', async () => {
      await openEditorFor(/^Edit photo 2/)

      fireEvent.click(screen.getByRole('button', { name: 'Use as album cover' }))

      await waitFor(() => expect(onCoverChosen).toHaveBeenCalledWith('photo-1'))
    })

    it('marks the cover in the gallery', async () => {
      // Otherwise the only way to find out which photo the library shows is to
      // open each one in turn.
      await openEditorFor(/^Edit photo 1/, { coverPhotoId: 'photo-0' })

      expect(
        screen.getByRole('button', { name: 'Edit photo 1 (album cover)' }),
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Edit photo 2' })).toBeInTheDocument()
    })

    it('does not offer to re-cover the photo that already is', async () => {
      await openEditorFor(/^Edit photo 1/, { coverPhotoId: 'photo-0' })

      expect(
        screen.queryByRole('button', { name: 'Use as album cover' }),
      ).not.toBeInTheDocument()
    })
  })

  describe('reordering and removing photos', () => {
    async function openThree(name: RegExp, overrides: Partial<Album> = {}) {
      photosApi.listPhotos.mockResolvedValue([photo(0), photo(1), photo(2)])
      photosApi.signedUrls.mockResolvedValue(new Map())
      photosApi.swapPhotoOrder.mockResolvedValue(undefined)
      photosApi.deletePhoto.mockResolvedValue(undefined)

      renderPhotos(overrides)
      fireEvent.click(await screen.findByRole('button', { name }))
    }

    it('swaps the chosen photo with the one before it', async () => {
      await openThree(/^Edit photo 2/)

      fireEvent.click(screen.getByRole('button', { name: '← Move earlier' }))

      await waitFor(() =>
        expect(photosApi.swapPhotoOrder).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'photo-1' }),
          expect.objectContaining({ id: 'photo-0' }),
        ),
      )
    })

    it('reorders the gallery without reloading the album', async () => {
      await openThree(/^Edit photo 2/)

      fireEvent.click(screen.getByRole('button', { name: '← Move earlier' }))

      // photo-1 now sits first, so it is the tile named "photo 1".
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /^Edit photo 1/ })).toHaveAttribute(
          'aria-expanded',
          'true',
        ),
      )
      expect(photosApi.listPhotos).toHaveBeenCalledTimes(1)
    })

    it('offers no way off either end of the album', async () => {
      await openThree(/^Edit photo 1/)

      expect(screen.getByRole('button', { name: '← Move earlier' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Move later →' })).toBeEnabled()
    })

    it('removes a photo and closes the editor', async () => {
      await openThree(/^Edit photo 2/)

      fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }))
      fireEvent.click(screen.getByRole('button', { name: 'Yes, remove it' }))

      await waitFor(() =>
        expect(photosApi.deletePhoto).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'photo-1' }),
        ),
      )
      await waitFor(() =>
        expect(
          screen.queryByRole('heading', { name: 'What do you want to remember?' }),
        ).not.toBeInTheDocument(),
      )
      expect(screen.queryByRole('button', { name: /^Edit photo 3/ })).not.toBeInTheDocument()
    })

    it('hands the cover to another photo when the cover one is removed', async () => {
      // The foreign key nulls the album's cover when its photo goes, which would
      // leave a full album showing an empty card in the library.
      await openThree(/^Edit photo 1/, { coverPhotoId: 'photo-0' })

      fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }))
      fireEvent.click(screen.getByRole('button', { name: 'Yes, remove it' }))

      await waitFor(() => expect(onCoverChosen).toHaveBeenCalledWith('photo-1'))
    })

    it('leaves the cover alone when a different photo is removed', async () => {
      await openThree(/^Edit photo 2/, { coverPhotoId: 'photo-0' })

      fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }))
      fireEvent.click(screen.getByRole('button', { name: 'Yes, remove it' }))

      await waitFor(() => expect(photosApi.deletePhoto).toHaveBeenCalled())
      expect(onCoverChosen).not.toHaveBeenCalled()
    })

    it('takes the removed photo’s stories with it', async () => {
      storiesApi.listStories.mockResolvedValue([
        {
          id: 'story-1',
          photoId: 'photo-1',
          body: 'Belongs to the second photo.',
          visibility: 'hidden',
          createdAt: '2026-08-17T10:00:00Z',
        },
      ])
      await openThree(/^Edit photo 2/)
      await screen.findByText('Belongs to the second photo.')

      fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }))
      fireEvent.click(screen.getByRole('button', { name: 'Yes, remove it' }))

      await waitFor(() =>
        expect(screen.queryByText('Belongs to the second photo.')).not.toBeInTheDocument(),
      )
    })
  })

  describe('the image processor', () => {
    it('is not built until there is a photo to process', () => {
      // It was built in an effect, and a file chosen before that effect ran was
      // dropped without a word: no upload, no error, nothing on screen. Building
      // it on demand is what removes that gap, so the timing is pinned here.
      renderPhotos()

      expect(createImageProcessor).not.toHaveBeenCalled()
    })

    it('is built once and reused across batches', async () => {
      // Starting a worker costs more than the first photo takes to process.
      renderPhotos()
      await screen.findByLabelText('Choose photos')

      chooseFiles(['one.jpg'])
      await screen.findByText('Added 1 of 1.')

      chooseFiles(['two.jpg'])
      await screen.findByText('Added 1 of 1.')

      expect(createImageProcessor).toHaveBeenCalledTimes(1)
    })

    it('is shut down when the screen goes away', async () => {
      const { unmount } = renderPhotos()
      await screen.findByLabelText('Choose photos')

      chooseFiles(['one.jpg'])
      await screen.findByText('Added 1 of 1.')

      unmount()

      expect(processorApi.dispose).toHaveBeenCalledOnce()
    })

    it('leaves nothing to shut down when no photo was ever chosen', () => {
      // The common case: opening an album to look at it. Nothing was started,
      // so there is nothing to tear down.
      const { unmount } = renderPhotos()
      unmount()

      expect(processorApi.dispose).not.toHaveBeenCalled()
    })
  })

  describe('choosing a cover', () => {
    it('makes the first photo the cover of an album that has none', async () => {
      renderPhotos()
      await screen.findByLabelText('Choose photos')

      chooseFiles(['one.jpg'])

      await waitFor(() => expect(onCoverChosen).toHaveBeenCalledWith('photo-0'))
    })

    it('picks the first by position, not the first to finish uploading', async () => {
      // Uploads run four at a time and settle out of order, so the photo that
      // returns first is not necessarily the one at the front of the album.
      photosApi.storePhoto.mockImplementation(async ({ sortOrder }: { sortOrder: number }) => {
        await new Promise((resolve) => setTimeout(resolve, sortOrder === 0 ? 20 : 0))
        return photo(sortOrder)
      })

      renderPhotos()
      await screen.findByLabelText('Choose photos')

      chooseFiles(['one.jpg', 'two.jpg'])

      await waitFor(() => expect(onCoverChosen).toHaveBeenCalledWith('photo-0'))
    })

    it('leaves an album that already has a cover alone', async () => {
      // A cover is a default for an empty album, not a rule that the newest
      // batch wins; otherwise every upload would overwrite a chosen cover.
      photosApi.listPhotos.mockResolvedValue([photo(0)])

      renderPhotos({ coverPhotoId: 'photo-0' })
      await screen.findByLabelText('Choose photos')

      chooseFiles(['two.jpg'])
      await screen.findByText('Added 1 of 1.')

      expect(onCoverChosen).not.toHaveBeenCalled()
    })

    it('asks for no cover when every upload failed', async () => {
      photosApi.storePhoto.mockRejectedValue(new Error('storage unavailable'))

      renderPhotos()
      await screen.findByLabelText('Choose photos')

      chooseFiles(['one.jpg'])
      await screen.findByRole('alert', {}, { timeout: 5000 })

      expect(onCoverChosen).not.toHaveBeenCalled()
    })

    it('keeps the photos when the cover cannot be saved', async () => {
      // The upload succeeded. A failed cover is a cosmetic loss and must not
      // read as though the photographs had not arrived.
      onCoverChosen.mockRejectedValue(new Error('permission denied for column cover_photo_id'))

      renderPhotos()
      await screen.findByLabelText('Choose photos')

      chooseFiles(['one.jpg'])

      expect(await screen.findByText('Added 1 of 1.')).toBeInTheDocument()
      await waitFor(() => expect(onCoverChosen).toHaveBeenCalled())
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })
})
