import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ResetPasswordForm } from './ResetPasswordForm'

describe('ResetPasswordForm', () => {
  it('saves the chosen password', async () => {
    const onSetPassword = vi.fn().mockResolvedValue(undefined)

    render(<ResetPasswordForm onSetPassword={onSetPassword} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'a-new-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save password' }))

    await waitFor(() => expect(onSetPassword).toHaveBeenCalledWith('a-new-password'))
  })

  it('reveals the new password on demand', () => {
    render(<ResetPasswordForm onSetPassword={vi.fn()} onCancel={vi.fn()} />)
    const password = screen.getByLabelText('New password')
    expect(password).toHaveAttribute('type', 'password')

    fireEvent.click(screen.getByRole('button', { name: 'Show new password' }))
    expect(password).toHaveAttribute('type', 'text')
  })

  it('surfaces a rejected password and stays on the form', async () => {
    const onSetPassword = vi.fn().mockRejectedValue(new Error('Password is too short.'))

    render(<ResetPasswordForm onSetPassword={onSetPassword} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save password' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Password is too short.')
    expect(screen.getByRole('button', { name: 'Save password' })).toBeEnabled()
  })

  it('can be abandoned without setting a password', async () => {
    const onCancel = vi.fn().mockResolvedValue(undefined)

    render(<ResetPasswordForm onSetPassword={vi.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel and sign out' }))

    await waitFor(() => expect(onCancel).toHaveBeenCalled())
  })
})
