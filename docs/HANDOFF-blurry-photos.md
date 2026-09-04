# Handoff: detecting out-of-focus photographs

Paste this whole file into a new conversation. It is everything needed to continue.

## The goal

In `albums-studio`, offer the owner photographs that are out of focus so she can remove them.
One specific photograph in her Eilat album — her son standing in shallow water with a red
windsurf board behind him — has never been detected, across seven merged pull requests.

## How the owner works (already recorded in `AGENTS.md`)

- **"Always recommend the best option."** Never present a choice between technical approaches.
  Name the best one and take it.
- **She verifies on the published site**, never on preview deploys. So: merge to `main` and let
  Vercel deploy, then ask her to reload. A change sitting in an unmerged PR is invisible to her,
  and she lost a round to exactly that mistake.
- Branch: `claude/photo-cleanup-blurry-images-ynzy0k`. Squash-merge to `main`, then reset the
  branch onto `main` and force-push with lease.
- Product invariant: **missing a blurred photograph costs nothing; falsely condemning a good one
  costs her trust in every suggestion the app makes.** Nothing is preselected, and two deliberate
  actions are required before anything is removed.

## Where the code is

| file | what it holds |
| --- | --- |
| `src/lib/imaging/reblur.ts` | `blurRatio` — the live signal. `DENOISE = 1.5`, `REBLUR_SPAN = 25`, both re-checked at 800px. |
| `src/lib/imaging/sharpness.ts` | `edgeWidth` (superseded, still reported), `focusScore` (used only to rank frames inside a near-duplicate group), `laplacianVariance` (stored at upload). |
| `src/lib/imaging/measure.ts` | `measureFocus(blob)` → `{kind:'measured', blur, edgeWidth, texture}` \| `{kind:'unjudgeable'}` \| `{kind:'failed', detail}`. Exports `ANALYSIS_CEILING = 800`; the harness imports it. |
| `src/lib/focus.ts` | `BLURRED_ENOUGH = 0.46`, `findSoftPhotos`, `summariseFocus`, `unreadable`. |
| `src/components/AlbumPhotos.tsx` | downloads bytes via `photoBytes(photo.storagePath)`, 4 at a time; measures blur in the worker and finds faces on the main thread; builds `focusNotes`; renders the two temporary tuning lines. |
| `src/lib/imaging/faces.ts` | `detectFaces`, `findFacesIn`, `forgetDetector`. `CONFIDENCE = 0.8`, `TILE_GRIDS = [3, 4]`, `TILE_OVERLAP = 0.25` — all measured, with the tables in the comments. |
| `scripts/vendor-mediapipe.mjs` | copies the vision runtime out of `node_modules` into `public/mediapipe/` before every build. |
| `src/components/PhotoGallery.tsx` | `focusNotes` prop → the per-tile number badge (`.photo-focus-mark` in `src/index.css`). |
| `src/components/SoftPhotos.tsx` | the "Photos that look out of focus" review section. |
| `src/lib/imaging/focusScore.test.ts` | the calibration harness: builds 2000×1500 stored-size scenes, blurs, rounds to 8-bit, reduces to `ANALYSIS_CEILING`, rounds again, adds noise. |
| `docs/sessions/*` | one write-up per round, with the numbers. |

**Temporary and must be removed when the feature is finished:** the per-tile number badge, and
the "Focus check: read N of M …" line in `AlbumPhotos.tsx` that ends "This line is here while the
setting is being tuned and will come out afterwards." The "People: found someone in N of M …"
line beside it comes out with them.

## The five measures tried, and how each died

Every one was calibrated on synthetic scenes, shipped, and then killed by her real album.

1. **`laplacianVariance`** (whole-frame Laplacian variance). Threshold could never fire: her
   album's stored values ranged 1606–13910 against a threshold of 60.
2. **`focusScore`** (block-local Laplacian variance ÷ block contrast, top fifth pooled). Measures
   *texture*, not focus. A sharp close-up of two faces carries a fraction of the detail of
   rippling water, so it read as the blurriest thing in the album. She caught it: *"it's strange
   we tagged this image out of focus as well, though you can clearly see our faces."* Retained
   only for ranking frames *within* a near-duplicate group, where the subject is held constant.
3. **`edgeWidth`, crispest quarter.** Died twice. First: heavy blur destroys the edges it hunts
   for, so the blurriest frames found none and reported "impossible to judge" — the worse the
   photograph, the more certain the silence. Then: sensor noise. Noise is one-pixel spikes; a
   blurred frame has no steep slopes left, so the spikes became its strongest gradients and each
   is one pixel wide. A 20px-blurred frame with ±2 grey levels of grain read **1.67 against 1.80
   for a sharp one** — backwards.
