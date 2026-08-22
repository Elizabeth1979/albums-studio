import { type FormEvent, useState } from 'react'
import type { Album, AlbumVisibility } from '../lib/albums'
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
            <div className="album-title-row">
              <h1>{album.title}</h1>
              <button className="text-button" type="button" onClick={startRenaming}>
                Rename album
              </button>
            </div>
          )}
        </div>

        {/* Part of the heading, not a control block of its own. A description
            is what the album is about, so it belongs under the title with the
            spacing of a subtitle rather than a section's worth of air. */}
        <section className="album-summary" aria-labelledby="description-title">
          <h2 className="visually-hidden" id="description-title">Description</h2>
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
            <p className="album-description">
              <span>{album.description || 'No description yet.'}</span>{' '}
              <button className="text-button" type="button" onClick={startDescribing}>
                {album.description ? 'Edit description' : 'Add a description'}
              </button>
            </p>
          )}
        </section>

        {error && <p className="form-message error" role="alert">{error}</p>}

        <AlbumPhotos album={album} onCoverChosen={onCoverChosen} />

        {/* After the album, not before it. Sharing is what you do once the
            photographs are in, and above them it stood between the owner and
            the thing they came to work on. */}
        <ShareAlbum
          albumId={album.id}
          visibility={album.visibility}
          onChangeVisibility={onChangeVisibility}
        />

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
