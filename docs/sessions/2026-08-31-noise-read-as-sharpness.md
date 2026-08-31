# The camera's own noise read as sharpness

**Date:** 2026-08-31

The owner asked whether the technique should change — measure the *people* in a photograph
rather than the frame — and whether that needs a vision model or whether reliable classical
methods exist. Two experiments answered it, and the second found a fault that no amount of
face detection would have fixed.

## Experiment one: the frame hides its subject

A person blurred at camera size, standing in a scene that came out crisp:

| subject blurred by | subject fills 25% of the width | 50% |
| --- | --- | --- |
| 4px | 1.82 | 1.82 |
| 8px | 1.82 | 1.82 |
| 14px | 1.82 | 1.83 |

The crisp scene alone read 1.80. **A person taking up half the frame, blurred past all use,
moved the reading by three hundredths of a pixel.** The measure pools the crispest quarter of
the frame's edges — a rule written so that a portrait against a deliberately blurred
background would pass — and with no idea where the subject is, it takes the sharpest thing
present to *be* the subject. The owner's instinct was right: knowing where the people are is
the only way to close that.

## Experiment two: the fault that had to be fixed first

Before adding anything, the same frames were measured with the noise every camera writes:

| blur | clean | ±2 levels | ±5 | ±10 |
| --- | --- | --- | --- | --- |
| none | 1.80 | 1.75 | 1.63 | 1.00 |
| 6px | 4.09 | 2.01 | 1.33 | 1.00 |
| 12px | 9.58 | 1.95 | 1.00 | 1.00 |
| **20px** | **14.31** | **1.67** | **1.00** | **1.00** |

Read the bottom row against the top. A frame blurred twenty pixels at camera size, carrying
a trace of noise no photograph is without, measured **1.67 against 1.80 for a sharp one** —
the worse the photograph, the sharper it measured. Grainy fog, which should be unjudgeable,
reported a confident 1.00.

The mechanism: noise is one-pixel spikes, steep slopes with nothing either side. A blurred
frame has no steep slopes of its own left, so the spikes became its strongest gradients, set
the threshold for what counts as an edge, were then found as edges, and each one is a pixel
wide. Every scene in the calibration harness was built from arithmetic and carried no noise,
which is how a measure that collapses on every real photograph passed every test.

## The fix

Two changes to `edgeWidth`, both aimed at the same mechanism:

- **Smooth the picture before looking for slopes** (σ 1.5). A real edge is many pixels of
  agreement; noise is none. Every edge widens by the same amount, sharp and blurred alike, so
  the readings shift up together and nothing is lost but the noise.
- **Anchor the edge threshold to the picture's own contrast**, not only to where a slope
  falls among the others. A blurred photograph now has to produce a genuine transition to be
  measured at all, and finds none — which is the truth about it.

Recalibrated through the full reduction, with noise:

| | in focus | 3px | 6px | 12px | 20px |
| --- | --- | --- | --- | --- | --- |
| textured, clean | 4.72 | 5.57 | 7.60 | 12.00 | 19.03 |
| textured, noisy | 4.63 | 5.23 | 6.55 | 9.35 | 7.52 |
| faces | 4.32 | — | 7.00 | 11.70 | — |
| sharp subject, blurred background | 4.37 | — | — | — | — |

Every in-focus reading, any subject, any noise, lands between 4.3 and 4.8 — half a pixel of
spread. Everything missed by six pixels or more reads at least 6.5. The line moved to **6.0**,
and a frame softened by three pixels at camera size — one pixel once it is a thumbnail — goes
unmentioned on purpose.

`SOFT_EDGE_WIDTH` has now moved three times, and each time it broke tests about ticking boxes
and confirming removals. Those readings are now written as `SHARP` and `BLURRED` relative to
the line, so the next recalibration cannot fail a test that has nothing to do with it.

## On the face question

Measuring the people is the right next step, and it is what the culling tools photographers
buy already do: Narrative Select runs its assessments on each detected face and scores focus
per face, and Aftershoot buckets frames by blur and closed eyes the same way. Neither needs a
cloud vision model, and neither should this: face **detection** is a small, reliable local
model (BlazeFace, through MediaPipe), while judging sharpness stays the classical edge-width
measure — run on the face rather than on the frame. Sending a family album to a vision API
would cost money per photograph, add latency, and put private pictures on someone else's
server to answer a question arithmetic can already answer.

It is held until the owner reports what her album now reads, because experiment two showed
that the *whole-frame* measure was broken for every photograph, blurred subject or not. If
the picture she keeps reporting is caught by this fix, the frame was the problem. If it is
still passed over while the count says it was measured, the subject is being hidden by a
crisp background, and face detection is the answer.

## Rules this session leaves behind

- Every real photograph carries noise. A calibration scene built from arithmetic and measured
  without it describes a photograph that has never existed.
- When a measure is wrong, find out *why* before changing what it looks at. The proposed fix
  here was a good one aimed at a real fault, and would have shipped on top of a measure that
  was broken for every photograph in the album.