4. **`edgeWidth`, median pooling.** The walk outward from an edge stops when the *next* edge
   interrupts it, after 4–5 pixels in any busy photograph. It was measuring the spacing between
   edges, not the blur. Her album read 5.0, 5.0, 4.0, 5.0, 4.0 — two values, both whole numbers.
   She spotted it: *"the numbers look off."*
5. **`blurRatio`** (Crété-Roffet: re-blur the frame and see how much detail it loses; higher =
   blurrier). Genuinely subject-independent and noise-immune — in-focus texture 0.362–0.381 vs
   in-focus faces 0.338–0.353, while a blur the lens would be ashamed of moves it past 0.6.
   **Still does not separate her album.**

   Read the correction below before trusting any earlier number for this one: the readings that
   condemned it were taken through a pipeline whose constants had been fitted at 400px while the
   app measured at 800px. The measure has since been re-calibrated at the size it actually runs
   at, and the verdict is unchanged — but it is now a verdict about the code that ships.

Two faults were also found that were not about the statistic:

- The check was measuring the **400px thumbnail** while the tiles were drawn from the **2000px
  stored image** already in the browser. A thumbnail is a tenfold reduction of what the camera
  wrote and the blur shrinks with it. Fixed — it now measures `storagePath` at 800px.
- The calibration scenes carried **no sensor noise and no compression artefacts**, which is why
  measures that collapse on every real photograph passed every test.
- The calibration harness **reduced to 400px while the app measured at 800px**, for the whole
  life of `blurRatio`. `THUMBNAIL = 400` was right when written; #53 moved production to the
  stored image at 800px and did not move the harness, and #55 recalibrated on top of the stale
  size. The threshold, the denoise width and the re-blur span were all fitted at a size the app
  had stopped using, and nothing failed, because `measureFocus` — the only function that picks
  the size — had no test at all. The same frame reads 0.390 at 400px and 0.458 at 800px. Fixed:
  the harness models the real chain and imports `ANALYSIS_CEILING`, so moving the size fails the
  suite in both directions.

## The decisive real data

Her Eilat album, five photographs, read on the live site.

| photograph | `edgeWidth` (crispest quarter) | `blurRatio` (live) |
| --- | --- | --- |
| selfie — two faces, **tack sharp**, beach soft behind | **3.9** | **0.41** |
| boy + windsurf group, sharp | 3.6 | 0.32 |
| distant windsurfer, sharp | 3.0 | 0.27 |
| **the blurred one (son in the water, red board)** | 3.8 | **0.32** |
| boy on the shore, sharp | 3.1 | 0.23 |

Read the two right-hand columns. **Under every measure, her sharpest photograph scores as the
blurriest, and the blurred one sits mid-pack, indistinguishable from two sharp frames.** That is
the finding, and re-calibration does not touch it: no line anywhere reaches 0.32 without taking
0.41 and 0.32 with it.

The line was at 0.42 when these were read, one hundredth above the sharp selfie — and that line
had been derived for a 400px pipeline, not the 800px one that produced these numbers. It is now
**0.46**, set from these five readings rather than from generated scenes: five hundredths above
the selfie, which is the invariant applied literally. Her album still shows nothing, as it did
before. The blurred photograph is still not found.

## The conclusion — this is the thing to act on

Her blurred photograph **is not uniformly blurred.** The near foreground — shallow water over
pebbles — is genuinely sharp; the boy and the board, further away, are not. And her selfie is the
mirror image: sharp faces, deliberately soft background. She said it herself while this was going
on:

> "if faces are clear and there is blur around them, it might be a good image, and that might be
> a technique."

That is exactly right, and it is a proof that **no statistic computed over the whole frame can
work.** A good portrait and a badly focused snapshot contain the same mixture of sharp and soft
pixels. What separates them is *which part* is sharp. Five measures failed because they all
asked "how sharp is this frame?" when the question is "is the subject sharp?"

Stop trying whole-frame statistics. There is nothing left to tune — and that is now a claim
about the code that ships, not about a configuration it never ran.

## What to build next

Her original instinct, from the first message of the session, and now backed by evidence:

**Find the people in the photograph and judge them, not the frame.**

This is what the culling tools photographers actually buy do — Narrative Select scores focus per
detected face; Aftershoot buckets frames by blur and closed eyes. Neither uses a cloud vision
model, and neither should this.

Recommended shape:

