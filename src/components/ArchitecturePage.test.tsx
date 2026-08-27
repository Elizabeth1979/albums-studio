import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ArchitecturePage } from './ArchitecturePage'

const { architectureApi } = vi.hoisted(() => ({
  architectureApi: { loadArchitecture: vi.fn() },
}))

vi.mock('../lib/architecture', () => architectureApi)

const IDENTITY = { email: 'owner@example.com' }
const PAGE = '<!doctype html><html><body>the map</body></html>'

function renderPage() {
  return render(<ArchitecturePage identity={IDENTITY} onSignOut={vi.fn()} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  architectureApi.loadArchitecture.mockResolvedValue({ status: 'ready', page: PAGE })
})

describe('the architecture map on screen', () => {
  it('puts the served document in a frame that cannot reach this page', async () => {
    // Without `allow-same-origin` the frame runs on an opaque origin: its
    // scripts can draw the diagrams and touch nothing else. Granting it would
    // hand a whole document access to the signed-in session.
    renderPage()

    const frame = await screen.findByTitle('Albums Studio architecture')

    expect(frame).toHaveAttribute('sandbox', 'allow-scripts')
    expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin')
    expect(frame).toHaveAttribute('srcdoc', PAGE)
  })

  it('says plainly when the account is not the one the page belongs to', async () => {
    architectureApi.loadArchitecture.mockResolvedValue({
      status: 'forbidden',
      message: 'This page is not for this account.',
    })

    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'This page is not for this account.' }),
    ).toBeInTheDocument()
    expect(screen.queryByTitle('Albums Studio architecture')).not.toBeInTheDocument()
  })

  it('names the missing secret when the function has not been set up', async () => {
    architectureApi.loadArchitecture.mockRejectedValue(
      new Error('The architecture map could not be loaded (503).'),
    )

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('ARCHITECTURE_ADMIN_ID')).toBeInTheDocument()
    })
    expect(screen.queryByTitle('Albums Studio architecture')).not.toBeInTheDocument()
  })
})
