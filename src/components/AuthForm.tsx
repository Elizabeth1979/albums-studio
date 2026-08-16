import { type FormEvent, useState } from 'react'
import { PasswordField } from './PasswordField'

export type AuthCredentials = {
  displayName?: string
  email: string
  password: string
}

type SignUpResult = 'signed-in' | 'confirm-email'

type AuthFormProps = {
  onSignIn: (credentials: AuthCredentials) => Promise<void>
  onSignUp: (credentials: AuthCredentials) => Promise<SignUpResult>
  onMagicLink: (email: string) => Promise<void>
  onResetRequest: (email: string) => Promise<void>
}

type Mode = 'sign-in' | 'sign-up'

/** Which control is awaiting a response, so only that control shows a busy label. */
type PendingAction = 'submit' | 'magic-link' | 'reset'

export function AuthForm({ onSignIn, onSignUp, onMagicLink, onResetRequest }: AuthFormProps) {
  const [mode, setMode] = useState<Mode>('sign-in')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  function changeMode(nextMode: Mode) {
    setMode(nextMode)
    setError(null)
    setNotice(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPendingAction('submit')
    setError(null)
    setNotice(null)

    const credentials = {
      displayName: displayName.trim() || undefined,
      email: email.trim(),
      password,
    }

    try {
      if (mode === 'sign-in') {
        await onSignIn(credentials)
      } else {
        const result = await onSignUp(credentials)
        if (result === 'confirm-email') {
          setNotice('Check your email to confirm your account, then return here to sign in.')
        }
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Authentication failed.')
    } finally {
      setPendingAction(null)
    }
  }

  async function runEmailAction(
    pending: PendingAction,
    action: (email: string) => Promise<void>,
    successNotice: string,
    failureMessage: string,
  ) {
    const trimmedEmail = email.trim()

    if (!trimmedEmail) {
      setError('Enter your email first.')
      return
    }

    setPendingAction(pending)
    setError(null)
    setNotice(null)

    try {
      await action(trimmedEmail)
      setNotice(successNotice)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : failureMessage)
    } finally {
      setPendingAction(null)
    }
  }

  function handleMagicLink() {
    return runEmailAction(
      'magic-link',
      onMagicLink,
      'We sent a one-time sign-in link. Check your email.',
      'Could not send the link.',
    )
  }

  function handleResetRequest() {
    return runEmailAction(
      'reset',
      onResetRequest,
      'If that address has an account, we sent a link to choose a new password.',
      'Could not send the reset link.',
    )
  }

  const isSignUp = mode === 'sign-up'
  const pending = pendingAction !== null

  return (
    <main className="auth-shell">
      <section className="auth-intro" aria-labelledby="intro-title">
        <a className="wordmark wordmark-light" href="/" aria-label="Albums Studio home">
          <span className="wordmark-mark" aria-hidden="true">AS</span>
          Albums Studio
        </a>
        <div className="auth-intro-copy">
          <p className="eyebrow eyebrow-light">Photos become stories</p>
          <h1 id="intro-title">Keep the moment. Shape the memory.</h1>
          <p>
            Bring photos and the context only you know. Albums Studio helps you create
            thoughtful albums while every edit, share, and final word stays yours.
          </p>
        </div>
        <p className="auth-principle">Private by default · AI drafts stay editable</p>
      </section>

      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-card">
          <p className="eyebrow">Your private studio</p>
          <h2 id="auth-title">{isSignUp ? 'Create your account' : 'Welcome back'}</h2>
          <p className="auth-subtitle">
            {isSignUp
              ? 'Start with a private library. You decide what gets shared.'
              : 'Sign in to continue building your albums.'}
          </p>

          <div className="auth-tabs" role="group" aria-label="Authentication method">
            <button
              className={mode === 'sign-in' ? 'auth-tab active' : 'auth-tab'}
              type="button"
              aria-label="Show sign-in form"
              aria-pressed={mode === 'sign-in'}
              onClick={() => changeMode('sign-in')}
            >
              Sign in
            </button>
            <button
              className={isSignUp ? 'auth-tab active' : 'auth-tab'}
              type="button"
              aria-label="Show account creation form"
              aria-pressed={isSignUp}
              onClick={() => changeMode('sign-up')}
            >
              Create account
            </button>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            {isSignUp && (
              <label>
                <span>Display name</span>
                <input
                  type="text"
                  name="displayName"
                  autoComplete="name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  maxLength={80}
                  required
                />
              </label>
            )}

            <label>
              <span>Email</span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>

            <PasswordField
              key={mode}
              id="password"
              label="Password"
              value={password}
              onChange={setPassword}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
            />

            {!isSignUp && (
              <div className="field-actions">
                <button
                  className="text-button"
                  type="button"
                  onClick={handleResetRequest}
                  disabled={pending}
                >
                  {pendingAction === 'reset' ? 'Sending…' : 'Forgot password?'}
                </button>
              </div>
            )}

            {error && <p className="form-message error" role="alert">{error}</p>}
            {notice && <p className="form-message notice" role="status">{notice}</p>}

            <button className="primary-button" type="submit" disabled={pending}>
              {pendingAction === 'submit'
                ? 'Please wait…'
                : isSignUp
                  ? 'Create private library'
                  : 'Sign in'}
            </button>

            {!isSignUp && (
              <button
                className="secondary-button"
                type="button"
                onClick={handleMagicLink}
                disabled={pending}
              >
                {pendingAction === 'magic-link' ? 'Sending…' : 'Email me a magic link'}
              </button>
            )}
          </form>
        </div>
      </section>
    </main>
  )
}
