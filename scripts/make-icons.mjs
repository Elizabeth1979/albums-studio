/**
 * Draws the app icons a phone shows on its home screen.
 *
 * Rendered with the browser that is already here rather than committed as
 * opaque binaries nobody can edit: the mark is defined once, below, and the
 * PNGs are a build artefact of it. Re-run after changing it.
 *
 *   node scripts/make-icons.mjs
 *
 * The maskable one is drawn smaller inside the same square. Android crops a
 * maskable icon to whatever shape the launcher uses — circle, squircle, teardrop
 * — and only the middle 80% is guaranteed to survive, so the mark sits well
 * inside that and the background runs to the edges.
 */
import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const BACKGROUND = '#2e2a25'
const INK = '#f6f3ed'

/** @param {{ size: number, scale: number }} options */
function page({ size, scale }) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; padding: 0; }
      body {
        display: grid;
        place-items: center;
        width: ${size}px;
        height: ${size}px;
        background: ${BACKGROUND};
      }
      .mark {
        display: grid;
        place-items: center;
        box-sizing: border-box;
        width: ${Math.round(size * scale)}px;
        height: ${Math.round(size * scale)}px;
        border: ${Math.max(2, Math.round(size * 0.018))}px solid ${INK};
        border-radius: 50%;
        color: ${INK};
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
        font-size: ${Math.round(size * scale * 0.28)}px;
        font-weight: 600;
        letter-spacing: ${Math.round(size * scale * 0.03)}px;
        /* The letter-spacing pushes the pair right; this recentres it. */
        text-indent: ${Math.round(size * scale * 0.03)}px;
      }
    </style>
  </head>
  <body><div class="mark">AS</div></body>
</html>`
}

const ICONS = [
  { file: 'icon-192.png', size: 192, scale: 0.82 },
  { file: 'icon-512.png', size: 512, scale: 0.82 },
  // Everything outside the middle 80% may be cropped away.
  { file: 'icon-maskable-512.png', size: 512, scale: 0.58 },
]

await mkdir('public', { recursive: true })

const browser = await chromium.launch()

try {
  for (const { file, size, scale } of ICONS) {
    const view = await browser.newPage({ viewport: { width: size, height: size } })
    await view.setContent(page({ size, scale }))
    await view.screenshot({ path: `public/${file}`, omitBackground: false })
    await view.close()
    console.log(`public/${file}  ${size}x${size}`)
  }
} finally {
  await browser.close()
}
