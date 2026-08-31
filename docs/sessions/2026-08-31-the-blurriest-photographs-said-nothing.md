# The blurriest photographs were the ones it could not judge

**Date:** 2026-08-31

The owner sent the photograph itself, full size, and asked for the measure to be run against
that one picture rather than against the whole page. The picture could not be reached from
here — it arrived in the conversation, not as a file — but the request was the right one, and
answering it took one experiment rather than another round of theory.

## The experiment

Take a frame, blur it at camera size by increasing amounts, reduce it the way the app reduces
it, and measure at each size:

| lens blur | at camera size | at stored size | at thumbnail |
| --- | --- | --- | --- |
| none | 2.91 | 1.89 | 1.79 |
| 4px | — | 5.92 | 3.12 |
| 8px | — | — | 5.68 |
| 12px | — | — | 9.26 |
| **20px** | — | — | **no reading** |

The bottom row is the fault. **A photograph blurred past a certain point produced no reading
at all** — reported as impossible to judge, which on screen is indistinguishable from nothing
to say. The worse the photograph, the more certain the silence.

## Why

`edgeWidth` looks for strong edges and measures how far each transition runs. Heavy blur
destroys the very thing it looks for: no steep slopes anywhere, no crisp crest to a slope,
and transitions smeared wider than the search would follow. Three separate limits each turned
a badly blurred frame into "no edges found":

- a floor of two grey levels on what counted as a strong edge, which excluded every
  transition a badly blurred frame had left;
- a strict local maximum, where blur flattens the crest into a plateau;
- a ten-pixel limit on how far a transition could be followed.

All three were sensible for sharp photographs and wrong for the case the feature exists for.

## The fix, and how fog is still told apart

The floor drops to 0.6, plateaus are allowed, and a transition may run sixteen pixels. The
thumbnail column now reads 1.81 sharp, then 3.35, 4.11, 7.37, 11.37 as the blur grows —
monotonic, and every blurred one over the line.

Underneath that, a frame with almost no edges is no longer automatically unjudgeable. Fog and
a blank wall carry no tonal range at all; a badly blurred photograph still has dark and light
in it and simply no crisp transition between them. Measured: fog's strongest slopes are 0.8
grey levels, a badly blurred photograph's are 6.7 to 7.5. So a frame with real tone and no
measurable edge is reported as blurred, and only a frame with neither gets no reading.

## The shape of this mistake

Every guard in this measure was written while looking at sharp photographs and mildly soft
ones. Each one quietly encoded "if this looks like nothing, say nothing" — and a badly
blurred photograph looks like nothing to a measure built to find edges.

**A measure that fails silently on the worst instances of what it is looking for will always
look like it is working.** Six rounds of this feature were spent on the numbers; this round
was spent on the case where the numbers were never produced.
