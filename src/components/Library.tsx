import { type FormEvent, useState } from 'react'
import type { Album } from '../lib/albums'
import type { Identity } from '../lib/identity'
import { AppHeader } from './AppHeader'

type LibraryProps = {
  identity: Identity
  onSignOut: () => Promise<void>
  albums: Album[]
  /** Signed cover thumbnails by photo id; absent while they are being minted. */
  covers: Map<string, string>
  loading: boolean
  error: string | null
  onCreateAlbum: (input: {
    title: string
    description: string
  }) => Promise<void>
  onOpenAlbum: (album: Album) => void
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

function formatCreatedAt(value: string): string {
  const created = new Date(value)

  return Number.isNaN(created.getTime()) ? '' : dateFormatter.format(created)
}

export function Library({
  identity,
  onSignOut,
  albums,
  covers,
  loading,
  error,
  onCreateAlbum,
  onOpenAlbum,
}: LibraryProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  // Closed by default: the albums are what this page is for, and an always-open
  // form pushed them past the bottom of a phone screen.
  const [composing, setComposing] = useState(false)
  const [created, setCreated] = useState<string | null>(null)

  function startComposing() {
    setFormError(null)
    setCreated(null)
    setComposing(true)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!title.trim()) {
      setFormError('Give the album a title.')
      return
    }

    setCreating(true)
    setFormError(null)

    try {
      await onCreateAlbum({ title, description })
      setCreated(title.trim())
      setTitle('')
      setDescription('')
      setComposing(false)
    } catch (caughtError) {
      setFormError(
        caughtError instanceof Error ? caughtError.message : 'Could not create the album.',
      )
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="app-shell">
      <AppHeader identity={identity} onSignOut={onSignOut} />

      <main className="library-main">
        <div className="library-heading">
          <div>
            <p className="eyebrow">Private library</p>
            <h1>Your albums</h1>
            <p>Every story starts with a few photographs and the context only you know.</p>
          </div>
        </div>

        {created && (
          // Announced rather than only drawn: the form closes and the page
          // scrolls nowhere, so without this the only sign anything happened is
          // a new row further down that a phone may not have on screen.
          <p className="form-message success" role="status">
            Added <strong>{created}</strong> to your library.
          </p>
        )}

        {!composing ? (
          // An empty library carries its own invitation, and two buttons that
          // do the same thing on one screen is clutter rather than choice.
          !loading && albums.length === 0 ? null : (
            <div className="library-actions">
              <button className="primary-button" type="button" onClick={startComposing}>
                New album
              </button>
            </div>
          )
        ) : (
        <section className="new-album" aria-labelledby="new-album-title">
          <h2 id="new-album-title">Start an album</h2>
          <form className="new-album-form" onSubmit={handleSubmit}>
            <label htmlFor="album-title">
              <span>Album title</span>
              <input
                id="album-title"
                name="album-title"
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={120}
                placeholder="Summer by the lake"
                autoFocus
                required
              />
            </label>

            <label htmlFor="album-description">
              <span>Description <em>(optional)</em></span>
              <textarea
                id="album-description"
                name="album-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={2000}
                rows={3}
                placeholder="What is this album about?"
              />
            </label>

            <div className="new-album-actions">
              <button className="primary-button" type="submit" disabled={creating}>
                {creating ? 'Creating…' : 'Create album'}
              </button>
              <button
                className="text-button"
                type="button"
                disabled={creating}
                onClick={() => setComposing(false)}
              >
                Cancel
              </button>
            </div>
          </form>

          {formError && <p className="form-message error" role="alert">{formError}</p>}
        </section>
        )}

        {error && <p className="form-message error" role="alert">{error}</p>}

        {loading ? (
          <p className="library-status" aria-live="polite">Opening your library…</p>
        ) : albums.length === 0 ? (
          <section className="empty-library" aria-labelledby="empty-title">
            <div className="empty-art" aria-hidden="true">
              <span className="photo-card card-one" />
              <span className="photo-card card-two" />
              <span className="photo-card card-three" />
            </div>
            <p className="eyebrow">A quiet beginning</p>
            <h2 id="empty-title">No albums yet</h2>
            <p>Name it, choose how it should look, and photos come next.</p>
            <button className="primary-button" type="button" onClick={startComposing}>
              Start your first album
            </button>
          </section>
        ) : (
          <section aria-labelledby="album-list-title">
            <h2 className="section-title" id="album-list-title">
              {albums.length === 1 ? '1 album' : `${albums.length} albums`}
            </h2>
            <ul className="album-list">
              {albums.map((album) => {
                const cover = album.coverPhotoId ? covers.get(album.coverPhotoId) : undefined

                return (
                <li className="album-card" key={album.id}>
                  <button
                    className="album-open"
                    type="button"
                    onClick={() => onOpenAlbum(album)}
                  >
                    {cover ? (
                      <img
                        className="album-cover"
                        src={cover}
                        // The title sits beside the picture in the same button,
                        // so describing the cover again would make a screen
                        // reader announce the album twice.
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <span className="album-cover empty" aria-hidden="true" />
                    )}
                    <span className="album-title">{album.title}</span>
                    <span className="album-meta">
                      <span>{formatCreatedAt(album.createdAt)}</span>
                    </span>
                  </button>
                </li>
                )
              })}
            </ul>
          </section>
        )}
      </main>
    </div>
  )
}
