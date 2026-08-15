import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AuthForm } from './AuthForm'

describe('AuthForm', () => {
  it('signs in with trimmed email credentials', async () => {
    const onSignIn = vi.fn().mockResolvedValue(undefined)

    render(<AuthForm onSignIn={onSignIn} onSignUp={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: ' person@example.com ' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => {
      expect(onSignIn).toHaveBeenCalledWith({
        displayName: undefined,
        email: 'person@example.com',
        password: 'password123',
      })
    })
  })

  it('shows the confirmation instruction after sign-up', async () => {
    const onSignUp = vi.fn().mockResolvedValue('confirm-email')

    render(<AuthForm onSignIn={vi.fn()} onSignUp={onSignUp} />)
    fireEvent.click(screen.getByRole('button', { name: 'Show account creation form' }))
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Elizabeth' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'person@example.com' } })
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create private library' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Check your email')
  })
})
