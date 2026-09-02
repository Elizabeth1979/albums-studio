/**
 * Copies MediaPipe's vision runtime out of node_modules and into `public/`.
 *
 * The face detector needs a WebAssembly runtime at the moment it runs, and the
 * published guidance is to fetch it from a CDN. This app does not: a private
 * album should not announce to a third party which photographs are being looked
 * at, and a CDN that is slow, blocked or gone is a feature that fails in a way
 * nobody here can debug. So the runtime is served from the same origin as
 * everything else.
 *
 * It is copied rather than committed. The four files are 22 MB, they are
 * reproducible from the pinned dependency, and a repository is a poor place for
 * 22 MB that npm already holds. `public/mediapipe/` is ignored by git and built
 * here before every dev run and every deploy.
 *
 * The model beside them is a different matter and is committed — see the note
 * in `public/mediapipe/README.md`.
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const from = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
const to = join(root, 'public', 'mediapipe')

/**
 * Both variants, because the browser picks between them.
 *
 * `FilesetResolver.forVisionTasks` tries to instantiate a SIMD module and asks
 * for `vision_wasm_internal` when that works and `vision_wasm_nosimd_internal`
 * when it does not. Only one is ever fetched; shipping one of them would leave
 * whichever browsers fall the other way with a detector that cannot start.
 */
const FILES = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
]

if (!existsSync(from)) {
  console.error(
    `Could not find ${from}.\nRun "npm install" first: the vision runtime is copied out of the installed package.`,
  )
  process.exit(1)
}

mkdirSync(to, { recursive: true })

let copied = 0
for (const file of FILES) {
  const source = join(from, file)

  if (!existsSync(source)) {
    console.error(`@mediapipe/tasks-vision no longer ships ${file}. The pinned version and this list have drifted.`)
    process.exit(1)
  }

  copyFileSync(source, join(to, file))
  copied += statSync(source).size
}

console.log(`mediapipe: copied ${FILES.length} files (${(copied / 1024 / 1024).toFixed(1)} MB) into public/mediapipe/`)
