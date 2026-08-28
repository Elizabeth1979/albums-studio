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

## An absolute floor, deliberately low

`src/lib/focus.ts` reads sharpness against `SOFT_SHARPNESS = 60`. An absolute line is only
meaningful because the measurement is taken at a fixed 256px analysis size, so the same
photograph always produces the same number regardless of what the camera wrote. Real
photographs carry texture everywhere — sand, foliage, hair, water — and in focus they measure
in the hundreds or thousands; a visibly blurred frame collapses to single or low double
digits.

The line sits well under any plausible in-focus reading rather than at the midpoint, because
the two mistakes are not symmetrical. **Missing a soft photograph costs nothing** — the owner
scrolls past it exactly as she does today. **Calling a deliberately soft photograph blurred
asks her to consider deleting a picture she meant to keep**, and a suggestion that does that
twice stops being read at all. A low-contrast subject — fog, a pale sky — can measure low
while being perfectly in focus, which is the second reason to stay conservative. If real
albums turn out to hold blurred photographs this floor walks past, raising it is one
constant.

Below half the floor the reading is spoken as "Out of focus" and above it as "Looks soft".
The number itself never reaches the interface, for the same reason a Laplacian variance never
did in Phase 7: 7432 is neither good nor bad, and the picture is the evidence.

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
