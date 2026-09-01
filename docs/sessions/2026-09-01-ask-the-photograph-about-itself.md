# Ask the photograph about itself

**Date:** 2026-09-01

The owner looked at the two readings on her tiles and said the numbers looked off. They were:
5.0, 5.0, 4.0, 5.0, 4.0. Two values, both whole.

## Why edge width could never work

A transition's width is measured by walking outward from its crest until the slope falls below
a third of its peak. In a photograph full of water ripples and wet pebbles, **the next edge
interrupts that walk after four or five pixels**. The width being measured is the spacing
between neighbouring edges, not the width of the blur — so every busy photograph saturates at
the same number however badly the camera missed. And a width is a whole number of pixels, so
the median across a frame can only ever be 4.0 or 4.5 or 5.0.

That is the fourth measure to fail on this album, and the four failures rhyme. Detail ratio,
crispest quarter, typical width — each asked a question *about* the photograph and needed a
number to compare the answer against, and those numbers are properties of the subject. Water
is dense with detail and skin is not, so the same reading means "sharp" in one frame and
"blurred" in another.

## What replaced it

Ask a question the photograph answers about itself: **blur it again and see how much it
changes.** A frame that came out has fine detail to lose and loses a great deal; a frame the
camera already blurred has little left and barely moves. The reading is the ratio between the
two, so whatever the subject brought to the picture divides out — a seascape and a portrait are
each compared only against themselves. This is Crété-Roffet's no-reference perceptual blur
metric (2007), which exists for exactly the problem this feature kept hitting.

Two departures from the published form, both found here:

- **Smooth the frame first.** Noise is one-pixel spikes, the re-blur wipes them out entirely,
  so a grainy frame looks like it lost a great deal of detail and reads sharp. Untouched, a
  frame blurred twenty pixels with a trace of grain read 0.213 against 0.269 for a sharp one —
  backwards, the same fault as every previous measure.
- **A twenty-five pixel re-blur, not nine.** At nine, a frame blurred past twelve pixels was
  already smoother than the re-blur, so re-blurring barely changed it and the reading fell back
  down: 20px blur read 0.370 against 0.515 for 6px. The worst photographs measured better than
  the merely soft ones.

Calibrated through the full reduction, with noise:

| | in focus | 3px | 6px | 12px | 20px |
| --- | --- | --- | --- | --- | --- |
| textured | 0.358 | 0.390 | 0.458 | 0.612 | 0.768 |
| textured, noisy | 0.354 | 0.384 | 0.446 | 0.573 | 0.657 |
| faces | 0.363 | 0.396 | 0.474 | 0.654 | — |
| faces, noisy | 0.375 | 0.407 | 0.472 | 0.646 | — |

Subject matter moves an in-focus reading by two hundredths and sensor noise by four
thousandths, while blur moves it by four tenths. No earlier measure came close: each of them
moved further with the subject than with the blur, which is why each of them failed.

The line is **0.42**.

## What it still gets wrong

A portrait shot deliberately against a thrown-out background reads 0.474 — past the line. The
owner named this herself while the work was going on: *"if faces are clear and there is blur
around them, it might be a good image."* Exactly so, and no measure of the whole frame can know
it, because the frame of a good portrait and the frame of a badly focused snapshot contain the
same mixture of sharp and soft. What separates them is *which part* is sharp.

That is the case for finding the people in a photograph and judging them rather than the frame,
which is now the next piece of work rather than a speculative one — it has a specific fault to
fix. It is recorded in a test that asserts what does hold (such a frame still reads clearly
sharper than the same scene blurred throughout) rather than a pass the measure does not earn.

## Rules this session leaves behind

- Prefer a measure that compares a photograph against itself over one that compares it against
  a number. Four measures here needed a constant calibrated across subjects, and no such
  constant exists.
- When a measure has a known failure, write the test that asserts the true behaviour and name
  the gap. A test that pretends the failure does not happen is worse than no test.
