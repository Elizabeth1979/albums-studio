import { useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import {
  type Album,
  type AlbumLayout,
  createAlbum,
  deleteAlbum,
  listAlbums,
  renameAlbum,
  updateAlbumDetails,
} from '../lib/albums'
import type { Identity } from '../lib/identity'
import { AlbumPage } from './AlbumPage'
import { AppHeader } from './AppHeader'
import { Library } from './Library'

type StudioProps = {
  identity: Identity
  onSignOut: () => Promise<void>
}

function describe(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

type AlbumRouteProps = {
  identity: Identity
  onSignOut: () => Promise<void>
  albums: Album[]
  loading: boolean
  onRename: (album: Album, title: string) => Promise<void>
  onChangeLayout: (album: Album, layout: AlbumLayout) => Promise<void>
  onChangeDescription: (album: Album, description: string) => Promise<void>
  onDelete: (album: Album) => Promise<void>
}

/**
 * Albums are addressed by slug rather than id: the slug survives a rename, so a
 * URL kept open in another tab stays valid.
 */
function AlbumRoute({
  identity,
  onSignOut,
  albums,
  loading,
  onRename,
  onChangeLayout,
  onChangeDescription,
  onDelete,
}: AlbumRouteProps) {
  const { slug } = useParams()
  const navigate = useNavigate()
  const album = albums.find((candidate) => candidate.slug === slug)

  if (album) {
    return (
      <AlbumPage
        identity={identity}
        onSignOut={onSignOut}
        album={album}
        onBack={() => navigate('/')}
        onRename={(title) => onRename(album, title)}
        onChangeLayout={(layout) => onChangeLayout(album, layout)}
        onChangeDescription={(description) => onChangeDescription(album, description)}
        onDelete={() => onDelete(album)}
      />
    )
  }

  return (
    <div className="app-shell">
      <AppHeader identity={identity} onSignOut={onSignOut} />
      <main className="album-main">
        {loading ? (
          <p className="library-status" aria-live="polite">Opening your album…</p>
        ) : (
          <>
            <h1>Album not found</h1>
            <p className="layout-hint">
              This album may have been deleted, or the address may be mistyped.
            </p>
            <button className="secondary-button" type="button" onClick={() => navigate('/')}>
              Back to your albums
            </button>
          </>
        )}
      </main>
    </div>
  )
}

export function Studio({ identity, onSignOut }: StudioProps) {
  const [albums, setAlbums] = useState<Album[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const load = useCallback(async () => {
    setLoading(true)

    try {
      setAlbums(await listAlbums())
      setError(null)
    } catch (caughtError) {
      setError(describe(caughtError, 'Could not load your albums.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function replace(album: Album) {
    setAlbums((current) => current.map((item) => (item.id === album.id ? album : item)))
  }

  async function handleCreate(input: {
    title: string
    layout: AlbumLayout
    description: string
  }) {
    const album = await createAlbum(input)
    setAlbums((current) => [album, ...current])
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          <Library
            identity={identity}
            onSignOut={onSignOut}
            albums={albums}
            loading={loading}
            error={error}
            onCreateAlbum={handleCreate}
            onOpenAlbum={(album) => navigate(`/albums/${encodeURIComponent(album.slug)}`)}
          />
        }
      />
      <Route
        path="/albums/:slug"
        element={
          <AlbumRoute
            identity={identity}
            onSignOut={onSignOut}
            albums={albums}
            loading={loading}
            onRename={async (album, title) => replace(await renameAlbum(album.id, title))}
            onChangeLayout={async (album, layout) =>
              replace(await updateAlbumDetails(album.id, { layout }))
            }
            onChangeDescription={async (album, description) =>
              replace(await updateAlbumDetails(album.id, { description }))
            }
            onDelete={async (album) => {
              await deleteAlbum(album.id)
              setAlbums((current) => current.filter((item) => item.id !== album.id))
              navigate('/')
            }}
          />
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
