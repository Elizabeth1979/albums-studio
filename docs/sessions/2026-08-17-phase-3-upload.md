# Session: Phase 3 — the upload spine

**Date:** 2026-08-17
**Keywords:** upload, resize, thumbnail, pHash, DCT, sharpness, Laplacian, Web Worker,
concurrency, retry, signed URLs, Storage, HEIC.

## What shipped

Photos are chosen from the phone's gallery or dropped in on a desktop. Each file is
decoded, resized to 2000px with a 400px thumbnail, measured, uploaded to
`<owner>/<album>/<uuid>.jpg`, and recorded with its measurements. Four run at a time, each
with three attempts and exponential backoff. The album then renders them in its layout.

## Decisions worth keeping

**The file input is the control, not the drop zone.** The roadmap said "drag photos in",
which is desktop thinking; a phone has nothing to drag. A styled `<label>` over a hidden
input opens the gallery on tap, and the drop zone is an enhancement layered on top rather
than the only way in.

**Signals are computed on a 256px copy, not the full image.** A perceptual hash reduces to
32x32 before its transform and the focus measure only needs local contrast, so measuring
the 2000px version would cost time and change nothing.

**Sharpness is stored as a raw signal, not a score.** Laplacian variance is unbounded and
only comparable between similar photos, so normalising it here would invent precision.
Phase 7 turns signals into a "best of this burst" suggestion; `quality_score` stays null
until something earns it.

**Storage first, then the row, and clean up if the row is refused.** A row pointing at
bytes that were never written is a broken photo in the album; bytes with no row are
invisible. When the insert fails, both objects are removed rather than left orphaned — an
end-to-end test asserts the bucket is empty afterwards.

**Sort order is assigned from the batch position before anything runs.** Uploads finish out
of order, and photos should keep the order they were picked in.

**An unreadable file fails once and stays failed.** HEIC is the common case: browsers
outside Safari cannot decode it. Retrying a format three times only delays the same answer,
so `UnreadableImageError` opts out of the retry policy and the message names the file.

**A photo with no alt text renders with `alt=""`.** That marks it decorative, so a screen
reader skips it. Announcing a filename would be worse than silence. Phase 4 is what gives
owners real alt text; two tests pin both halves of this down.

## Structure

The parts that are easy to get quietly wrong are pure functions with their own tests:
`luma`, `phash` (DCT-II, orthonormal, median-thresholded), `sharpness` (Laplacian
variance), and `concurrency` (`mapWithConcurrency`, `withRetry`). Browser APIs sit in
`imaging/process.ts`, the worker wraps that, and `uploads.ts` orchestrates without knowing
about either canvases or Supabase.

Workers are used when `OffscreenCanvas` exists and the main thread otherwise; the fallback
is correct, just less smooth.

## A pHash property worth knowing

A featureless photo — a blank wall, a badly underexposed frame — leaves every DCT
coefficient near zero, so the bits come out of floating-point noise rather than the image.
Two photos of the same blank wall may not match. Phase 7 must treat featureless frames as
*unresolvable* rather than as different. A test pins this down so it is discovered here
rather than in a duplicate-detection bug.

The same property caught a bad test: a pure horizontal gradient is degenerate in exactly
this way, and the brightness-invariance test only became meaningful once it used an image
with structure in both axes.

## Verification

- 137 unit tests, 50 end-to-end tests, typecheck, production build, `npm audit` clean.
- The end-to-end suite uploads a **real PNG** built in the test and lets Chromium decode,
  resize and hash it for real. It asserts the recorded width, a 64-bit hash containing both
  values, a positive sharpness, and object keys under the owner's prefix.
- Thumbnails are asserted to have `naturalWidth > 0`: an `<img>` exists even when its
  source 404s, and an earlier stub bug produced exactly that.
- The Phase 3 checkpoint — upload a batch, reload, still see them — runs as a test.
- axe-core covers the album with photos and the failed-upload state.

## Still open

- **`quality_score` is never written.** It is Phase 7's to fill.
- **Shared viewers cannot see photos.** Owners sign their own URLs from the browser because
  their token is the authorization; viewers have no token and need Phase 6's server code.
- **No pagination.** An album loads every photo row at once, which is fine for now and will
  not be at a few thousand.
- **HEIC is rejected rather than converted.** Whether that is acceptable depends on what the
  owner's camera actually saves, which is still unconfirmed.
