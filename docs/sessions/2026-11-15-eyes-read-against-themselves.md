# Eyes read against themselves

**Date:** 2026-11-15

The owner wants the best frame of a moment to be one where nobody blinked. This round adds
the eye reading and shows it; it does not yet act on it.

## Measured before anything was built

MediaPipe's Face Landmarker, with blendshapes, run in a real browser on MediaPipe's own test
portrait (a real photograph of a laughing man) and on variants made from it:

| Input | Faces found | Eyes-closed score (mean of both eyes) |
| --- | --- | --- |
| Portrait, eyes open, laughing | 1 | 0.26 |
| Same, eyes edited shut | 1 | 0.66 |
| Same, 4px blur | 1 | 0.25 |
| Portrait in a 2000px frame, filling a quarter of its width (face about 7% of the frame) | **0** | — |
| Same at 12% and 6% | 0 | — |
| Cut-out around the face from those frames: face 134px wide | 1 | 0.28 |
| Face 64px wide | 1 | 0.25 |
| Face 32px wide | 1 | 0.34 |

Three things follow, and each is now in the code:

1. **The model finds no face on its own once a person is small in the frame.** It looks
   through the same 128-pixel detector as BlazeFace. So `eyes.ts` reads cut-outs of the
   boxes the tiled detector in `faces.ts` already found, from the 2000px stored image —
   never a thumbnail, where a 5%-wide face is 20 pixels and the model gives out near 32.
2. **A laugh scores 0.26 with the eyes open.** Any fixed line would mark happy faces as
   blinks. `blinks.ts` compares each person only with themselves in the other frames of
   the same moment, which is also what spares a kiss or a laugh photographed five times.
3. **Blur barely moves the score,** so a soft frame is not mistaken for a blink.

## What is not known

No real blink has been measured. The "eyes shut" row is a photograph edited by hand, and
Wikimedia was unreachable from the build machine. `BLINK_MARGIN` (0.25) sits between 0.26 and
0.66 with room either side, and is a starting point, not a finding. The score at 32px drifts
up by 0.08, which a margin of 0.25 tolerates and a smaller one might not.

## What ships

- An "Eyes" row under each group of near-identical photographs: each person's close-up,
  frame by frame, the score beside it, and "Eyes closed?" where the same person reads open
  in another frame. A photograph with no sibling is never judged on eyes.
- A plain sentence when the eyes could not be read, with the reason — never silence.
- Nothing is marked down, preselected or hidden.
- The model (3.6 MB) is committed beside BlazeFace and fetched only by albums that have
  near-identical photographs with faces.

## Next

The owner photographs a short burst with a deliberate blink and opens it in the album. The
scores on screen set `BLINK_MARGIN`. Only then does a blink lower a frame's ranking.

## Then: smiling, and facing the camera

The same model, with its face transform switched on, read the same portrait:

| Input | Smile (0-1) | Head turn, sideways / up-down | Eye-direction score (highest of eight) |
| --- | --- | --- | --- |
| Facing the camera, laughing | 0.95 | 2° / 4° | 0.18 |
| Mirrored | 0.95 | -2° / 3° | 0.31 |
| Eyes edited shut | 0.94 | 2° / 5° | **0.67** |
| Tilted 20° | 0.86 | 5° / 5° (tilt itself read as 21°) | 0.31 |

- **Smile is steady,** so a face reads as smiling at 0.5 or above (`SMILE_LINE`). No real
  neutral face has been measured; the line is provisional.
- **Facing the camera is judged by the head, not the eyes.** The head angles are accurate —
  a 20° tilt read as 21° — while the eye-direction scores jumped from 0.18 to 0.67 when the
  eyes were merely closed. Using eye direction would turn every blink into "looking away"
  as well. A head turned more than 25° either way (`TURN_LIMIT`) reads as turned away.
- Turning a head cannot be faked in a flat photograph, so the sideways limit has not been
  seen to fire on a real face. The matrix arithmetic behind it is tested on its own.

Both show beside the eyes in the same row, and like them change nothing yet.
