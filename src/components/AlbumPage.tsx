import { type FormEvent, useState } from 'react'
import {
  ALBUM_LAYOUTS,
  type Album,
  type AlbumLayout,
  type AlbumVisibility,
  layoutLabel,
} from '../lib/albums'
import type { Identity } from '../lib/identity'
import { AlbumPhotos } from './AlbumPhotos'
import { ShareAlbum } from './ShareAlbum'
import { AppHeader } from './AppHeader'

type AlbumPageProps = {
  identity: Identity
  onSignOut: () => Promise<void>
  album: Album
  onBack: () => void
  onRename: (title: string) => Promise<void>
  onChangeLayout: (layout: AlbumLayout) => Promise<void>
  onChangeDescription: (description: string) => Promise<void>
  onDelete: () => Promise<void>
  onCoverChosen: (photoId: string) => Promise<void>
  onChangeVisibility: (visibility: AlbumVisibility) => Promise<void>
}

export function AlbumPage({
  identity,
  onSignOut,
  album,
  onBack,
  onRename,
  onChangeLayout,
  onChangeDescription,
  onDelete,
  onCoverChosen,
  onChangeVisibility,
}: AlbumPageProps) {
  const [renaming, setRenaming] = useState(false)
  const [title, setTitle] = useState(album.title)
  const [describing, setDescribing] = useState(false)
  const [description, setDescription] = useState(album.description ?? '')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<void>, fallback: string) {
    setPending(true)
    setError(null)

    try {
      await action()
      return true
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : fallback)
      return false
    } finally {
      setPending(false)
    }
  }

  function startRenaming() {
    setTitle(album.title)
    setError(null)
    setRenaming(true)
  }

  function startDescribing() {
    setDescription(album.description ?? '')
    setError(null)
    setDescribing(true)
  }

  async function handleDescription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const saved = await run(
      () => onChangeDescription(description),
      'Could not save the description.',
    )
    if (saved) setDescribing(false)
  }

  async function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!title.trim()) {
      setError('Give the album a title.')
      return
    }

    const renamed = await run(() => onRename(title), 'Could not rename the album.')
    if (renamed) setRenaming(false)
  }

  return (
    <div className="app-shell">
      <AppHeader identity={identity} onSignOut={onSignOut} />

      <main className="album-main">
        <button className="text-button back-link" type="button" onClick={onBack}>
          ← All albums
        </button>

        <div className="album-heading">
          {renaming ? (
            <form className="rename-form" onSubmit={handleRename}>
              <label htmlFor="rename-title">
                <span>Album title</span>
                <input
                  id="rename-title"
                  name="rename-title"
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={120}
                  autoFocus
                  required
                />
              </label>
              <div className="rename-actions">
                <button className="primary-button" type="submit" disabled={pending}>
                  {pending ? 'Saving…' : 'Save title'}
                </button>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => setRenaming(false)}
                  disabled={pending}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div>
              <p className="eyebrow">Album</p>
              <h1>{album.title}</h1>
              <button className="text-button" type="button" onClick={startRenaming}>
                Rename album
              </button>
            </div>
          )}
        </div>

        <section className="album-controls" aria-labelledby="description-title">
          <h2 id="description-title">Description</h2>
          {describing ? (
            <form className="rename-form" onSubmit={handleDescription}>
              <label htmlFor="album-description">
                <span>What is this album about?</span>
                <textarea
                  id="album-description"
                  name="album-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={2000}
                  rows={4}
                />
              </label>
              <div className="rename-actions">
                <button className="primary-button" type="submit" disabled={pending}>
                  {pending ? 'Saving…' : 'Save description'}
                </button>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => setDescribing(false)}
                  disabled={pending}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              <p className="layout-hint">
                {album.description || 'No description yet.'}
              </p>
              <button className="text-button" type="button" onClick={startDescribing}>
                {album.description ? 'Edit description' : 'Add a description'}
              </button>
            </>
          )}
        </section>

        <section className="album-controls" aria-labelledby="layout-title">
          <h2 id="layout-title">Layout</h2>
          <div className="layout-switch" role="group" aria-label="Album layout">
            {ALBUM_LAYOUTS.map((option) => (
              <button
                className={option === album.layout ? 'layout-button active' : 'layout-button'}
                type="button"
                key={option}
                aria-pressed={option === album.layout}
                disabled={pending}
                onClick={() =>
                  option !== album.layout &&
                  run(() => onChangeLayout(option), 'Could not change the layout.')
                }
              >
                {layoutLabel(option)}
              </button>
            ))}
          </div>
          <p className="layout-hint">
            {album.layout === 'masonry'
              ? 'Masonry keeps each photo’s own proportions, so tall and wide shots sit together.'
              : 'Grid crops to equal tiles, which stays scannable across a large batch.'}
          </p>
        </section>

        {error && <p className="form-message error" role="alert">{error}</p>}

        <ShareAlbum
          albumId={album.id}
          visibility={album.visibility}
          onChangeVisibility={onChangeVisibility}
        />

        <AlbumPhotos album={album} onCoverChosen={onCoverChosen} />

        <section className="danger-zone" aria-labelledby="danger-title">
          <h2 id="danger-title">Delete album</h2>
          {confirmingDelete ? (
            <>
              <p>
                Deleting <strong>{album.title}</strong> cannot be undone.
              </p>
              <div className="danger-actions">
                <button
                  className="danger-button"
                  type="button"
                  disabled={pending}
                  onClick={() => run(onDelete, 'Could not delete the album.')}
                >
                  {pending ? 'Deleting…' : 'Yes, delete this album'}
                </button>
                <button
                  className="text-button"
                  type="button"
                  disabled={pending}
                  onClick={() => setConfirmingDelete(false)}
                >
                  Keep it
                </button>
              </div>
            </>
          ) : (
            <>
              <p>Removes the album shell. Photos it holds go with it.</p>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setConfirmingDelete(true)}
              >
                Delete album
              </button>
            </>
          )}
        </section>
      </main>
    </div>
  )
}
