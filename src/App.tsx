import { useEffect, useRef, useState } from 'react'
import { AuthCredentials, AuthForm } from './components/AuthForm'
import { ResetPasswordForm } from './components/ResetPasswordForm'
import { Studio } from './components/Studio'
import { describeAuthError } from './lib/authErrors'
import type { Identity } from './lib/identity'
import { supabase } from './lib/supabase'

type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'recovering' }
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
  // A recovery link produces a real session, so identity refreshes must not
  // route past the set-a-new-password step before it is finished.
  const recovering = useRef(false)

  useEffect(() => {
    let active = true
    let refreshTimer: number | undefined

    async function refreshIdentity() {
      const identity = await getIdentity()
      if (active && !recovering.current) {
        setAuthState(identity ? { status: 'signed-in', identity } : { status: 'signed-out' })
      }
    }

    void refreshIdentity()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      window.clearTimeout(refreshTimer)

      if (event === 'PASSWORD_RECOVERY') {
        recovering.current = true
        if (active) {
          setAuthState({ status: 'recovering' })
        }
        return
      }

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
    if (error) throw new Error(describeAuthError(error, 'Could not sign in.'))
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
    if (error) throw new Error(describeAuthError(error, 'Could not create the account.'))
    return data.session ? ('signed-in' as const) : ('confirm-email' as const)
  }

  async function requestPasswordReset(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    })
    if (error) throw new Error(describeAuthError(error, 'Could not send the reset link.'))
  }

  async function setNewPassword(password: string) {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw new Error(describeAuthError(error, 'Could not set the password.'))

    recovering.current = false
    const identity = await getIdentity()
    setAuthState(identity ? { status: 'signed-in', identity } : { status: 'signed-out' })
  }

  async function cancelRecovery() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error

    recovering.current = false
    setAuthState({ status: 'signed-out' })
  }

  async function sendMagicLink(email: string) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
        shouldCreateUser: false,
      },
    })
    if (error) throw new Error(describeAuthError(error, 'Could not send the link.'))
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

  if (authState.status === 'recovering') {
    return <ResetPasswordForm onSetPassword={setNewPassword} onCancel={cancelRecovery} />
  }

  if (authState.status === 'signed-out') {
    return (
      <AuthForm
        onSignIn={signIn}
        onSignUp={signUp}
        onMagicLink={sendMagicLink}
        onResetRequest={requestPasswordReset}
      />
    )
  }

  return <Studio identity={authState.identity} onSignOut={signOut} />
}
