import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { ARCHITECTURE_PAGE } from './page.ts'

/**
 * Serves the architecture map to the one account allowed to read it.
 *
 * This is the mirror image of `shared-album`. That function runs without JWT
 * verification because a share link must work for someone with no account;
 * this one exists precisely to make sure a page reaches nobody else.
 *
 * The page is served from here rather than from `public/` or the application
 * bundle because neither of those is a boundary. Anything Vite ships is
 * readable by any visitor who opens the JavaScript, so a check in the browser
 * would hide the page without protecting it. The bytes only leave this function
 * after the caller has been identified.
 *
 * What it protects is not a secret in the credential sense — it names tables,
 * the private schema and the share-token design, and none of that is what keeps
 * the data safe; row-level security is. It is a map, and there is no reason to
 * hand one to everybody.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

function problem(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const admin = Deno.env.get('ARCHITECTURE_ADMIN_ID') ?? ''

  // Fails closed. An unset secret means nobody has been nominated to read this,
  // and the safe reading of that is "no one" rather than "anyone who asks".
  // Said plainly because the person who hits it is the person who can fix it.
  if (!admin) {
    return problem('ARCHITECTURE_ADMIN_ID is not set on this project.', 503)
  }

  const authorization = request.headers.get('Authorization') ?? ''
  const jwt = authorization.replace(/^Bearer\s+/i, '').trim()

  if (!jwt) return problem('Sign in first.', 401)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  )

  // Asked of the auth server rather than decoded here. Verification at the
  // gateway proves the token was signed; it does not prove the session still
  // exists, and a signed-out or deleted account should stop working the moment
  // it is signed out, not when the token happens to expire.
  const { data, error } = await supabase.auth.getUser(jwt)

  if (error || !data.user) return problem('Sign in first.', 401)

  // The same answer whether the caller is signed out or simply not the owner of
  // this project would be tidier, but these two are told apart deliberately:
  // both are reachable only by someone already holding a real session, and
  // "this account cannot see it" is the honest thing to put on screen.
  if (data.user.id !== admin) return problem('This page is not for this account.', 403)

  return new Response(ARCHITECTURE_PAGE, {
    headers: {
      ...CORS,
      'Content-Type': 'text/html; charset=utf-8',
      // Never a shared cache: the response is per-caller by definition.
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
})
