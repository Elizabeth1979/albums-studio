# The crispest quarter measures the subject, not the focus

**Date:** 2026-08-31

With each photograph's reading shown on its own tile, the owner's album answered the question
this feature has been circling for a week:

| photograph | reading |
| --- | --- |
| **selfie, tack sharp, two faces** | **3.9** |
| the blurred one she has been reporting | 3.8 |
| boy and windsurf group, sharp | 3.6 |
| boy on the shore, sharp | 3.1 |
| distant windsurfer, sharp | 3.0 |

**Her sharpest photograph reads higher than her blurriest one.** No threshold placed anywhere
in that column separates anything, and no amount of recalibration will change that.

## Why

One line:

```ts
const counted = Math.max(1, Math.round(widths.length * 0.25))
```

The frame is judged by the crispest quarter of its transitions. The reasoning was sound — a
portrait against a deliberately blurred background is a photograph that came out right, so
judge the frame by its best part rather than its average. The statistic is not.

**Every real photograph has crisp edges somewhere.** A glint on water, a compression artefact,
a scrap of distant high-contrast detail. So the crispest quarter bottoms out at the same floor
whatever the camera did, and what moves it above that floor is how much *smooth* content the
frame holds — which is a fact about faces and sky, not about focus. A selfie made mostly of
skin has fewer very-crisp edges than a seascape, so it reads blurrier. That is the same fault
that retired `focusScore` three sessions ago, in a new statistic.

No synthetic scene could have caught this. Scenes built from arithmetic do not carry
compression artefacts or specular glints, so their crispest quarter behaves.

## What was done

`transitionWidths` now collects the edge widths once, and two poolings are taken from it:
`edgeWidth` (the crispest quarter, as before) and `typicalEdgeWidth` (the median). Both are
reported on every tile. **The advice is unchanged** — nothing new is offered for removal — so
this cannot produce a false positive while the two are compared.

Measured against the scenes on hand, the median separates whole-frame blur where the crispest
quarter does not:

| scene | crispest quarter | median |
| --- | --- | --- |
| sharp textured | 4.7 | 7.0 |
| sharp faces | 4.3 | 5.0 |
| blurred faces 6px | 7.0 | 7.0 |
| blurred textured 6px | 7.6 | 10.0 |
| blurred textured 12px | 12.0 | 16.0 |
| **soft person in a sharp scene** | **4.0** | **5.0** |

Two things to note before trusting it. The median still moves with the subject — sharp texture
reads 7.0 where blurred faces read 7.0 — and it is just as blind as the crispest quarter to a
soft *subject* in a sharp scene, which is the case face detection exists for. Which of those
two the owner's blurred photograph is, only her album can say, which is why both numbers are
now on the tiles.

## Rules this session leaves behind

- A statistic that behaves on generated scenes may be measuring an artefact of how they were
  generated. Real photographs carry compression, glints and grain; scenes built from arithmetic
  carry none of it, and every one of those has broken a measure here.
- When a signal is not trusted yet, show it without acting on it. Two numbers on a tile cost
  nothing and settle in one round what three rounds of argument could not.
