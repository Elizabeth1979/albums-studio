import { useState } from 'react'

export type Identity = {
  email: string
}

type LibraryProps = {
  identity: Identity
  onSignOut: () => Promise<void>
}

export function Library({ identity, onSignOut }: LibraryProps) {
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
    <div className="app-shell">
      <header className="app-header">
        <a className="wordmark" href="/" aria-label="Albums Studio home">
          <span className="wordmark-mark" aria-hidden="true">AS</span>
          Albums Studio
        </a>
        <div className="account-actions">
          <span className="account-email">{identity.email}</span>
          <button className="text-button" type="button" onClick={handleSignOut} disabled={signingOut}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </header>

      <main className="library-main">
        <div className="library-heading">
          <div>
            <p className="eyebrow">Private library</p>
            <h1>Your albums</h1>
            <p>Every story starts with a few photographs and the context only you know.</p>
          </div>
          <span className="phase-badge">Foundation ready</span>
        </div>

        {error && <p className="form-message error" role="alert">{error}</p>}

        <section className="empty-library" aria-labelledby="empty-title">
          <div className="empty-art" aria-hidden="true">
            <span className="photo-card card-one" />
            <span className="photo-card card-two" />
            <span className="photo-card card-three" />
          </div>
          <p className="eyebrow">A quiet beginning</p>
          <h2 id="empty-title">No albums yet</h2>
          <p>
            Your account and private library are ready. Album creation is the next verified
            checkpoint.
          </p>
        </section>

        <section className="trust-row" aria-label="Product principles">
          <article>
            <span aria-hidden="true">01</span>
            <div>
              <h2>Private first</h2>
              <p>Nothing is shared until you explicitly choose it.</p>
            </div>
          </article>
          <article>
            <span aria-hidden="true">02</span>
            <div>
              <h2>Human approved</h2>
              <p>AI can draft and suggest; you make the final call.</p>
            </div>
          </article>
          <article>
            <span aria-hidden="true">03</span>
            <div>
              <h2>Built for memory</h2>
              <p>Captions, stories, and accessible text stay editable.</p>
            </div>
          </article>
        </section>
      </main>
    </div>
  )
}
