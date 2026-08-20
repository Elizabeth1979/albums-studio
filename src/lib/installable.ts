/**
 * Registers the service worker that makes the app installable.
 *
 * Only in a built app. Under `vite dev` a service worker sitting in front of
 * the dev server intercepts module requests and serves yesterday's code, which
 * is a confusing way to spend an afternoon.
 *
 * Failure is silent on purpose: a browser that refuses service workers, or a
 * private window that disallows them, should still get the whole application.
 * Nothing here is load-bearing for using Albums Studio — it buys the install
 * prompt and something better than a blank screen when the network is gone.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return
  if (!('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Nothing to tell the owner: everything still works without it.
    })
  })
}
