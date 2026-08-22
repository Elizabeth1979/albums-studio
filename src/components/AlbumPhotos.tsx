import { useCallback, useEffect, useRef, useState } from 'react'
import type { Album } from '../lib/albums'
import { createImageProcessor } from '../lib/imaging/processor'
import {
  type Photo,
  type TextVisibility,
  deletePhoto,
  listPhotos,
  signedUrls,
  storePhoto,
  swapPhotoOrder,
  updatePhotoText,
} from '../lib/photos'
import {
  type Story,
  createStory,
  deleteStory,
  listStories,
  updateStory,
} from '../lib/stories'
import { type UploadItem, runUploads } from '../lib/uploads'
import { LayoutPreview } from './LayoutPreview'
import { PhotoEditor } from './PhotoEditor'
import { SimilarPhotos } from './SimilarPhotos'
import { useModalDialog } from './useModalDialog'
import { groupSimilar } from '../lib/similarity'
import { PhotoGallery } from './PhotoGallery'
import { PhotoUploader } from './PhotoUploader'

type AlbumPhotosProps = {
  album: Album
  /** Called with the photo that should represent the album in the library. */
  onCoverChosen: (photoId: string) => Promise<void>
}

function describe(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function AlbumPhotos({ album, onCoverChosen }: AlbumPhotosProps) {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<UploadItem[]>([])
  const [busy, setBusy] = useState(false)
  const [stories, setStories] = useState<Story[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // One worker for the life of the screen rather than one per batch: spinning a
  // worker up costs more than the first photo takes to process.
  const processorRef = useRef<ReturnType<typeof createImageProcessor> | null>(null)

  /**
   * Built on first use rather than in an effect. Someone who taps the button the
   * moment the screen appears can choose a file before effects have run, and a
   * processor that is not there yet meant the upload was dropped in silence.
   */
  function imageProcessor() {
    processorRef.current ??= createImageProcessor()
    return processorRef.current
  }

  useEffect(() => {
    return () => {
      processorRef.current?.dispose()
      processorRef.current = null
    }
  }, [])

  /**
   * Signs what the album needs to draw itself: the thumbnail of every photo and
   * the stored image beside it.
   *
   * Both, because a tile on a wide screen is larger than a 400px thumbnail and
   * the browser picks between the two from the `srcset` the gallery writes. One
   * request signs the lot; asking twice would double the round trips for no
   * gain.
   */
  const refreshThumbnails = useCallback(async (current: Photo[]) => {
    const paths = current
      .flatMap((photo) => [photo.thumbnailPath, photo.storagePath])
      .filter((path): path is string => Boolean(path))

    if (paths.length === 0) {
      setThumbnails(new Map())
      return
    }

    try {
      setThumbnails(await signedUrls(paths))
    } catch (caughtError) {
      setError(describe(caughtError, 'Could not load the photo previews.'))
    }
  }, [])

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)

      try {
        const loaded = await listPhotos(album.id)
        if (!active) return

        setPhotos(loaded)
        setError(null)
        await refreshThumbnails(loaded)
      } catch (caughtError) {
        if (active) setError(describe(caughtError, 'Could not load this album’s photos.'))
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [album.id, refreshThumbnails])

  // Story notes load on their own, keyed on which photos are on screen. They are
  // the secondary half of this screen: making the pictures wait on them would
  // hold an album shut over text that is not shown until a photo is chosen, and
  // a failure to read them is not a reason to say the album could not open.
  const photoIds = photos.map((photo) => photo.id).join(',')

  useEffect(() => {
    let active = true
    const ids = photoIds ? photoIds.split(',') : []

    if (ids.length === 0) {
      setStories([])
      return
    }

    listStories(ids)
      .then((loaded) => {
        if (active) setStories(loaded)
      })
      .catch(() => {
        if (active) setStories([])
      })

    return () => {
      active = false
    }
  }, [photoIds])

  async function handleFiles(files: File[]) {
    const processor = imageProcessor()
    const requests = files.map((file) => ({ id: crypto.randomUUID(), file }))

    setItems(
      requests.map((request) => ({
        id: request.id,
        fileName: request.file.name,
        status: 'waiting' as const,
        error: null,
        detail: null,
        permanent: false,
      })),
    )
    setBusy(true)
    setError(null)

    const added: Photo[] = []

    await runUploads(album.id, requests, photos.length, {
      processor,
      store: storePhoto,
      onItemChange: (item) =>
        setItems((current) =>
          current.map((existing) => (existing.id === item.id ? item : existing)),
        ),
      onPhoto: (photo) => {
        added.push(photo)
        setPhotos((current) => [...current, photo].sort((a, b) => a.sortOrder - b.sortOrder))
      },
    })

    setBusy(false)

    if (added.length === 0) return

    const all = [...photos, ...added].sort((a, b) => a.sortOrder - b.sortOrder)
    await refreshThumbnails(all)

    // The first photograph in an album that has none becomes its cover, so the
    // library card shows the album rather than a bare title. An album that
    // already has a cover keeps it: this is a default, not a rule about which
    // photo represents the album.
    if (!album.coverPhotoId && all[0]) {
      try {
        await onCoverChosen(all[0].id)
      } catch {
        // The photos are safely stored either way, and the library falls back to
        // the same card it has always shown. Reporting a failed cover here would
        // read as though the upload itself had gone wrong.
      }
    }
  }

  function replacePhoto(updated: Photo) {
    setPhotos((current) =>
      current.map((photo) => (photo.id === updated.id ? updated : photo)),
    )
  }

  async function handleSaveText(
    photoId: string,
    patch: { caption?: string; captionVisibility?: TextVisibility; alt?: string },
  ) {
    replacePhoto(await updatePhotoText(photoId, patch))
  }

  async function handleAddStory(
    photoId: string,
    input: { body: string; visibility: TextVisibility },
  ) {
    const story = await createStory({ photoId, ...input })
    setStories((current) => [...current, story])
  }

  async function handleEditStory(
    id: string,
    patch: { body?: string; visibility?: TextVisibility },
  ) {
    const story = await updateStory(id, patch)
    setStories((current) => current.map((existing) => (existing.id === id ? story : existing)))
  }

  async function handleDeleteStory(id: string) {
    await deleteStory(id)
    setStories((current) => current.filter((story) => story.id !== id))
  }

  async function handleSwap(index: number, other: number) {
    const [a, b] = [photos[index], photos[other]]

    await swapPhotoOrder(a, b)

    setPhotos((current) => {
      const moved = current.map((photo) =>
        photo.id === a.id
          ? { ...photo, sortOrder: b.sortOrder }
          : photo.id === b.id
            ? { ...photo, sortOrder: a.sortOrder }
            : photo,
      )

      return [...moved].sort((one, two) => one.sortOrder - two.sortOrder)
    })
  }

  async function handleDeletePhoto(photo: Photo) {
    await deletePhoto(photo)

    const left = photos.filter((existing) => existing.id !== photo.id)
    setPhotos(left)
    setStories((current) => current.filter((story) => story.photoId !== photo.id))
    setSelectedId(null)

    // The foreign key nulls the album's cover when its photo goes, which would
    // leave a full album showing an empty card. Hand the job to the next photo
    // rather than making the owner notice and fix it.
    if (album.coverPhotoId === photo.id && left[0]) {
      try {
        await onCoverChosen(left[0].id)
      } catch {
        // The photo is gone either way; the card falls back to its placeholder.
      }
    }
  }

  /**
   * Removes a set of near-duplicates the owner picked.
   *
   * Sequential rather than parallel: each delete removes rows and then storage
   * objects, and a failure partway through should leave the rest of the album
   * alone rather than half-applied across several photographs at once.
   */
  async function handleRemoveSimilar(chosen: Photo[]) {
    for (const photo of chosen) {
      await handleDeletePhoto(photo)
    }
  }

  const selectedIndex = photos.findIndex((photo) => photo.id === selectedId)
  const selected = selectedIndex === -1 ? null : photos[selectedIndex]

  // Over the album rather than below it. Inline, the editor landed under a grid
  // that can be several screens long, so choosing a photo on a phone looked
  // like nothing had happened.
  const editorDialog = useModalDialog(Boolean(selected))

  // Recomputed from the photos themselves, so removing one re-groups the rest
  // without another round trip.
  const similarGroups = groupSimilar(photos)

  const storyCounts = new Map<string, number>()
  for (const story of stories) {
    storyCounts.set(story.photoId, (storyCounts.get(story.photoId) ?? 0) + 1)
  }

  return (
    <>
      <PhotoUploader
        items={items}
        busy={busy}
        onFiles={handleFiles}
        onDismiss={() => setItems([])}
      />

      {error && <p className="form-message error" role="alert">{error}</p>}

      <section className="album-canvas" aria-labelledby="album-photos-title">
        {loading ? (
          <p className="library-status" aria-live="polite">Opening this album…</p>
        ) : photos.length === 0 ? (
          <>
            <LayoutPreview layout={album.layout} />
            <div className="album-empty-copy">
              <h2 id="album-photos-title">No photos yet</h2>
              <p>
                This is how a {album.layout} album will arrange your photographs. Choose
                some above to fill it.
              </p>
            </div>
          </>
        ) : (
          <>
            <h2 className="visually-hidden" id="album-photos-title">
              {photos.length === 1 ? '1 photo' : `${photos.length} photos`}
            </h2>
            <p className="album-hint">Choose a photo to add a caption, a story, or alt text.</p>
            <PhotoGallery
              layout={album.layout}
              photos={photos}
              thumbnails={thumbnails}
              storyCounts={storyCounts}
              coverPhotoId={album.coverPhotoId}
              selectedId={selectedId}
              onSelect={(photoId) =>
                setSelectedId((current) => (current === photoId ? null : photoId))
              }
            />
            <SimilarPhotos
              groups={similarGroups}
              thumbnails={thumbnails}
              onRemove={handleRemoveSimilar}
            />

            <dialog
              className="editor-sheet"
              ref={editorDialog}
              aria-label="Photo details"
              onClose={() => setSelectedId(null)}
              onClick={(event) => {
                if (event.target === editorDialog.current) setSelectedId(null)
              }}
            >
            {selected && (
              <PhotoEditor
                // Remounting per photo is deliberate: the editor holds a draft,
                // and carrying one photo's half-typed caption to the next would
                // be a good way to save it to the wrong picture.
                key={selected.id}
                photo={selected}
                position={selectedIndex + 1}
                thumbnail={
                  selected.thumbnailPath
                    ? thumbnails.get(selected.thumbnailPath)
                    : undefined
                }
                stories={stories.filter((story) => story.photoId === selected.id)}
                onSave={(patch) => handleSaveText(selected.id, patch)}
                onAddStory={(input) => handleAddStory(selected.id, input)}
                onEditStory={handleEditStory}
                onDeleteStory={handleDeleteStory}
                isCover={album.coverPhotoId === selected.id}
                onUseAsCover={() => onCoverChosen(selected.id)}
                onMoveEarlier={
                  selectedIndex > 0 ? () => handleSwap(selectedIndex, selectedIndex - 1) : null
                }
                onMoveLater={
                  selectedIndex < photos.length - 1
                    ? () => handleSwap(selectedIndex, selectedIndex + 1)
                    : null
                }
                onDelete={() => handleDeletePhoto(selected)}
                onClose={() => setSelectedId(null)}
              />
            )}
            </dialog>
          </>
        )}
      </section>
    </>
  )
}
