import { useCallback, useEffect, useRef, useState } from 'react'
import type { Album } from '../lib/albums'
import { createImageProcessor } from '../lib/imaging/processor'
import { type Photo, listPhotos, signedUrls, storePhoto } from '../lib/photos'
import { type UploadItem, runUploads } from '../lib/uploads'
import { LayoutPreview } from './LayoutPreview'
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

  // One worker for the life of the screen rather than one per batch: spinning a
  // worker up costs more than the first photo takes to process.
  const processorRef = useRef<ReturnType<typeof createImageProcessor> | null>(null)

  useEffect(() => {
    processorRef.current = createImageProcessor()

    return () => {
      processorRef.current?.dispose()
      processorRef.current = null
    }
  }, [])

  const refreshThumbnails = useCallback(async (current: Photo[]) => {
    const paths = current
      .map((photo) => photo.thumbnailPath)
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

  async function handleFiles(files: File[]) {
    const processor = processorRef.current
    if (!processor) return

    const requests = files.map((file) => ({ id: crypto.randomUUID(), file }))

    setItems(
      requests.map((request) => ({
        id: request.id,
        fileName: request.file.name,
        status: 'waiting' as const,
        error: null,
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
            <PhotoGallery layout={album.layout} photos={photos} thumbnails={thumbnails} />
          </>
        )}
      </section>
    </>
  )
}
