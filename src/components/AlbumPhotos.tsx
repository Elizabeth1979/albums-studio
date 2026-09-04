import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Album } from '../lib/albums'
import { createImageProcessor } from '../lib/imaging/processor'
import {
  type Photo,
  type TextVisibility,
  deletePhoto,
  listPhotos,
  photoBytes,
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
import { SoftPhotos } from './SoftPhotos'
import { useModalDialog } from './useModalDialog'
import { groupSimilar } from '../lib/similarity'
import { mapWithConcurrency } from '../lib/concurrency'
import type { FocusReading } from '../lib/imaging/measure'
import { type FaceReading, findFacesIn, forgetDetector } from '../lib/imaging/faces'
import { findSoftPhotos, summariseFaces, summariseFocus } from '../lib/focus'
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
  // How well each photograph is focused, by photo id, filled in as the readings
  // arrive. A photo missing from this map has not been judged yet.
  const [focusReadings, setFocusReadings] = useState<Map<string, FocusReading>>(new Map())
  // Whether each photograph has anyone in it, by photo id. Displayed and not
  // acted on: this is the first round of judging the subject rather than the
  // frame, and the only album that can say whether the detector finds her son
  // is hers.
  const [faceReadings, setFaceReadings] = useState<Map<string, FaceReading>>(new Map())
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
      forgetDetector()
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
      return new Map()
    }

    try {
      const urls = await signedUrls(paths)
      setThumbnails(urls)
      return urls
    } catch (caughtError) {
      setError(describe(caughtError, 'Could not load the photo previews.'))
      return null
    }
  }, [])

  /**
   * Reads how well each photograph is focused, from the thumbnails the album
   * has already downloaded.
   *
   * Done here, on every album open, rather than stored at upload. Every
   * photograph that predates this feature carries no stored reading, and an
   * album that is already full is exactly the one with something to clean up —
   * so measuring only new uploads would help nobody who needs it. Four at a
   * time, because this is background work: the album is already on screen and
   * the advice appears underneath it a moment later.
   *
   * The bytes come through the Supabase client rather than by fetching the
   * signed URL the tiles are drawn from. An `<img>` may display a URL that
   * script is not allowed to read, so hand-fetching one is a way for every
   * measurement to fail while every photograph looks perfectly fine.
   */
  const measureFocus = useCallback(async (current: Photo[]) => {
    const measurable = current.filter((photo) => photo.storagePath)
    if (measurable.length === 0) return

    // Everything is inside the catch, including building the processor. A
    // failure out here used to leave the readings empty, which reads on screen
    // exactly like an album where every photograph is fine — the same silence
    // that made this feature undebuggable three times over.
    try {
      const processor = imageProcessor()

      const results = await mapWithConcurrency(measurable, 4, async (photo) => {
        const bytes = await photoBytes(photo.storagePath)

        // The blur reading goes to the worker; finding the faces cannot, and
        // has to happen here. Both read the same downloaded bytes, so the
        // second costs no extra round trip. Sequential rather than parallel
        // because they would otherwise decode the same photograph twice at
        // once, and a phone has only so much memory for bitmaps.
        const blur = await processor.measure(bytes)
        const faces = await findFacesIn(bytes)

        return { blur, faces }
      })

      setFocusReadings((known) => {
        const next = new Map(known)
        results.forEach((result, index) => {
          next.set(
            measurable[index].id,
            result.status === 'fulfilled'
              ? result.value.blur
              : { kind: 'failed', detail: describe(result.reason, 'the photo could not be read') },
          )
        })
        return next
      })

      setFaceReadings((known) => {
        const next = new Map(known)
        results.forEach((result, index) => {
          next.set(
            measurable[index].id,
            result.status === 'fulfilled'
              ? result.value.faces
              : { kind: 'unavailable', detail: describe(result.reason, 'the photo could not be read') },
          )
        })
        return next
      })
    } catch (caught) {
      const detail = describe(caught, 'the focus check could not run')
      setFocusReadings((known) => {
        const next = new Map(known)
        for (const photo of measurable) next.set(photo.id, { kind: 'failed', detail })
        return next
      })
      setFaceReadings((known) => {
        const next = new Map(known)
        for (const photo of measurable) next.set(photo.id, { kind: 'unavailable', detail })
        return next
      })
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
        if (!active) return

        // Deliberately not awaited: the album is drawable now, and the focus
        // advice is worth none of that wait.
        void measureFocus(loaded)
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
  }, [album.id, measureFocus, refreshThumbnails])

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
   * Removes the photographs the owner picked in either cleanup review.
   *
   * Sequential rather than parallel: each delete removes rows and then storage
   * objects, and a failure partway through should leave the rest of the album
   * alone rather than half-applied across several photographs at once.
   */
  async function handleRemoveChosen(chosen: Photo[]) {
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
  // The measured detail readings, for ranking the frames of one burst against
  // each other. Only meaningful inside a group, where the subject is the same
  // picture taken twice — which is exactly where this is used.
  const detailReadings = new Map(
    [...focusReadings].flatMap(([id, reading]) =>
      reading.kind === 'measured' && reading.texture !== null ? [[id, reading.texture]] : [],
    ),
  )

  const similarGroups = groupSimilar(photos, undefined, detailReadings)

  // Blurred photographs that no group already speaks for. Grouped ones are
  // handled a section above, where there is something to compare them against.
  const softPhotos = findSoftPhotos(photos, focusReadings, similarGroups)

  // Temporary, and said so in the interface: the softest reading is the one
  // number that would settle whether the threshold is wrong, and it is only
  // obtainable from a real album. It comes out once that is settled.
  const focusSummary = summariseFocus(photos, focusReadings)

  // Temporary, with the line below. The one question this round exists to
  // answer: does the detector find the people in her album at all?
  const faceSummary = summariseFaces(photos, faceReadings)

  /**
   * One reading per photograph, for the tile it belongs to.
   *
   * Temporary, with the tuning line below. A sorted list of readings cannot
   * answer the only question that matters — what does the blurred one read? —
   * because it does not say which picture each number came from.
   */
  const focusNotes = useMemo(() => {
    const notes = new Map<string, string>()

    for (const photo of photos) {
      const reading = focusReadings.get(photo.id)
      if (!reading) continue

      const blur =
        reading.kind === 'measured'
          ? (reading.blur?.toFixed(2) ?? 'no reading')
          : reading.kind === 'unjudgeable'
            ? 'no edges'
            : 'unread'

      // Which photograph each outcome belongs to is the whole value of this
      // badge: a list of results that does not say which picture it came from
      // cannot answer "did it find my son?".
      const face = faceReadings.get(photo.id)
      const who =
        face === undefined
          ? ''
          : face.kind === 'faces'
            ? ` · ${face.boxes.length === 1 ? 'face' : `${face.boxes.length} faces`}`
            : face.kind === 'none'
              ? ' · no face'
              : ' · no detector'

      notes.set(photo.id, `${blur}${who}`)
    }

    return notes
  }, [photos, focusReadings, faceReadings])

  const storyCounts = new Map<string, number>()
  for (const story of stories) {
    storyCounts.set(story.photoId, (storyCounts.get(story.photoId) ?? 0) + 1)
  }

  return (
    <>
      <PhotoUploader
        items={items}
        busy={busy}
        filled={photos.length > 0}
        onFiles={handleFiles}
        onDismiss={() => setItems([])}
      />

      {error && <p className="form-message error" role="alert">{error}</p>}

      <section className="album-canvas" aria-labelledby="album-photos-title">
        {loading ? (
          <p className="library-status" aria-live="polite">Opening this album…</p>
        ) : photos.length === 0 ? (
          <>
            <LayoutPreview />
            <div className="album-empty-copy">
              <h2 id="album-photos-title">No photos yet</h2>
              <p>This is how your photographs will be arranged. Choose some above to fill it.</p>
            </div>
          </>
        ) : (
          <>
            <h2 className="visually-hidden" id="album-photos-title">
              {photos.length === 1 ? '1 photo' : `${photos.length} photos`}
            </h2>
            <p className="album-hint">Choose a photo to add a caption, a story, or alt text.</p>
            <PhotoGallery
              photos={photos}
              thumbnails={thumbnails}
              storyCounts={storyCounts}
              coverPhotoId={album.coverPhotoId}
              selectedId={selectedId}
              onSelect={(photoId) =>
                setSelectedId((current) => (current === photoId ? null : photoId))
              }
              focusNotes={focusNotes}
            />
            <SimilarPhotos
              groups={similarGroups}
              thumbnails={thumbnails}
              readings={detailReadings}
              onRemove={handleRemoveChosen}
            />
            <SoftPhotos
              soft={softPhotos}
              thumbnails={thumbnails}
              onRemove={handleRemoveChosen}
            />

            {focusSummary.measured + focusSummary.failed + focusSummary.unjudgeable > 0 && (
              <p className="album-note focus-unchecked">
                <strong>Focus check:</strong> read {focusSummary.measured} of{' '}
                {focusSummary.total}
                {focusSummary.failed > 0 && `, could not read ${focusSummary.failed}`}
                {focusSummary.unjudgeable > 0 &&
                  `, too little contrast to judge ${focusSummary.unjudgeable}`}
                {focusSummary.readings.length > 0 &&
                  `. Readings ${focusSummary.readings.map((one) => one.toFixed(2)).join(', ')}`}
                {focusSummary.line !== null &&
                  ` — anything over ${focusSummary.line.toFixed(2)} is offered above`}
                . Each photograph shows how much of its detail survives being blurred again;
                higher is blurrier. This line is here while the setting is being tuned and will
                come out afterwards.
              </p>
            )}

            {faceSummary.withFaces + faceSummary.withoutFaces + faceSummary.unavailable > 0 && (
              <p className="album-note focus-unchecked">
                <strong>People:</strong> found someone in {faceSummary.withFaces} of{' '}
                {faceSummary.total}
                {faceSummary.withoutFaces > 0 &&
                  `, found nobody in ${faceSummary.withoutFaces}`}
                {faceSummary.unavailable > 0 &&
                  `, and the detector could not run on ${faceSummary.unavailable}`}
                {faceSummary.detail && ` (${faceSummary.detail})`}
                {faceSummary.confidences.length > 0 &&
                  `. How sure it was: ${faceSummary.confidences
                    .map((one) => one.toFixed(2))
                    .join(', ')}`}
                {faceSummary.smallestFace !== null &&
                  `. Smallest face found: ${(faceSummary.smallestFace * 100).toFixed(1)}% of
                   the frame's width — this stops working below about 2%`}
                . Nothing here is acted on yet — no photograph is offered or held back because
                of it. It is on screen to answer one question before anything is built on it:
                are the people in these photographs found at all? This line comes out either
                way.
              </p>
            )}

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
