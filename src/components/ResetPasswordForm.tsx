import { type FormEvent, useState } from 'react'
import { PasswordField } from './PasswordField'

type ResetPasswordFormProps = {
  onSetPassword: (password: string) => Promise<void>
  onCancel: () => Promise<void>
}

export function ResetPasswordForm({ onSetPassword, onCancel }: ResetPasswordFormProps) {
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError(null)

    try {
      await onSetPassword(password)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not set the password.')
      setPending(false)
    }
  }

  async function handleCancel() {
    setPending(true)
    setError(null)

    try {
      await onCancel()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not cancel.')
      setPending(false)
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-intro" aria-labelledby="intro-title">
        <a className="wordmark wordmark-light" href="/" aria-label="Albums Studio home">
          <span className="wordmark-mark" aria-hidden="true">AS</span>
          Albums Studio
        </a>
        <div className="auth-intro-copy">
          <p className="eyebrow eyebrow-light">Almost there</p>
          <h1 id="intro-title">Choose a new password.</h1>
          <p>
            This link signed you in once so you can set a new password. Reveal it before
            saving if you want to be certain of what you typed.
          </p>
        </div>
        <p className="auth-principle">Private by default · AI drafts stay editable</p>
      </section>

      <section className="auth-panel" aria-labelledby="reset-title">
        <div className="auth-card">
          <p className="eyebrow">Your private studio</p>
          <h2 id="reset-title">Set a new password</h2>
          <p className="auth-subtitle">
            Your next sign-in will use this password.
          </p>

          <form className="auth-form" onSubmit={handleSubmit}>
            <PasswordField
              id="new-password"
              label="New password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              revealLabel="new password"
              hint="Use at least 6 characters."
            />

            {error && <p className="form-message error" role="alert">{error}</p>}

            <button className="primary-button" type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save password'}
            </button>

            <button
              className="secondary-button"
              type="button"
              onClick={handleCancel}
              disabled={pending}
            >
              Cancel and sign out
            </button>
          </form>
        </div>
      </section>
    </main>
  )
}
