import { useEffect, useState } from 'react'
import { AuthCredentials, AuthForm } from './components/AuthForm'
import { Identity, Library } from './components/Library'
import { supabase } from './lib/supabase'

type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; identity: Identity }

async function getIdentity(): Promise<Identity | null> {
  const { data, error } = await supabase.auth.getClaims()

  if (error || !data?.claims.sub) {
    return null
  }

  return {
    email: typeof data.claims.email === 'string' ? data.claims.email : 'Signed-in account',
  }
}

export default function App() {
  const [authState, setAuthState] = useState<AuthState>({ status: 'loading' })

  useEffect(() => {
    let active = true
    let refreshTimer: number | undefined

    async function refreshIdentity() {
      const identity = await getIdentity()
      if (active) {
        setAuthState(identity ? { status: 'signed-in', identity } : { status: 'signed-out' })
      }
    }

    void refreshIdentity()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => void refreshIdentity(), 0)
    })

    return () => {
      active = false
      window.clearTimeout(refreshTimer)
      subscription.unsubscribe()
    }
  }, [])

  async function signIn({ email, password }: AuthCredentials) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function signUp({ displayName, email, password }: AuthCredentials) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
        emailRedirectTo: window.location.origin,
      },
    })
    if (error) throw error
    return data.session ? ('signed-in' as const) : ('confirm-email' as const)
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  if (authState.status === 'loading') {
    return (
      <main className="loading-screen" aria-live="polite">
        <span className="loading-mark" aria-hidden="true">AS</span>
        <p>Opening your studio…</p>
      </main>
    )
  }

  if (authState.status === 'signed-out') {
    return <AuthForm onSignIn={signIn} onSignUp={signUp} />
  }

  return <Library identity={authState.identity} onSignOut={signOut} />
}
