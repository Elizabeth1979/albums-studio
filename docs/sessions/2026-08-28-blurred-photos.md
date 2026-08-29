# The cleanup that could not see a blurry photograph

**Date:** 2026-08-28

The owner sent a screenshot of her album: a plainly blurred beach photograph, sitting in the
grid with the cleanup tools reporting nothing to look at. The photograph is soft enough to
be obvious at tile size, and nothing on the screen mentioned it.

## Why it was invisible, which is a design fault rather than a bug

Sharpness has been measured since Phase 3 and stored on every photograph. Phase 7 then spent
it entirely on *relative* readings: `compareSharpness` says where one frame sits against the
sharpest of its own near-duplicate group, and `sharpest` picks the one to keep. Both are
meaningless for a photograph that has no group. A blurred frame taken once — the ordinary
case, a phone fired while someone was still moving — has nothing to be compared against, so
the measurement existed, was correct, and was never read.

So the missing piece was not a better focus measure. It was the other question: not "which of
these is sharpest" but "is this one in focus at all".

## A first attempt that would have traded one fault for another

The obvious fix was to compare the stored variance against a fixed floor. It would have
caught the beach photograph, and it would have started calling other things blurred that are
not: **a variance measured over a whole frame conflates "blurred" with "smooth"**. A misty
lake, a pale sky, a portrait with a deliberately blurred background behind a sharp face — all
of them measure low while being exactly the photograph someone meant to take. A suggestion
that tells the owner to delete those twice is a suggestion she stops reading.

That is not a threshold that needs tuning. It is the wrong number to put a threshold on.

## What the reading is now

`focusScore` in `imaging/sharpness.ts` measures 32-pixel squares rather than the whole frame,
divides each square's detail by that square's own contrast, and takes the reading from the
sharpest fifth of them. Each part answers one of the faults above:

- **Squares, pooled from the sharpest fifth.** A photograph is in focus when the thing worth
  looking at is in focus — true of a landscape (sharp everywhere) and of a portrait against a
  blurred background (sharp on the face), false of a frame that is sharp nowhere. This is the
  established fix for depth of field: the Perceptual Sharpness Index (Feichtenhofer et al.,
  IEEE SPL 2013) pools "the highest γth percentile" of local estimates explicitly to ignore
  out-of-focus regions, and S3 (Vu & Chandler, TIP 2012) collapses a per-block sharpness map
  the same way.
- **Divided by contrast.** Makes the reading independent of how much light and texture the
  scene happened to carry, which is what stops fog from reading as a mistake.
- **Squares with almost no contrast skipped, and a frame of nothing but those given no
  reading at all.** Nothing can honestly be said about a photograph of fog or a blank wall,
  so nothing is said. Silence is a supported answer here, not a failure.

Considered and not taken: a face detector, so people and landscapes could be judged
differently. It is what the culling tools do, and it is the wrong first move here — two
content types mean two thresholds and a classifier whose mistakes become focus mistakes,
where percentile pooling gets the same benefit from arithmetic that is already running. When
Phase 7's remaining faces/eyes-open signal lands, the face box should choose *which squares
count* and leave this metric and its one threshold alone.

## Where the line came from

Measured, not guessed. `src/lib/imaging/focusScore.test.ts` builds scenes from fractal
texture across five random seeds — textured landscapes, low-contrast fog, a subject against a
blurred background, a small subject against a blurred background, and the same scenes
progressively blurred — with sensor noise added *after* the blur, at the level that survives
the downscale to 256px. Getting that noise level wrong in either direction is what makes a
focus measure look better in a test than it is.

Everything in focus measured **0.72 and above**. Everything blurred measured **0.17 and
below**. Fog and blank walls returned no reading.

`SOFT_FOCUS = 0.3` sits inside that gap and deliberately nearer the blurred end, because
the two mistakes are not symmetrical. **Missing a soft photograph costs nothing** — the owner
scrolls past it exactly as she does today. **Calling a photograph she meant to keep blurred
asks her to consider deleting it**, and a suggestion that does that twice stops being read at
all.

The three decisions are each held up by their own failing test: averaging every square
instead of the sharpest fifth breaks the portrait scenes, judging flat squares instead of
skipping them breaks the fog scene, and dropping the contrast division breaks the blurred
scenes. Each was verified by making that change and watching the suite go red.

One wording reaches the interface — "Out of focus" — and no scale. The measurement separates
in-focus from blurred cleanly and then flattens: past a certain blur it stops telling one
degree from the next, so grading these as "soft" and "very soft" would invent a distinction
the number cannot support. The number itself never reaches the interface either, for the
reason a Laplacian variance never did in Phase 7: 7432 is neither good nor bad, and the
picture is the evidence.

## Measured when the album opens, not when the photograph is uploaded

This is the decision with the most consequence and the least visibility, so: **the reading is
taken in the browser from the thumbnail each time an album opens, and never stored.**

The album that prompted this was already full. A reading taken at upload time would have
reached no photograph in it — including the blurred one in the screenshot — so the design
that only measures new uploads is the one design that helps nobody who has the problem
today. Storing it instead would mean either a schema change with a backfill over every
existing photograph, or a column holding two incomparable scales at once, which is worse
than either.

The thumbnail is already signed and already fetched in order to be drawn, so the reading
costs a decode and some arithmetic in the worker that is already there, four photographs at a
time, after the album is on screen. `sharpness` in the database is untouched and still does
its original job: ranking the frames of one burst against each other.

The cost is that it is recomputed on every album open. If a large album ever feels slow,
caching the reading is a later optimisation and needs no rethink of the metric.

## What the owner sees

A second review section under the near-duplicate one, in the same posture: nothing
preselected, every tick box labelled "Remove" beside the picture rather than floating
unlabelled on it, and two deliberate actions before anything goes. Photographs already
sitting in a near-duplicate group are left out — being asked about the same photograph twice,
in two different words, reads as two separate problems with the album.

The tiles wrap rather than scrolling sideways, unlike the near-duplicate rows: these
photographs are not being compared with one another, so there is no reason to hide any of
them off the edge.

## Phase 7 status

This closes a gap in Phase 7's checkpoint rather than opening new scope: the phase promised
cleanup suggestions over locally computed signals, and it was only delivering them for
photographs that arrived in pairs. Still outstanding under the phase is the later
"faces visible / eyes open" signal. **Neither the original checkpoint nor this addition has
been confirmed against a real album by a human** — the blurred beach photograph that prompted
this is the obvious first test.
