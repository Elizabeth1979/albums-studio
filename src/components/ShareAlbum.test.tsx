import { type ComponentProps } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ShareAlbum } from './ShareAlbum'

const { sharingApi } = vi.hoisted(() => ({
  sharingApi: {
    albumShareToken: vi.fn(),
    rotateShareToken: vi.fn(),
    shareUrl: vi.fn((token: string) => `https://albums.example/shared/${token}`),
  },
}))

vi.mock('../lib/sharing', () => sharingApi)

function renderShare(props: Partial<ComponentProps<typeof ShareAlbum>> = {}) {
  const onChangeVisibility = vi.fn().mockResolvedValue(undefined)

  const result = render(
    <ShareAlbum
      albumId="album-1"
      visibility="private"
      onChangeVisibility={onChangeVisibility}
      {...props}
    />,
  )

  return { ...result, onChangeVisibility }
}

beforeEach(() => {
  vi.clearAllMocks()
  sharingApi.albumShareToken.mockResolvedValue('the-token')
  sharingApi.rotateShareToken.mockResolvedValue('a-fresh-token')
  sharingApi.shareUrl.mockImplementation((token: string) => `https://albums.example/shared/${token}`)
})

describe('deciding who can open an album', () => {
  it('starts private, and says what that means', () => {
    renderShare()

    expect(screen.getByRole('radio', { name: /Only me/ })).toBeChecked()
    expect(screen.getByText(/Nobody else can open it/)).toBeInTheDocument()
  })

  it('asks for no token while the album is private', () => {
    // A token is a credential. There is no reason for one to be sitting in the
    // page of an album nobody can open.
    renderShare()

    expect(sharingApi.albumShareToken).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('The link')).not.toBeInTheDocument()
  })

  it('starts sharing when asked', async () => {
    const { onChangeVisibility } = renderShare()

    fireEvent.click(screen.getByRole('radio', { name: /Anyone with the link/ }))

    await waitFor(() => expect(onChangeVisibility).toHaveBeenCalledWith('link'))
  })

  it('stops sharing when asked', async () => {
    const { onChangeVisibility } = renderShare({ visibility: 'link' })

    fireEvent.click(screen.getByRole('radio', { name: /Only me/ }))

    await waitFor(() => expect(onChangeVisibility).toHaveBeenCalledWith('private'))
  })

  it('offers nothing beyond a link, deliberately', () => {
    // The database enum also holds `public`. A link is unguessable and can be
    // withdrawn; `public` invites indexing and cannot really be taken back.
    renderShare({ visibility: 'link' })

    expect(screen.getAllByRole('radio')).toHaveLength(2)
    expect(screen.queryByRole('radio', { name: /public/i })).not.toBeInTheDocument()
  })
})

describe('the link itself', () => {
  it('shows the address once the album is shared', async () => {
    renderShare({ visibility: 'link' })

    await waitFor(() =>
      expect(screen.getByLabelText('The link')).toHaveValue(
        'https://albums.example/shared/the-token',
      ),
    )
  })

  it('copies it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    renderShare({ visibility: 'link' })
    await screen.findByDisplayValue(/the-token/)

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('https://albums.example/shared/the-token'),
    )
    expect(await screen.findByText('Copied.')).toBeInTheDocument()
  })

  it('never replaces the link on a single click', async () => {
    renderShare({ visibility: 'link' })
    await screen.findByDisplayValue(/the-token/)

    fireEvent.click(screen.getByRole('button', { name: 'Replace this link' }))

    expect(sharingApi.rotateShareToken).not.toHaveBeenCalled()
    expect(screen.getByText(/Every link you have already sent stops working/)).toBeInTheDocument()
  })

  it('replaces it once confirmed, and shows the new one', async () => {
    renderShare({ visibility: 'link' })
    await screen.findByDisplayValue(/the-token/)

    fireEvent.click(screen.getByRole('button', { name: 'Replace this link' }))
    fireEvent.click(screen.getByRole('button', { name: 'Replace the link' }))

    await waitFor(() =>
      expect(screen.getByLabelText('The link')).toHaveValue(
        'https://albums.example/shared/a-fresh-token',
      ),
    )
  })

  it('backs out of replacing it', async () => {
    renderShare({ visibility: 'link' })
    await screen.findByDisplayValue(/the-token/)

    fireEvent.click(screen.getByRole('button', { name: 'Replace this link' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }))

    expect(sharingApi.rotateShareToken).not.toHaveBeenCalled()
  })

  it('reports a refused change rather than looking like it worked', async () => {
    const onChangeVisibility = vi.fn().mockRejectedValue(new Error('permission denied'))
    renderShare({ onChangeVisibility })

    fireEvent.click(screen.getByRole('radio', { name: /Anyone with the link/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('permission denied')
  })
})
