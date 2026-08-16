import { type ComponentProps } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AuthForm } from './AuthForm'

function renderAuthForm(props: Partial<ComponentProps<typeof AuthForm>> = {}) {
  return render(
    <AuthForm
      onSignIn={vi.fn()}
      onSignUp={vi.fn()}
      onMagicLink={vi.fn()}
      onResetRequest={vi.fn()}
      {...props}
    />,
  )
}

describe('AuthForm', () => {
  it('signs in with trimmed email credentials', async () => {
    const onSignIn = vi.fn().mockResolvedValue(undefined)

    renderAuthForm({ onSignIn })
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

    renderAuthForm({ onSignUp })
    fireEvent.click(screen.getByRole('button', { name: 'Show account creation form' }))
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Elizabeth' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'person@example.com' } })
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create private library' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Check your email')
  })

  it('sends a magic link to the trimmed email address', async () => {
    const onMagicLink = vi.fn().mockResolvedValue(undefined)

    renderAuthForm({ onMagicLink })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: ' person@example.com ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Email me a magic link' }))

    await waitFor(() => expect(onMagicLink).toHaveBeenCalledWith('person@example.com'))
    expect(screen.getByRole('status')).toHaveTextContent('one-time sign-in link')
  })

  it('requests a password reset for the trimmed email address', async () => {
    const onResetRequest = vi.fn().mockResolvedValue(undefined)

    renderAuthForm({ onResetRequest })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: ' person@example.com ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))

    await waitFor(() => expect(onResetRequest).toHaveBeenCalledWith('person@example.com'))
    expect(screen.getByRole('status')).toHaveTextContent('choose a new password')
  })

  it('does not reveal whether an address has an account', async () => {
    renderAuthForm({ onResetRequest: vi.fn().mockResolvedValue(undefined) })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'nobody@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))

    expect(await screen.findByRole('status')).toHaveTextContent('If that address has an account')
  })

  it('asks for an email before requesting a reset', async () => {
    const onResetRequest = vi.fn()

    renderAuthForm({ onResetRequest })
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter your email first.')
    expect(onResetRequest).not.toHaveBeenCalled()
  })

  it('offers the reset request only when signing in', () => {
    renderAuthForm()
    expect(screen.getByRole('button', { name: 'Forgot password?' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show account creation form' }))
    expect(screen.queryByRole('button', { name: 'Forgot password?' })).not.toBeInTheDocument()
  })

  it('reveals and re-hides the password on demand', () => {
    renderAuthForm()
    const password = screen.getByLabelText('Password')
    expect(password).toHaveAttribute('type', 'password')

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(password).toHaveAttribute('type', 'text')

    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(password).toHaveAttribute('type', 'password')
  })

  it('re-hides a revealed password when the mode changes', () => {
    renderAuthForm()
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text')

    fireEvent.click(screen.getByRole('button', { name: 'Show account creation form' }))
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute('type', 'password')
  })

  it('does not impose a browser-side password length rule', () => {
    renderAuthForm()
    expect(screen.getByLabelText('Password')).not.toHaveAttribute('minlength')
  })
})
