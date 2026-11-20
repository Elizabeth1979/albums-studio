# "Sharpest" read the lawn

**Date:** 2026-11-18

## What the owner saw

A burst of four night photographs: three children behind a row of carved pumpkins, a tree
wrapped in fairy lights. On her phone the app called the frame where the boy in black is
smeared by movement **Sharpest**. On her laptop, same photographs, same code, it called a
different frame the sharpest and a frame where both boys stand still and crisp **Blurry**.

## Why

The burst ranking read `focusScore`: the variance of the Laplacian over contrast in 32px
squares, taken from the sharpest fifth of them. Run on her originals through the real chain
(upload processing to the 2000px stored copy, then `measureFocus` at `ANALYSIS_CEILING`), the
counted squares were the **grass and the paving stones**, almost none on the children. Static
background is identical across a burst, so the ranking measured how the lawn came out, not who
moved. Its premise, written in the code — "inside one group the subject is held still, so the
only thing varying is how well it came out" — is false for any burst of children.

Readings, her four frames (by eye: kicking best, jumping worst):

| frame | texture | blur ratio | denoised texture | relative, where frames differ |
| --- | --- | --- | --- | --- |
| jumping (boy in black smeared) | 5.44 | 0.296 | **0.076 (1st)** | 0.485 |
| kicking (both boys crisp) | **7.34** | **0.288** | 0.071 | **0.780** |
| girl blurred | 4.79 | 0.300 | 0.061 | 0.352 |
| girl blurred, 2 | 4.38 | 0.300 | 0.061 | 0.261 |

Every whole-frame measure tried ranks the jumping frame second or first. Denoising first, the
obvious repair, makes it worse. The margins are small enough that a different browser's
resampling flips the verdict, which is the phone/laptop disagreement.

BlazeFace found faces only in the kicking frame: the children's faces sit at about 6% of the
frame width, at the detector's floor, and blur pushes them under it.

## What was done

The verdicts are gone from the similar-photos screen, and so is everything that only existed
to produce them: `compareSharpness`, `sharpest`, `SimilarGroup.suggested`, the `texture`
reading, and `focusScore` with its test. Showing a wrong "Sharpest", differently per device, is
worse than showing nothing; the owner compares full size and decides. The `photos.sharpness`
column is still written at upload and now read by nothing — left alone rather than migrated in
a change about the interface.

## What works: person by person

EfficientDet-Lite0 (MediaPipe object detector, person class) finds all three children in the
jumping frame, the smeared boy at 0.47 confidence, where BlazeFace finds no one. Blur ratio
(`reblur.ts`, unchanged) measured inside each person's box, at the analysis scale, then compared
child against the same child in the other frames:

| child | jumping | kicking | girl blurred | girl blurred 2 |
| --- | --- | --- | --- | --- |
| girl | 0.406 | **0.337** | not matched | 0.435 |
| boy in white | 0.340 | **0.326** | 0.384 | 0.350 |
| boy in black | **0.403 worst** | **0.284** | 0.335 | 0.344 |

Ranking frames by their worst-off child gives kicking, girl blurred, girl blurred 2, jumping —
the owner's order. Texture inside the same boxes does not (the smeared boy reads 3.96 against
1.35 for a sharp one), so it is the re-blur ratio that carries this, not the boxes alone.

Known gaps before building on it: one child got two boxes in one frame (needs overlap
suppression); the girl was not matched in one frame because matching by centre within 0.12 of
the frame width loses a child who moved (match by left-to-right order or with a wider,
one-to-one assignment); the detector also reports a dog and garden objects at 0.1–0.3, so the
confidence floor has to be measured on real frames, not taken from the library. **One burst
is one example**: daytime bursts must agree before this ranks anything, and it should be
shown beside each frame before it is acted on. Cost: the float16 model is 7.3 MB (Apache 2.0),
downloaded once and cached.

## Built, in the same row as the eyes

Asked for, and built the same day. `lib/imaging/bodies.ts` finds people (int8 build: same
boxes and confidences as float16 on these frames, 4.6 MB rather than 7.3) and reads blur in
each; `lib/bodies.ts` follows them and decides, pure and tested. Three things the first run
on her photographs changed:

- **A Halloween ghost by the tree read 0.61 as a person**, and the girl, having moved 0.15
  of the frame, was matched to it by position. People are now followed by clothes colour as
  well as place, frame to frame rather than against one anchor frame. A person seen in one
  frame only is never shown.
- **The box carries background.** Read whole, the girl blurred in front of the lit trunk read
  barely softer than her best. Reading the middle half of each box caught her in two blurred
  frames of three and changed nothing for the boys. The third is the known gap.
- **A smeared boy arrives as two boxes**, one inside the other; the weaker is dropped.

The confidence floor is 0.4: a dog read 0.30 and 0.39, the smeared boy 0.47 to 0.68.

Final readings through the production code, middle half of each box (blurred marked *):

| child | jumping | kicking | girl blurred | girl blurred 2 |
| --- | --- | --- | --- | --- |
| girl | 0.432 * | 0.343 | 0.392 (missed) | 0.451 * |
| boy in white | 0.336 | 0.337 | 0.345 | 0.310 |
| boy in black | 0.399 * | 0.333 | 0.312 | 0.324 |
