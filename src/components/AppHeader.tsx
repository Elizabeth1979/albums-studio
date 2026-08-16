import { useState } from 'react'
import type { Identity } from '../lib/identity'

type AppHeaderProps = {
  identity: Identity
  onSignOut: () => Promise<void>
}

export function AppHeader({ identity, onSignOut }: AppHeaderProps) {
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSignOut() {
    setSigningOut(true)
    setError(null)

    try {
      await onSignOut()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not sign out.')
      setSigningOut(false)
    }
  }

  return (
    <>
      <header className="app-header">
        <a className="wordmark" href="/" aria-label="Albums Studio home">
          <span className="wordmark-mark" aria-hidden="true">AS</span>
          Albums Studio
        </a>
        <div className="account-actions">
          <span className="account-email">{identity.email}</span>
          <button
            className="text-button"
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </header>
      {error && <p className="form-message error" role="alert">{error}</p>}
    </>
  )
}
