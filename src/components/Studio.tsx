import { useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import {
  type Album,
  type AlbumVisibility,
  createAlbum,
  deleteAlbum,
  listAlbums,
  renameAlbum,
  setAlbumCover,
  setAlbumVisibility,
  updateAlbumDetails,
} from '../lib/albums'
import type { Identity } from '../lib/identity'
import { thumbnailsByPhotoId } from '../lib/photos'
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
  onChangeDescription: (album: Album, description: string) => Promise<void>
  onDelete: (album: Album) => Promise<void>
  onCoverChosen: (album: Album, photoId: string) => Promise<void>
  onChangeVisibility: (album: Album, visibility: AlbumVisibility) => Promise<void>
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
  onChangeDescription,
  onDelete,
  onCoverChosen,
  onChangeVisibility,
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
        onChangeDescription={(description) => onChangeDescription(album, description)}
        onDelete={() => onDelete(album)}
        onCoverChosen={(photoId) => onCoverChosen(album, photoId)}
        onChangeVisibility={(visibility) => onChangeVisibility(album, visibility)}
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
            <p className="album-note">
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
  const [covers, setCovers] = useState<Map<string, string>>(new Map())
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

  // Keyed on the cover ids alone: renaming an album or editing its description
  // replaces the album object but leaves the pictures on the cards unchanged,
  // and re-signing them on every edit would be wasted round trips.
  const coverIds = albums
    .map((album) => album.coverPhotoId)
    .filter((id): id is string => Boolean(id))
    .join(',')

  useEffect(() => {
    let active = true
    const ids = coverIds ? coverIds.split(',') : []

    if (ids.length === 0) {
      setCovers(new Map())
      return
    }

    async function loadCovers() {
      try {
        const signed = await thumbnailsByPhotoId(ids)
        if (active) setCovers(signed)
      } catch {
        // A library that shows titles without pictures is still usable, so a
        // failure here stays quiet rather than replacing the album list with an
        // error the owner can do nothing about.
        if (active) setCovers(new Map())
      }
    }

    void loadCovers()

    return () => {
      active = false
    }
  }, [coverIds])

  function replace(album: Album) {
    setAlbums((current) => current.map((item) => (item.id === album.id ? album : item)))
  }

  async function handleCreate(input: {
    title: string
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
            covers={covers}
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
            onChangeDescription={async (album, description) =>
              replace(await updateAlbumDetails(album.id, { description }))
            }
            onCoverChosen={async (album, photoId) =>
              replace(await setAlbumCover(album.id, photoId))
            }
            onChangeVisibility={async (album, visibility) =>
              replace(await setAlbumVisibility(album.id, visibility))
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
