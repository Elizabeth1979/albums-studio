# The album was measuring the wrong copy of every photograph

**Date:** 2026-08-31

The owner sent the album's own readings, which is the thing this feature had never had:

> Focus check: read 8 of 8. Edge widths 2.9, 3.0, 3.2, 3.3, 3.5, 3.6, 3.7, 3.8 — anything
> over 6.0 is offered above.

Eight photographs, one of them plainly blurred, spread across nine tenths of a pixel. No line
drawn anywhere in that range separates anything. The measure was not mis-calibrated; it was
being handed a picture with the evidence already removed.

## What was wrong

The album downloads two copies of every photograph: a 400px thumbnail and the 2000px stored
image. The tiles are drawn from the stored image — that was fixed months ago, because tiles
drawn from the thumbnail rendered visibly soft. **The focus check was still measuring the
thumbnail.**

A thumbnail is a tenfold reduction of what the camera wrote, and every reduction takes the
blur down with everything else. A frame the lens missed by twenty pixels arrives at 400px
missing it by two — which is what a sharp photograph looks like. The stored image was already
in the browser, already paid for, and never looked at.

Measured on the same scenes at both sizes:

| lens blur | at 400px | at 800px |
| --- | --- | --- |
| none | 4.73 | 4.73 |
| 2px | 5.22 | 5.65 |
| 4px | 6.09 | 8.11 |
| 8px | 9.30 | 11.42 |

Separation roughly doubles, at no extra download.

Not larger than 800, though: the transition search reaches sixteen pixels, and past that a
badly blurred frame's edges run off the end of the search and it measures *narrow* again — at
1200px an 8px blur read 4.65, below a sharp frame. The measure and the size it runs at go
together, and raising one without the other reintroduces the fault of two sessions ago.

## The readings now say which photograph they came from

The tuning line printed its readings sorted: 2.9, 3.0, 3.2 … which cannot answer the only
question that decides where the line belongs — *what does the blurred one read?* Each
photograph now carries its own reading on its tile. It comes out with the rest of the tuning
line.

## Rules this session leaves behind

- Measure the best copy already in hand. Two sessions were spent tuning a threshold against a
  picture that had been reduced tenfold before anyone looked at it, while a five-times better
  copy sat in the same page.
- A diagnostic that reports a *set* of numbers cannot be acted on. Report each number attached
  to the thing it describes.
