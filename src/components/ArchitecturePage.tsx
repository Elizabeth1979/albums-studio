import { useEffect, useState } from 'react'
import { type ArchitectureResult, loadArchitecture } from '../lib/architecture'
import type { Identity } from '../lib/identity'
import { AppHeader } from './AppHeader'

type ArchitecturePageProps = {
  identity: Identity
  onSignOut: () => Promise<void>
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | ArchitectureResult

/**
 * The architecture map, for the account it belongs to.
 *
 * The markup is fetched rather than imported: it is not part of this bundle,
 * and a browser that is not signed in as the right account never receives it.
 * What comes back is dropped into a sandboxed frame, so a document written
 * elsewhere cannot reach into this application even though it is trusted today.
 */
export function ArchitecturePage({ identity, onSignOut }: ArchitecturePageProps) {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let active = true

    loadArchitecture()
      .then((result) => {
        if (active) setState(result)
      })
      .catch((caught: unknown) => {
        if (active) {
          setState({
            status: 'error',
            message:
              caught instanceof Error
                ? caught.message
                : 'The architecture map could not be loaded.',
          })
        }
      })

    return () => {
      active = false
    }
  }, [])

  return (
    <>
      <AppHeader identity={identity} onSignOut={onSignOut} />
      <main className="architecture-main">
        {state.status === 'loading' && <p className="architecture-note">Loading the map…</p>}

        {state.status === 'forbidden' && (
          <div className="architecture-note">
            <h1>{state.message}</h1>
            <p>
              The architecture map is served to one account. Nothing is wrong with this
              one; it is simply not that account.
            </p>
          </div>
        )}

        {state.status === 'error' && (
          <div className="architecture-note">
            <h1>{state.message}</h1>
            <p>
              If this keeps happening, check that <code>ARCHITECTURE_ADMIN_ID</code> is set
              on the Supabase project and that the function is deployed.
            </p>
          </div>
        )}

        {state.status === 'ready' && (
          // No `allow-same-origin`: the frame gets an opaque origin, so its
          // scripts can render the diagrams and touch nothing else — not this
          // page, not the session, not storage.
          <iframe
            className="architecture-frame"
            title="Albums Studio architecture"
            sandbox="allow-scripts"
            srcDoc={state.page}
          />
        )}
      </main>
    </>
  )
}
