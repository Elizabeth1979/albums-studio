import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AuthForm } from './AuthForm'

describe('AuthForm', () => {
  it('signs in with trimmed email credentials', async () => {
    const onSignIn = vi.fn().mockResolvedValue(undefined)

    render(<AuthForm onSignIn={onSignIn} onSignUp={vi.fn()} onMagicLink={vi.fn()} />)
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

    render(<AuthForm onSignIn={vi.fn()} onSignUp={onSignUp} onMagicLink={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Show account creation form' }))
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Elizabeth' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'person@example.com' } })
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create private library' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Check your email')
  })

  it('sends a magic link to the trimmed email address', async () => {
    const onMagicLink = vi.fn().mockResolvedValue(undefined)

    render(<AuthForm onSignIn={vi.fn()} onSignUp={vi.fn()} onMagicLink={onMagicLink} />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: ' person@example.com ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Email me a magic link' }))

    await waitFor(() => expect(onMagicLink).toHaveBeenCalledWith('person@example.com'))
    expect(screen.getByRole('status')).toHaveTextContent('one-time sign-in link')
  })

  it('reveals and re-hides the password on demand', () => {
    render(<AuthForm onSignIn={vi.fn()} onSignUp={vi.fn()} onMagicLink={vi.fn()} />)
    const password = screen.getByLabelText('Password')
    expect(password).toHaveAttribute('type', 'password')

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(password).toHaveAttribute('type', 'text')

    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(password).toHaveAttribute('type', 'password')
  })

  it('re-hides a revealed password when the mode changes', () => {
    render(<AuthForm onSignIn={vi.fn()} onSignUp={vi.fn()} onMagicLink={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text')

    fireEvent.click(screen.getByRole('button', { name: 'Show account creation form' }))
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute('type', 'password')
  })

  it('does not impose a browser-side password length rule', () => {
    render(<AuthForm onSignIn={vi.fn()} onSignUp={vi.fn()} onMagicLink={vi.fn()} />)
    expect(screen.getByLabelText('Password')).not.toHaveAttribute('minlength')
  })
})
