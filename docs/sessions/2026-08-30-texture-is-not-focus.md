# The measure was reading texture, not focus

**Date:** 2026-08-30

The album comparison shipped, and the first thing it did in a real album was offer a sharp
close-up of the owner and her husband — faces plainly in focus — as out of focus.

## Why, and why it invalidates the measure rather than the threshold

The reading is fine detail divided by contrast. **How much fine detail a photograph carries
is a property of its subject, not of its focus.** Rippling water, wet sand and foliage are
dense with it. Skin, sky and a blue sea are not.

So a sharp portrait reads *lower* than a mediocre photograph of waves. Judging photographs
against their album — which fixed the scale problem from the previous round — made this
worse rather than better: in an album of beach scenes, the one portrait is the outlier, and
the comparison points straight at it.

Every threshold discussion for five rounds assumed the reading tracked focus. It tracks
texture, and the two coincide only when the subject matter is held constant.

## What has been done now

The comparison is withdrawn and the absolute floor stands alone, which means the feature
offers nothing on these albums. That is deliberate. This product's stated trade — written
into the first version of this feature and true throughout — is that missing a blurred
photograph costs nothing while condemning a good one costs the owner's trust in every
suggestion the studio makes. A false positive on a photograph of her own face is the exact
failure the design was meant to avoid, so it goes off until the reading is right.

`SOFT_SHARE_OF_ALBUM`, `ENOUGH_TO_COMPARE` and `median` stay in place for that work.

## What the reading has to measure instead

Blur widens edges. A sharp photograph has crisp transitions whether it is a face against the
sky or a wave against sand; a blurred one takes several pixels to get from one side of an
edge to the other. Edge width is close to independent of how many edges a scene contains,
which is exactly the property this measure lacks. It is also what the no-reference blur
literature settled on — CPBD, JNB, and Marziliano's edge-width metric are all built on it,
and that research was done in this same session before the first version was written, then
not used.

A first prototype is in the working notes and is not good enough: bounding the transition
search stops sharp portraits reading as blurred, but it also stops finding enough edges in
textured scenes to judge them at all. Getting that right — edge detection, a width estimator
that is stable under JPEG, and a threshold calibrated against real photographs rather than
generated ones — is the next piece of work, and it is a rewrite of the measure rather than
an adjustment to it.

## The honest accounting

Six rounds. Two genuine bugs found and fixed along the way (measuring after the photograph
had been shrunk, and 8-bit rounding read as detail), one diagnostic that finally made the
owner's report legible, and a measure that was answering the wrong question the entire time.

The research that named the right approach was done before any code was written. It was not
followed, because Laplacian variance was already in the codebase and looked close enough.
