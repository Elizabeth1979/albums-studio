import { readFileSync, readdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { stubSupabase } from './support/supabase-stub'

const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'))
const serviceWorker = readFileSync('public/sw.js', 'utf8')
const indexHtml = readFileSync('index.html', 'utf8')

/**
 * The manifest and icons as the browser actually receives them.
 *
 * The unit tests read the files; these fetch them from the server that serves
 * the built app, which is what catches a file that never made it into dist or
 * one served under the wrong content type.
 */
test.describe('installing the app', () => {
  test('serves a manifest the page links to', async ({ page, baseURL }) => {
    await stubSupabase(page)
    await page.goto('/')

    const href = await page.getAttribute('link[rel="manifest"]', 'href')
    expect(href).toBe('/manifest.webmanifest')

    const response = await page.request.get(new URL(href!, baseURL).toString())
    expect(response.ok()).toBe(true)

    const manifest = await response.json()
    expect(manifest.name).toBe('Albums Studio')
    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBe('/')
  })

  test('serves every icon the manifest promises', async ({ page, baseURL }) => {
    // A manifest naming an icon that 404s is a manifest that does not install,
    // and the rewrite to index.html means a missing file answers 200 with HTML
    // rather than 404 — so the content type is what tells the truth.
    await stubSupabase(page)
    await page.goto('/')

    const manifest = await (
      await page.request.get(new URL('/manifest.webmanifest', baseURL).toString())
    ).json()

    for (const icon of manifest.icons) {
      const response = await page.request.get(new URL(icon.src, baseURL).toString())

      expect(response.ok(), `${icon.src} should be served`).toBe(true)
      expect(response.headers()['content-type'], `${icon.src} should be a PNG`).toContain(
        'image/png',
      )
    }
  })

  test('serves the service worker as JavaScript, not as the app shell', async ({
    page,
    baseURL,
  }) => {
    await stubSupabase(page)
    const response = await page.request.get(new URL('/sw.js', baseURL).toString())

    expect(response.ok()).toBe(true)
    expect(response.headers()['content-type']).toContain('javascript')
    expect(await response.text()).toContain("addEventListener('fetch'")
  })

  test('registers the worker and reports itself installable', async ({ page }) => {
    // The preview server is http://127.0.0.1, which counts as a secure context,
    // so registration behaves as it would over HTTPS.
    await stubSupabase(page)
    await page.goto('/')

    const registered = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      return Boolean(registration.active || registration.installing || registration.waiting)
    })

    expect(registered).toBe(true)
  })
})

/**
 * The install criteria are Chrome's, not ours, and a manifest that misses one
 * of them fails by simply never offering to install — no error, nothing in the
 * console anyone reads. These assert the list rather than trusting it.
 */
test.describe('the web app manifest', () => {
  test('carries the fields an install needs', () => {
    expect(manifest.name).toBeTruthy()
    expect(manifest.short_name).toBeTruthy()
    expect(manifest.start_url).toBe('/')
    expect(['standalone', 'fullscreen', 'minimal-ui']).toContain(manifest.display)
  })

  test('offers both icon sizes Chrome asks for, in the ordinary purpose', () => {
    // Checking sizes alone was not enough: a set whose only 512 is maskable
    // passed, and a maskable icon is drawn cropped to the launcher's shape.
    // At least one of each size has to be usable as-is.
    const any = (manifest.icons as { sizes: string; purpose?: string }[]).filter(
      (icon) => !icon.purpose || icon.purpose.split(' ').includes('any'),
    )

    expect(any.map((icon) => icon.sizes)).toContain('192x192')
    expect(any.map((icon) => icon.sizes)).toContain('512x512')
  })

  test('offers a maskable icon, so a launcher does not crop the mark away', () => {
    const maskable = manifest.icons.filter((icon: { purpose?: string }) =>
      icon.purpose?.split(' ').includes('maskable'),
    )

    expect(maskable).not.toHaveLength(0)
  })

  test('points at icons that exist and are not empty', () => {
    for (const icon of manifest.icons as { src: string }[]) {
      const file = readFileSync(`public${icon.src}`)

      expect(file.byteLength).toBeGreaterThan(1000)
      // A PNG, whatever the name says.
      expect([...file.subarray(1, 4)].map((code) => String.fromCharCode(code)).join('')).toBe(
        'PNG',
      )
    }
  })

  test('never claims a wider scope than the app serves', () => {
    expect(manifest.scope).toBe('/')
  })
})

test.describe('the page that links it', () => {
  test('links the manifest, or nothing is installable at all', () => {
    expect(indexHtml).toContain('rel="manifest"')
    expect(indexHtml).toContain('/manifest.webmanifest')
  })

  test('names an apple-touch-icon, which iOS reads instead of the manifest', () => {
    expect(indexHtml).toContain('rel="apple-touch-icon"')
  })
})

test.describe('the service worker', () => {
  /** Pulled out of the source, so the test and the worker cannot disagree. */
  const immutable = new RegExp(
    /const IMMUTABLE = (\/.*\/)\n/.exec(serviceWorker)?.[1].slice(1, -1) ?? 'never',
  )

  test('has a fetch handler, which is what the install prompt looks for', () => {
    expect(serviceWorker).toContain("addEventListener('fetch'")
  })

  test('caches the hashed assets a real build actually produces', () => {
    // The pattern once expected `name.HASH.ext` while Vite writes
    // `name-HASH.ext`, so it matched nothing and the cache did nothing. Read
    // from dist when it is there rather than from names invented here.
    let built: string[] = []
    try {
      built = readdirSync('dist/assets').filter((name: string) => /\.(js|css)$/.test(name))
    } catch {
      built = []
    }

    if (built.length === 0) {
      // No build to check against; the shapes below still hold the rule.
      expect(immutable.test('/assets/index-B-TGBWKO.js')).toBe(true)
      return
    }

    for (const name of built) {
      expect(immutable.test(`/assets/${name}`)).toBe(true)
    }
  })

  test('never serves the page itself from a cache', () => {
    // A share link that kept showing an old build cost an afternoon once. A
    // service worker is the most effective way to make that permanent.
    expect(immutable.test('/index.html')).toBe(false)
    expect(immutable.test('/')).toBe(false)
    expect(immutable.test('/albums/summer-by-the-lake')).toBe(false)
    expect(immutable.test('/shared/a-token')).toBe(false)
  })

  test('leaves other origins alone', () => {
    // Signed image URLs and the Supabase API expire; caching them would serve
    // a visitor a link that stopped working.
    expect(serviceWorker).toContain('url.origin !== self.location.origin')
  })
})
