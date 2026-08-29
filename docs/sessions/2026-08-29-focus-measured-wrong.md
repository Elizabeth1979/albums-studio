# The blur advice that shipped green and saw nothing

**Date:** 2026-08-29

The out-of-focus review from the day before was merged with 385 unit tests, 125 end-to-end
tests and a hand-checked threshold. Opened on the album that prompted it, it said nothing at
all. The owner's report — "the blurry image is still not suggested for delete" — was exactly
right, and the interesting part is why every test disagreed with her.

## First, what it was not

Two plausible explanations were checked and dismissed before touching any code, because
guessing at a threshold is how the first version happened.

- **Not the near-duplicate exclusion.** Photographs already grouped as near-duplicates are
  deliberately left out of the blur section. Measured against the real album, the closest
  pair of photographs is 24 bits apart and grouping needs 10 or fewer, so nothing was being
  hidden.
- **Not a near miss on the threshold.** Every photograph in that album measured between
  1606 and 13910 on the stored whole-frame variance. The original `SOFT_SHARPNESS = 60`
  would not have flagged a single one — the first version could never have worked, at any
  album.

## Fault one: shrinking a photograph destroys the evidence of blur

Focus is a property of the frame the camera wrote. Everything downstream removes some of it:
the stored image is a fraction of the camera's width, the thumbnail a fifth of that again,
and the measurement then shrank the thumbnail once more to 256px. **Blur shrinks with the
photograph.** A frame blurred by eight pixels at camera size is blurred by half a pixel by
the time it is judged, which is to say sharp.

Measured through the real reduction, a photograph the lens plainly missed read **0.65** where
a sharp one read **1.23** — barely told apart, both above the line, nothing ever flagged.
Measured at the thumbnail's own size the same pair reads **0.33** and **0.98**.

The tests had blurred images that were already small, which describes a photograph nobody has
ever taken.

## Fault two: pixels are whole numbers

With that fixed, the same fixture still read 0.45 in a real browser and 0.31 in the test
suite. The pixels were identical — the planes matched to two decimal places — so the
difference was in what was done with them.

Rounding to 8 bits is itself a source of detail, with a variance of 1/12, and the Laplacian
multiplies the variance of anything uncorrelated by the sum of its squared weights: twenty.
Every square therefore carries about 20/12 of detail that is not detail. That fixed amount
divided by a square's contrast lands hardest where contrast is lowest — and taking the
sharpest fifth of squares then seeks those inflated readings out. A blurred photograph read
three times higher on real pixels than on the arithmetic behind them.

`focusScore` now subtracts that floor. Browser and arithmetic agree to within a percent.

## Where the line sits now

`SOFT_FOCUS = 0.4`, from scenes blurred at camera size, reduced the way the app reduces, and
rounded to whole numbers:

| | reading |
| --- | --- |
| in focus | 0.90 and above |
| sharp subject, blurred background | 0.64 and above |
| barely soft | 0.51 – 0.56 |
| soft enough to mention | 0.30 – 0.33 |
| plainly blurred | 0.18 and below |
| fog, blank wall | no reading |

The threshold is no longer a number in a comment. `focusScore.test.ts` asserts the constant
itself falls inside the gap those scenes leave, with a tenth of margin on each side, so
moving it in either direction fails.

## The tests that would have caught this

Each was verified by putting the bug back and watching it fail:

- **Blur at camera size, then reduce.** Every scene starts at 1200x900, is blurred there, and
  is put through the same averaging a canvas performs.
- **Round to whole numbers.** The harness quantises the thumbnail, because a stored image
  does.
- **A frame with no fine detail must read as having none** — the direct statement of fault
  two, tuned to low contrast where the false detail actually dominates.
- **Shrinking further must raise the reading** — the direct statement of fault one, kept as a
  test so the shortcut cannot be taken again.
- **An end-to-end fixture blurred at the level that discriminates.** The old fixture was
  blurred so far past the line that it read as blurred at any size, which is why it caught
  nothing. `softPng` is blurred to where a lens actually misses: offered at the size the app
  measures, invisible if anything shrinks it first.

## A flake, found on purpose rather than dismissed

The full suite failed once and passed the next ten times. Run under deliberate CPU
contention it reproduced: the new blurred-background scene took longer than vitest's
five-second limit. The value was never wrong, only late.

Fixed by building each scene once per seed, blurring the background by 8px instead of 20,
and giving this one file an explicit timeout — rather than by measuring smaller frames, which
is the exact shortcut that hid the bug in the first place.

## Still unconfirmed

The thresholds are calibrated against scenes built to span the failure modes, and against one
real album's stored measurements — **not against the owner's actual photographs, which no
test here can see.** Whether her beach photograph is now offered, and whether anything she
meant to keep came with it, is still the only check that matters and it has not been made.
