import { useState } from 'react'
import { AI_COST_PANEL_ENABLED } from '../lib/aiCosts'
import type { Identity } from '../lib/identity'
import { useAiCostPanel } from './AiCostPanel'

type AppHeaderProps = {
  identity: Identity
  onSignOut: () => Promise<void>
}

export function AppHeader({ identity, onSignOut }: AppHeaderProps) {
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const costs = useAiCostPanel()

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
          {/* One row on a phone too: a third stacked line pushed the album below the fold. */}
          <div className="account-buttons">
            {AI_COST_PANEL_ENABLED && costs.button}
            <button
              className="chip-button"
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
            >
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      </header>
      {AI_COST_PANEL_ENABLED && costs.panel}
      {error && <p className="form-message error" role="alert">{error}</p>}
    </>
  )
}
