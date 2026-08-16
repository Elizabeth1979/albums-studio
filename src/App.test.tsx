import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

type AuthEvent = 'INITIAL_SESSION' | 'SIGNED_IN' | 'SIGNED_OUT' | 'PASSWORD_RECOVERY'

const { auth, from } = vi.hoisted(() => ({
  // Studio loads albums as soon as the library renders; an empty list keeps
  // these tests about the auth state machine.
  from: vi.fn(() => ({
    select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
  })),
  auth: {
    getClaims: vi.fn(),
    onAuthStateChange: vi.fn(),
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    signInWithOtp: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    updateUser: vi.fn(),
    signOut: vi.fn(),
  },
}))

vi.mock('./lib/supabase', () => ({ supabase: { auth, from } }))

const SESSION = { data: { claims: { sub: 'user-1', email: 'person@example.com' } }, error: null }
const NO_SESSION = { data: null, error: null }

/** Fires the callback App registered with onAuthStateChange. */
let emitAuthEvent: (event: AuthEvent) => void

beforeEach(() => {
  vi.clearAllMocks()

  auth.getClaims.mockResolvedValue(NO_SESSION)
  auth.onAuthStateChange.mockImplementation((callback: (event: AuthEvent) => void) => {
    emitAuthEvent = (event) => act(() => callback(event))
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
  auth.resetPasswordForEmail.mockResolvedValue({ error: null })
  auth.signInWithOtp.mockResolvedValue({ error: null })
  auth.updateUser.mockResolvedValue({ error: null })
  auth.signOut.mockResolvedValue({ error: null })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('App', () => {
  it('shows the sign-in form when there is no session', async () => {
    render(<App />, { wrapper: MemoryRouter })
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  })

  it('shows the library when a session already exists', async () => {
    auth.getClaims.mockResolvedValue(SESSION)

    render(<App />, { wrapper: MemoryRouter })
    expect(await screen.findByRole('heading', { name: 'Your albums' })).toBeInTheDocument()
    expect(screen.getByText('person@example.com')).toBeInTheDocument()
  })

  it('asks for a new password after a recovery link', async () => {
    render(<App />, { wrapper: MemoryRouter })
    await screen.findByRole('heading', { name: 'Welcome back' })

    emitAuthEvent('PASSWORD_RECOVERY')

    expect(await screen.findByRole('heading', { name: 'Set a new password' })).toBeInTheDocument()
  })

  it('keeps the recovery screen when the recovery session resolves late', async () => {
    // A recovery link produces a valid session, so the identity lookup started
    // at mount can resolve *after* the recovery event and report a signed-in
    // user. That must not skip the set-a-new-password step.
    let resolveClaims: (value: typeof SESSION) => void = () => {}
    auth.getClaims.mockReturnValue(
      new Promise<typeof SESSION>((resolve) => {
        resolveClaims = resolve
      }),
    )

    render(<App />, { wrapper: MemoryRouter })
    emitAuthEvent('PASSWORD_RECOVERY')
    expect(await screen.findByRole('heading', { name: 'Set a new password' })).toBeInTheDocument()

    await act(async () => {
      resolveClaims(SESSION)
    })

    expect(screen.getByRole('heading', { name: 'Set a new password' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Your albums' })).not.toBeInTheDocument()
  })

  it('saves a new password and then opens the library', async () => {
    render(<App />, { wrapper: MemoryRouter })
    await screen.findByRole('heading', { name: 'Welcome back' })

    emitAuthEvent('PASSWORD_RECOVERY')
    await screen.findByRole('heading', { name: 'Set a new password' })

    auth.getClaims.mockResolvedValue(SESSION)
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'chosen-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save password' }))

    await waitFor(() => expect(auth.updateUser).toHaveBeenCalledWith({ password: 'chosen-password' }))
    expect(await screen.findByRole('heading', { name: 'Your albums' })).toBeInTheDocument()
  })

  it('returns to sign-in when recovery is cancelled', async () => {
    render(<App />, { wrapper: MemoryRouter })
    await screen.findByRole('heading', { name: 'Welcome back' })

    emitAuthEvent('PASSWORD_RECOVERY')
    await screen.findByRole('heading', { name: 'Set a new password' })

    fireEvent.click(screen.getByRole('button', { name: 'Cancel and sign out' }))

    await waitFor(() => expect(auth.signOut).toHaveBeenCalled())
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  })

  it('requests a reset link that returns to this origin', async () => {
    render(<App />, { wrapper: MemoryRouter })
    await screen.findByRole('heading', { name: 'Welcome back' })

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'person@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))

    await waitFor(() =>
      expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('person@example.com', {
        redirectTo: window.location.origin,
      }),
    )
  })

  it('never creates an account from a magic link request', async () => {
    render(<App />, { wrapper: MemoryRouter })
    await screen.findByRole('heading', { name: 'Welcome back' })

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'person@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Email me a magic link' }))

    await waitFor(() =>
      expect(auth.signInWithOtp).toHaveBeenCalledWith({
        email: 'person@example.com',
        options: {
          emailRedirectTo: window.location.origin,
          shouldCreateUser: false,
        },
      }),
    )
  })

  it('explains a rate-limited magic link instead of repeating Supabase', async () => {
    // Requesting a magic link moments after a reset email trips Supabase's
    // per-address email throttle; the raw reply names no cause.
    auth.signInWithOtp.mockResolvedValue({
      error: {
        message: 'For security purposes, you can only request this after 53 seconds.',
        code: 'over_email_send_rate_limit',
        status: 429,
      },
    })

    render(<App />, { wrapper: MemoryRouter })
    await screen.findByRole('heading', { name: 'Welcome back' })

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'person@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Email me a magic link' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many sign-in emails at once. You can ask for another in about 53 seconds.',
    )
  })

  it('explains a rate-limited reset request', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({
      error: { message: 'Email rate limit exceeded', status: 429 },
    })

    render(<App />, { wrapper: MemoryRouter })
    await screen.findByRole('heading', { name: 'Welcome back' })

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'person@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many sign-in emails at once. Wait a minute, then try again.',
    )
  })

  it('surfaces a rejected sign-in without leaving the form', async () => {
    auth.signInWithPassword.mockResolvedValue({
      error: new Error('Invalid login credentials'),
    })

    render(<App />, { wrapper: MemoryRouter })
    await screen.findByRole('heading', { name: 'Welcome back' })

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'person@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid login credentials')
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  })

  it('signs out from the library', async () => {
    auth.getClaims.mockResolvedValue(SESSION)

    render(<App />, { wrapper: MemoryRouter })
    await screen.findByRole('heading', { name: 'Your albums' })

    auth.getClaims.mockResolvedValue(NO_SESSION)
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    await waitFor(() => expect(auth.signOut).toHaveBeenCalled())
    emitAuthEvent('SIGNED_OUT')

    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  })
})
