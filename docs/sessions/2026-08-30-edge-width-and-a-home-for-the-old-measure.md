# Measuring blur properly, and giving the old measure the job it is good at

**Date:** 2026-08-30

Two things after the false positive: the blur advice was rebuilt on a measurement that
actually tracks focus, and the measurement it replaces was moved to the one place where it is
the right tool rather than being deleted.

## The new reading: how wide an edge is

Blur does something a subject cannot fake — it widens edges. A sharp photograph crosses from
one side of an edge to the other in a pixel or two whether the edge is a face against the sky
or a wave against sand; a blurred one takes four, six, ten.

`edgeWidth` finds the strong edges (with a threshold taken from the picture itself, because
"strong" means something different in a seascape and a portrait), measures how many pixels
each transition runs for, and reports the mean of the **crispest quarter** of them. The
crispest quarter, not the average: most edges in a portrait with a deliberately blurred
background belong to that background and are wide on purpose. Averaged over the whole frame
that photograph measured exactly on the line; judged on its crispest edges it is the furthest
of all scenes from it.

Measured through the real reduction — blurred at camera size, shrunk to a thumbnail, rounded
to whole numbers:

| | textured | faces |
| --- | --- | --- |
| in focus | 1.78 | 2.00 |
| barely soft | 1.94 | 2.00 |
| soft | 2.78 | 2.47 |
| blurred | 3.11 | 3.00 |
| plainly blurred | 5.7 | 5.9 |
| sharp subject, blurred background | 1.73 | — |

**Subject matter moves this by two tenths of a pixel. Blur moves it from 1.8 to 5.9.** The
measure it replaces moved five-fold with subject matter, which is the whole story of the last
six rounds. The line sits at 2.8, forty per cent clear of every in-focus reading.

## Where the old measure went

Not deleted. `focusScore` — local detail relative to contrast, with the quantisation floor
subtracted — now ranks the frames **inside a near-duplicate group**, which is Phase 7's
"app suggestion for best one or two photos" and was previously served by the whole-frame
variance stored at upload.

That is the one condition under which counting detail is sound: a group is the same picture
taken more than once, so the subject is held still and the only thing left varying is how
well each frame came out. It reads local squares rather than the whole frame, so a face sharp
against a blurred background is ranked on the face, and it discounts the false detail that
8-bit rounding adds. Neither is true of the stored number it replaces there.

The measure was never wrong. It was answering "how much is going on in this picture", which
is a question about subject matter — useless for judging a portrait against a seascape, and
exactly right for judging one frame of a burst against the next.

## What is asserted, and what is not

Asserted, for both dense texture and smooth faces: sharp photographs read below the line,
blurred ones above it, a sharp subject against a blurred background reads below it, and a
frame with no edges gets no reading at all. Also that shrinking a photograph before measuring
narrows its edges and hides blur — the guard from an earlier round, still biting.

**Not** asserted: that `focusScore` swings more with subject matter than `edgeWidth` does.
It is true of real photographs and it is the reason for this change, but these synthetic
scenes do not reproduce it — fractal texture is not as dense as water and the smooth scene is
not as smooth as skin, so the two swing about equally here. A scene invented to demonstrate
it would be a scene fitted to the conclusion. The evidence is the real album, recorded in the
previous session log.
