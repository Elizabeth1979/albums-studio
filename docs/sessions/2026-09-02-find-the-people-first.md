# Find the people first

**Date:** 2026-09-02

The handoff's conclusion was that no statistic over a whole frame can separate the owner's
album, and that the way out is to find the people in a photograph and judge them. This is the
first round of that, and it deliberately stops short of judging anything.

## What was built

The detector, and nothing that acts on it. Every album now says, on screen, how many of its
photographs a face was found in, how many were looked at and held nobody, and how many could
not be looked at at all — with the reason when there is one. Each tile carries its own result
beside its blur reading.

Nothing is offered or held back on the strength of a face. That is on purpose, and it is the
whole shape of this round: **the handoff named a risk that no scene built here can settle.** In
her blurred photograph the boy is small, wearing a hat, and some distance away; in another he
faces away entirely. Whether BlazeFace finds him is a question only her album can answer, and
until it has, building a threshold on top would be the same mistake this feature has made five
times.

## Five things the plan got wrong, found by trying it

The handoff was written from documentation. Each of these came out of running the thing.

1. **The model is not in `node_modules`.** The plan said to self-host "the wasm and the
   `blaze_face_short_range.tflite` model from `node_modules`". The wasm is there; the model is
   not shipped with the npm package at all. MediaPipe publishes it separately on Google's
   storage. It is now committed to the repository — 224 KB, against a build that would
   otherwise fail whenever Google's storage does.

2. **The runtime is 11.8 MB, not 3.** The plan said "only the vision wasm (~3MB) and the model
   (~230KB) are fetched at runtime". Over the wire that is right — it gzips to 3.3 MB — but the
   file on disk is 11.8 MB, and both variants have to be vendored because the browser chooses
   between them. `public/mediapipe/` is 22 MB, so it is copied from `node_modules` before each
   build rather than committed.

3. **MediaPipe cannot start in this app's worker.** The blur measurement runs in a module
   worker and this belongs beside it. It cannot: the runtime passes its wasm module to itself
   through a global that only a classic worker's `importScripts` sets, so a module worker fails
   with `ModuleFactory not set`. A classic worker is not a quick fix either — the package's
   CommonJS bundle is not UMD and needs an `exports` shim. Both were tried in a real browser.
   **Detection runs on the main thread**, lazily, four photographs at a time behind an album
   that is already drawn.

4. **The library's default confidence is too low.** At MediaPipe's default of 0.5, BlazeFace
   finds a face in random rectangles about one draw in sixty. That matters here more than
   almost anywhere: a false face would point the blur measurement at a patch of nothing and
   condemn a photograph that came out. Measured across repeated draws in a real browser:

   | confidence | a face | random squares | dense texture | flat |
   | --- | --- | --- | --- | --- |
   | 0.5 | 20/20 | 0/60 | 0/30 | 0/20 |
   | 0.6 | 20/20 | **1/60 at 0.603** | 0/30 | 0/20 |
   | 0.7 | 20/20 | 0/60 | 0/30 | 0/20 |
   | 0.8 | 20/20 | 0/60 | 0/30 | 0/20 |
   | 0.9 | **10/20** | 0/60 | 0/30 | 0/20 |

   0.8 keeps every true detection and sits two tenths above the highest false one seen. At 0.9
   the detector loses half the faces it should find, which is the other way to be useless.
   Dense multi-scale texture — the nearest thing here to water over pebbles — never fired at
   any setting.

5. **BlazeFace resizes the whole frame to 128×128 before it looks at anything.** This is the
   mechanism behind the risk the handoff named, and it is worse than the handoff supposed: a
   boy who fills a twentieth of the frame is about six pixels across by the time the model sees
   him. Detection depends on the share of the *frame* a face fills, never on how many pixels
   the photograph has.

   This one was not left as a warning. See below.

## What is proven, and what is not

Proven, in a real browser, inside the built app: the runtime and the model load from this app's
own origin, the detector starts, it runs, it finds a face when there is one, and it says so
distinctly when it cannot run at all. Two end-to-end tests hold those apart — one with the
model reachable, one with `**/mediapipe/**` aborted — because a count alone would pass just as
happily with a detector that had never started.

Not proven, and not provable here: that BlazeFace finds *her son*. The face fixture is drawn
from arithmetic, and it took skin colour and soft edges to be found at all — the same geometry
in grey with hard edges is not detected. A fixture like that says the pipeline works. It says
nothing about a beach.

## Rules this session leaves behind

- A plan written from documentation is a hypothesis. This one was wrong about where the model
  lives, how big the runtime is, and where it can run — three facts that took one afternoon of
  running it to find and would have been three rounds of surprise if built on.
- Where a library ships a default that decides whether a photograph is accused, measure it
  rather than take it. MediaPipe's 0.5 finds faces in random rectangles.

## Then: tiles, because one look should be decisive

