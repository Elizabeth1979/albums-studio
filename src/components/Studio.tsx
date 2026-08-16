import { useCallback, useEffect, useState } from 'react'
import {
  type Album,
  type AlbumLayout,
  createAlbum,
  deleteAlbum,
  listAlbums,
  renameAlbum,
  setAlbumLayout,
} from '../lib/albums'
import type { Identity } from '../lib/identity'
import { AlbumPage } from './AlbumPage'
import { Library } from './Library'

type StudioProps = {
  identity: Identity
  onSignOut: () => Promise<void>
}

function describe(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function Studio({ identity, onSignOut }: StudioProps) {
  const [albums, setAlbums] = useState<Album[]>([])
  const [openAlbumId, setOpenAlbumId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  async function handleCreate(input: { title: string; layout: AlbumLayout }) {
    const album = await createAlbum(input)
    setAlbums((current) => [album, ...current])
  }

  function replace(album: Album) {
    setAlbums((current) => current.map((item) => (item.id === album.id ? album : item)))
  }

  // Reading from state rather than holding the album itself keeps an open album
  // in step with edits, and resolves to undefined once it is deleted.
  const openAlbum = albums.find((album) => album.id === openAlbumId)

  if (openAlbum) {
    return (
      <AlbumPage
        identity={identity}
        onSignOut={onSignOut}
        album={openAlbum}
        onBack={() => setOpenAlbumId(null)}
        onRename={async (title) => replace(await renameAlbum(openAlbum.id, title))}
        onChangeLayout={async (layout) => replace(await setAlbumLayout(openAlbum.id, layout))}
        onDelete={async () => {
          await deleteAlbum(openAlbum.id)
          setAlbums((current) => current.filter((album) => album.id !== openAlbum.id))
          setOpenAlbumId(null)
        }}
      />
    )
  }

  return (
    <Library
      identity={identity}
      onSignOut={onSignOut}
      albums={albums}
      loading={loading}
      error={error}
      onCreateAlbum={handleCreate}
      onOpenAlbum={(album) => setOpenAlbumId(album.id)}
    />
  )
}
