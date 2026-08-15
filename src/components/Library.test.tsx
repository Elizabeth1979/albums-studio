import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Library } from './Library'

describe('Library', () => {
  it('renders the protected empty state and signs out', async () => {
    const onSignOut = vi.fn().mockResolvedValue(undefined)

    render(
      <Library
        identity={{ email: 'person@example.com' }}
        onSignOut={onSignOut}
      />,
    )

    expect(screen.getByRole('heading', { name: 'No albums yet' })).toBeInTheDocument()
    expect(screen.getByText('person@example.com')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(onSignOut).toHaveBeenCalledOnce())
  })
})
