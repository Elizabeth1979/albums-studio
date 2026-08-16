import { type FormEvent, useState } from 'react'
import { ALBUM_LAYOUTS, type Album, type AlbumLayout, layoutLabel } from '../lib/albums'
import type { Identity } from '../lib/identity'
import { AppHeader } from './AppHeader'

type LibraryProps = {
  identity: Identity
  onSignOut: () => Promise<void>
  albums: Album[]
  loading: boolean
  error: string | null
  onCreateAlbum: (input: {
    title: string
    layout: AlbumLayout
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
  loading,
  error,
  onCreateAlbum,
  onOpenAlbum,
}: LibraryProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [layout, setLayout] = useState<AlbumLayout>('masonry')
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!title.trim()) {
      setFormError('Give the album a title.')
      return
    }

    setCreating(true)
    setFormError(null)

    try {
      await onCreateAlbum({ title, layout, description })
      setTitle('')
      setDescription('')
      setLayout('masonry')
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
          <span className="phase-badge">Albums ready</span>
        </div>

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

            <fieldset className="layout-choice">
              <legend>Layout</legend>
              {ALBUM_LAYOUTS.map((option) => (
                <label className="layout-option" key={option}>
                  <input
                    type="radio"
                    name="layout"
                    value={option}
                    checked={layout === option}
                    onChange={() => setLayout(option)}
                  />
                  <span>{layoutLabel(option)}</span>
                </label>
              ))}
            </fieldset>

            <button className="primary-button" type="submit" disabled={creating}>
              {creating ? 'Creating…' : 'Create album'}
            </button>
          </form>

          {formError && <p className="form-message error" role="alert">{formError}</p>}
        </section>

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
            <p>
              Name your first album above and choose how it should look. Photos come next.
            </p>
          </section>
        ) : (
          <section aria-labelledby="album-list-title">
            <h2 className="section-title" id="album-list-title">
              {albums.length === 1 ? '1 album' : `${albums.length} albums`}
            </h2>
            <ul className="album-list">
              {albums.map((album) => (
                <li className="album-card" key={album.id}>
                  <button
                    className="album-open"
                    type="button"
                    onClick={() => onOpenAlbum(album)}
                  >
                    <span className="album-title">{album.title}</span>
                    <span className="album-meta">
                      <span className="layout-badge">{layoutLabel(album.layout)}</span>
                      <span>{formatCreatedAt(album.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="trust-row" aria-label="Product principles">
          <article>
            <span aria-hidden="true">01</span>
            <div>
              <h2>Private first</h2>
              <p>Nothing is shared until you explicitly choose it.</p>
            </div>
          </article>
          <article>
            <span aria-hidden="true">02</span>
            <div>
              <h2>Human approved</h2>
              <p>AI can draft and suggest; you make the final call.</p>
            </div>
          </article>
          <article>
            <span aria-hidden="true">03</span>
            <div>
              <h2>Built for memory</h2>
              <p>Captions, stories, and accessible text stay editable.</p>
            </div>
          </article>
        </section>
      </main>
    </div>
  )
}
