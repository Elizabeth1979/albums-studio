# Calibrated at a size we do not use

**Date:** 2026-09-01

The handoff written this morning concluded that no statistic over a whole frame can separate
the owner's album, and that the feature should move to finding faces and judging those. The
conclusion still stands. The evidence behind it did not: every number it rests on came out of
a pipeline whose constants had been fitted at a size the app stopped using two pull requests
earlier.

## The mismatch

- `measureFocus` reduces the 2000px stored image to `ANALYSIS_CEILING`, which is **800px**.
- The calibration harness reduced its camera frame to `THUMBNAIL`, which was **400px**.

`THUMBNAIL = 400` was correct when it was written in #45, because the check really did read
the 400px thumbnail then. #53 moved production to the stored image at 800px and touched nine
files; the harness was not one of them. #55 then rewrote that harness for `blurRatio` and kept
the 400.

So `BLURRED_ENOUGH`, `DENOISE` and `REBLUR_SPAN` were every one of them fitted at 400px and
then used at 800px. Nothing failed, for two reasons: the harness calls `blurRatio` directly
rather than through `measureFocus`, and `measureFocus` — the only function that picks the size
— had no test at all.

## Why the size changes the answer

`REBLUR_SPAN` is a fixed count of pixels. Halving the frame doubles it relative to the picture,
so the same frame read through the same code gives:

| blur at camera size | at 400px | at 800px |
| --- | --- | --- |
| in focus | 0.358 | 0.362 |
| 3px | 0.390 | 0.458 |
| 6px | 0.458 | 0.603 |
| 12px | 0.612 | 0.784 |
| 20px | 0.768 | 0.825 |

The left column is the table in the previous session log to three decimals, which is how the
mismatch was confirmed. The right column is what actually ran on her site. A 3px softening was
documented as going unmentioned on purpose; at the size the app uses it read 0.458, past the
0.42 line. The product invariant was being protected by luck.

## What changed

The harness now models the chain the app performs and imports the sizes rather than restating
them: a frame blurred at camera size, reduced to `FULL_SIZE`, rounded as a stored JPEG holds
it, reduced to `ANALYSIS_CEILING`, rounded again. Setting `ANALYSIS_CEILING` to 400 or to 1600
now fails the suite in both directions.

Re-derived at the right size, and blur named in stored-image pixels (roughly half what the
lens did, since a phone frame is halved on its way into storage):

| blur in the stored image | textured | + noise | faces | + noise |
| --- | --- | --- | --- | --- |
| in focus | 0.362–0.381 | 0.344–0.380 | 0.338–0.353 | 0.344–0.358 |
| 1.5px | 0.374–0.393 | 0.354–0.392 | 0.354–0.368 | 0.357–0.371 |
| 3px | 0.404–0.424 | 0.377–0.423 | 0.393–0.405 | 0.389–0.402 |
| 6px | 0.487–0.508 | 0.433–0.505 | 0.502–0.504 | 0.486–0.489 |
| 10px | 0.603–0.623 | 0.488–0.616 | 0.641–0.646 | 0.618–0.620 |
| 15px | 0.716–0.740 | 0.507–0.717 | 0.763–0.769 | 0.731–0.732 |

`DENOISE` and `REBLUR_SPAN` both survive re-checking, and both sit in narrower windows than
anyone had established: at a span of 9 a sharp textured frame reads 0.621 and fog reads 0.526;
at 15 a sharp frame still reads 0.470; at 40 a frame the lens missed by 10px falls back to
0.446 and goes unoffered. Twenty-five is right, and it is right *for 800px* — the two numbers
cannot be changed independently, which is now said where both are defined.

The line moved from **0.42 to 0.46**, and it is set from her album rather than from the table.
The table only says the line may go anywhere between 0.424 and 0.488. Her five real readings —
0.23, 0.27, 0.32, 0.32, 0.41 — say where inside that range it should go. The highest is her
selfie: sharp faces against a beach thrown deliberately soft, a good photograph and the most
dangerous frame this feature will ever see. At 0.42 the line sat one hundredth above it. It
now sits five hundredths above it, which is the invariant applied literally rather than
narrowly survived.

## What this does not fix

Nothing on her site changes. Her blurred photograph reads 0.32, mid-pack among four sharp
ones, and was never near either line. The correction does not rescue the whole-frame approach
— it establishes that the case against it was argued from numbers that meant something else,
and now means what it says. The next piece of work is unchanged: find the people in the
photograph and judge them.

Two claims in the handoff were softened rather than kept: that the measure catches a 6px
camera blur (it does not, at the size that runs — that band overlaps in-focus, and the overlap
is now an assertion), and that there is nothing left to tune (there was one thing, and this
was it).

## Rules this session leaves behind

- A calibration harness must import the size, and every other constant, that production uses.
  A restated copy is a mismatch waiting for someone to notice on a live site.
- When a signal fails on real data, check that what shipped is what was calibrated before
  concluding the signal cannot work.
