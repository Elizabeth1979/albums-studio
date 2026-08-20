/**
 * Enough of a service worker to make the app installable, and no more.
 *
 * Chrome dropped the service worker requirement for installing from the menu in
 * version 108, but the prompt it offers by itself still looks for a fetch
 * handler — so this exists mostly to make the app offer itself, and to say
 * something useful when the network is gone.
 *
 * What it deliberately does not do is cache the page. A share link that kept
 * showing an old build once cost an afternoon to diagnose, and a service worker
 * is the most effective way to make that permanent. So: HTML always comes from
 * the network, and only Vite's content-hashed assets are ever served from the
 * cache, which is safe because their names change whenever their contents do.
 */

const CACHE = 'albums-studio-assets-v1'

/**
 * Vite writes these with a content hash in the name, so they never change.
 *
 * The shape is `name-HASH.ext`, not `name.HASH.ext` — an earlier version of
 * this expected the latter and matched nothing at all, which is a silent way
 * for a cache to do exactly nothing. There is a test that checks this against
 * the names a real build produces.
 */
const IMMUTABLE = /\/assets\/[^/]+-[0-9a-zA-Z_-]{8,}\.(js|css|woff2?)$/

const OFFLINE_PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Albums Studio</title>
    <style>
      body {
        margin: 0;
        display: grid;
        place-items: center;
        min-height: 100dvh;
        padding: 2rem;
        background: #f6f3ed;
        color: #2e2a25;
        font-family: ui-sans-serif, system-ui, sans-serif;
        text-align: center;
      }
      h1 { font-family: Georgia, "Times New Roman", serif; font-weight: 400; }
      p { color: #57514a; line-height: 1.7; max-width: 28rem; }
    </style>
  </head>
  <body>
    <div>
      <h1>You are offline</h1>
      <p>Albums Studio needs a connection to reach your photographs. It will work again once you are back.</p>
    </div>
  </body>
</html>`

self.addEventListener('install', () => {
  // No precache: nothing here is worth serving before the network has been
  // asked, and precaching index.html is exactly the trap described above.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // Only this origin. Signed image URLs and the Supabase API are somebody
  // else's to cache, and they expire.
  if (url.origin !== self.location.origin) return

  if (IMMUTABLE.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request)
        if (cached) return cached

        const response = await fetch(request)
        if (response.ok) {
          const cache = await caches.open(CACHE)
          await cache.put(request, response.clone())
        }
        return response
      })(),
    )
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request)
        } catch {
          // Offline. The app cannot do anything useful without the network, so
          // say that rather than showing a blank screen.
          return new Response(OFFLINE_PAGE, {
            status: 503,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          })
        }
      })(),
    )
  }
})