1. **Face detection locally, in the browser** — BlazeFace via `@mediapipe/tasks-vision`
   (`FaceDetector`). Self-host the wasm and the `blaze_face_short_range.tflite` model from
   `node_modules` into `public/` at build time; do not load from a CDN. Load it lazily, only when
   the focus check runs. **Done — and every detail in this paragraph was wrong.** The model is
   not in `node_modules` at all (MediaPipe publishes it separately; it is now committed at
   `public/mediapipe/blaze_face_short_range.tflite`, 224 KB). The wasm is 11.8 MB on disk rather
   than 3, gzipping to 3.3 MB over the wire, and both the SIMD and nosimd variants must be
   vendored because the browser chooses between them. And it cannot run in this app's module
   worker (`ModuleFactory not set`), so detection runs on the main thread. See
   `docs/sessions/2026-09-02-find-the-people-first.md`.
2. **Measure `blurRatio` on the face region** (padded, taken from the 2000px stored image so the
   crop has enough pixels), not on the frame. `blurRatio` is the right measure for this — it is
   subject-independent and noise-immune; it was only ever being pointed at the wrong region.
   **Not started, on purpose** — step 5 has to answer first. Note when it is: `BLURRED_ENOUGH` is
   calibrated for a whole frame reduced to `ANALYSIS_CEILING`, and a face crop taken at stored
   resolution carries its blur at a different scale entirely. That line will not transfer, and
   inheriting it would repeat the mistake #57 fixed.
3. **Decide from the subject**: face sharp → the photograph came out, whatever the background is
   doing. Face soft → offer it.
4. **No face found → say nothing.** Do not fall back to the whole-frame reading; five rounds
   prove it is not trustworthy. "We only judge photographs of people" is an honest and safe rule,
   and photographs of people are the ones anyone actually minds losing.
5. Report failures distinctly on screen: *found a face and measured it* / *no face found* /
   *detector failed to load* must not all look like silence. This feature was debugged blind
   three times because they did. **Done, and it is where this now stands:** the album says what
   the detector managed on every photograph, per tile and in a summary line, and acts on none of
   it. Two end-to-end tests hold "found nobody" and "could not run" apart.

**The known risk to check first:** in her blurred photograph the boy is small, wearing a hat, and
some distance away; in another he faces away entirely. BlazeFace may not detect either. Test that
before building the rest — if faces are not found in her album, this approach dies too, and the
next option is a saliency or subject-region model rather than a face detector.

**This is now the open question, and the remedy for it has already shipped.** BlazeFace resizes
the whole frame to 128x128 before it looks at anything, so detection depends on the share of the
frame a face fills and not on how many pixels the photograph has. Measured, the whole-frame
reading finds a face down to about 8% of the frame's width and falls off a cliff below that.

So the photograph is also read through 3x3 and 4x4 grids of overlapping tiles, which hands a
small face to the model three or four times larger, and that recovers faces down to about 2.5%.
It costs nothing in false accusations (no face found in ten draws each of dense texture and
random rectangles, at any grid) and 155 ms a frame against 24 ms.

Below roughly 2% of the frame's width nobody is found, and no finer grid rescues it. That is the
floor. Every face reports `share`, and the album names the smallest it found — **that is the
number to read first when her album comes back.** If it says nobody was found at all, faces are
the wrong instrument and the next option is a saliency or subject-region model.

## Do not repeat these

Written into `AGENTS.md` over the session:

- A signal calibrated against generated data is calibrated against nothing until a real example
  has been seen.
- Every real photograph carries noise, compression artefacts and specular glints. Scenes built
  from arithmetic carry none of them, and each absence has broken a measure here.
- Test the input the real thing gets: blur at camera size, then shrink, then round to 8-bit.
- Prefer a measure that compares a photograph against itself over one that compares it against a
  constant. No constant holds across dense water and smooth skin.
- Never let a failure and a clean result look the same on screen.
- When a signal is not trusted yet, display it without acting on it.
- A plan written from documentation is a hypothesis. The face-detection plan above was wrong
  about where the model lives, how large the runtime is, and where it can run.
- Where a library ships a default that decides whether a photograph is accused, measure it
  rather than take it. MediaPipe's default confidence finds faces in random rectangles.
- When a measure has a known failure, write the test that asserts the true behaviour and name the
  gap. A test that pretends the failure does not happen is worse than no test.
- Measure the best copy already in hand.
- A calibration harness must import the size, and every other constant, that production uses. A
  restated copy is a mismatch waiting for someone to notice on a live site.
- When a signal fails on real data, check that what shipped is what was calibrated before
  concluding the signal cannot work.