The plan was to ship the plain detector and let her album say whether it found her son. Two
measurements changed that.

First, a near-miss score — reporting how close the detector came when it found nobody — turned
out to be worthless, which is worth recording because it looked like an obviously good idea. At
a floor of 0.05 a face filling 5% of the frame scores **0.292**, while a field of random
rectangles containing nobody scores **0.368**. Noise outscores a real small face, so the number
could not be read either way. Not shipped.

Second, the detection limit is a cliff, and it is measurable:

| face width, as a share of the frame | whole | 3×3 tiles | 4×4 tiles |
| --- | --- | --- | --- |
| 24% | 0.894 | — | — |
| 16% | 0.827 | 0.923 | 0.814 |
| 12% | **missed** | 0.880 | 0.848 |
| 8% | missed | 0.873 | 0.893 |
| 5% | missed | missed | 0.843 |
| 4% | missed | missed | **missed** |

The whole frame gives out below about 16%, and cropping walks straight over that: a tile is a
third or a quarter of the frame, so a face inside one reaches the model three or four times
larger. Both grids earn their place and neither replaces the other — a face too large
for a 4×4 tile is cut across two and found in neither, which is why the whole frame is still
read first.

The two costs both came back cheap. Sixteen extra looks is sixteen extra chances to be wrong,
and measured across ten draws each of dense water texture and random rectangles it produced **no
face at any grid**. And whole + 3×3 + 4×4 takes **155 ms** for one 800px frame against 24 ms for
the whole frame alone.

So tiling shipped now rather than after another round. The owner verifies on the published site
and seven pull requests have already been merged into this feature; her attention is the scarce
thing here, and one look that answers the question beats two that halve it.

Every face found now reports `share` — its width as a fraction of the frame's — and the album
names the smallest one it found. That is the number that says whether this approach is
comfortable or standing on its floor. Below about 5% nothing finds anyone, and no finer grid
rescues it.

An end-to-end test serves a face at 5% of the frame, which the whole-frame pass cannot see.
Setting `TILE_GRIDS` to `[]` fails that test and only that test — the other seven still pass.

## And then the album, which settled it

The owner reloaded and reported the blurred photograph still unflagged. The screenshot showed
why immediately, and it was not the detector: the page said *"anything over 0.42"* and carried no
"People:" line at all. **None of this work had been merged.** The site was running the code from
before the calibration fix.

That is worth recording on its own. Nothing here reaches her until it is on `main`, and a branch
that is green and unmerged is, from her side, identical to a branch that was never written.

The screenshot was still the most useful thing this feature has received, for two reasons.

### The blurred photograph, at last visible

Eight photographs now, reading 0.21, 0.23, 0.27, 0.27, 0.32, 0.32, 0.32 and 0.41. The blurred one
still reads 0.32 and still sits mid-pack. A larger sample confirms rather than softens the
verdict: no line across a whole-frame reading separates it.

And the photograph itself shows exactly what the handoff argued from words alone. The near water
is sharp; the boy and the red board behind him are soft. The camera focused past him.

### The finding that decides the feature's future

Which raises the question nobody had tested: **can BlazeFace find a face that is itself blurred?**
Measured, with blur applied to the person alone:

| face width | sharp | 2px blur | 4px | 6px |
| --- | --- | --- | --- | --- |
| 12% | 0.878 | 0.866 | 0.868 | none |
| 8% | 0.893 | 0.890 | none | none |
| 5% | 0.844 | none | none | none |

Detection survives blur up to roughly 4–5% of the face's own width and is lost beyond about 6%.
**A face soft enough for anyone to notice is a face this detector cannot see.**

That is fatal to the plan as written. "Face sharp → the photograph came out; face soft → offer it"
cannot work, because the soft-face branch never fires: a soft face is not detected as a face at
all. It is the same fault that killed `edgeWidth` in round three — heavy blur destroys the very
thing the measure hunts for, so the worse the photograph, the more certain the silence.

Face detection can still say *"there is a sharp person here, so this photograph came out"*. It
cannot say *"the person here is soft"*. Only the first half of the plan is available.

### A correction to the previous round's numbers

The size table shipped in the last commit was wrong by a factor of two. It came from a harness
that set the ellipse *radius* to the quoted fraction, so a face labelled 8% actually spanned 16%
of the frame. The corrected measurements above use full width, which is what `share` reports and
therefore the only thing the two can be compared on. The floor is 5%, not 2%, and the on-screen
line said so incorrectly for one commit.

## Rules this correction leaves behind

- State a measured size as the thing being measured, not as a parameter that happens to produce
  it. "Radius 8%" and "width 8%" differ by two, and a table read months later cannot tell which
  was meant.
- Before building on a detector, test it on the input you actually need it to handle. Face
  detection was chosen to judge blurred photographs and cannot see blurred faces; one afternoon
  of measurement would have found that before any of it was written.
