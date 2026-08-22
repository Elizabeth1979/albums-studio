# Album page: sharpness, and what the first screen is for

**Date:** 2026-08-22

The owner reported three things about the album screen, from her own album on her own
machine: the photographs looked pixelated, switching between Masonry and Grid appeared to do
nothing, and the first screenful was mostly empty space before any photograph appeared.

## The photographs were being upscaled

The studio gallery only ever loaded the 400px thumbnail. A tile is about a third of a 78rem
canvas, so on a retina screen it is asking for close to 800 device pixels — the thumbnail was
being stretched to roughly twice its size, and in `grid` the square crop threw away a third
of it first. Rendered against a detailed test image the result is heavy aliasing on any fine
structure, which is exactly what "pixelated" describes.

The visitor's view had already solved this in Phase 6: it offers the thumbnail and the stored
2000px image together in a `srcset` and lets the browser choose. The studio now does the
same, which repairs albums that are already uploaded rather than only ones added from here
on. Both objects are signed in the one round trip that used to sign only thumbnails.

The cost is that a retina screen fetches 2000px images for tiles it draws at 400 CSS pixels.
`loading="lazy"` bounds it to what is scrolled into view, and a non-retina screen still takes
the thumbnail. **A mid-size rendition — around 1000px, written at upload alongside the other
two — is the real answer if this ever shows up as a bandwidth complaint.** It was not built
here because it would not have helped the album that prompted the report: existing photos
have no such object, and re-processing them is its own piece of work.

### One test had to change to keep meaning what it said

`uploads.spec.ts` proved the bytes arrived by asserting `naturalWidth > 0`. With a `srcset`
present, `naturalWidth` is density-corrected — the intrinsic width divided by the chosen
candidate's descriptor over its laid-out width — so the stub's one-pixel stand-in against a
`2000w` descriptor reports `0` for an image that arrived and decoded perfectly. The check now
awaits `decode()`, which asks the question the test was always asking and still rejects when
the bytes never came.

## Masonry and Grid really do look the same, for the photographs people actually have

Not a rendering bug. With photographs of varying shape the two layouts are obviously
different. With a phone album — every frame 4:3, which is the normal case — three equal
columns of 4:3 and three equal columns of 1:1 crops differ only in the crop.

There is a second, worse difference hiding behind that. Masonry is CSS `columns`, which fills
**column-major**: photographs 1, 2, 3 run down the first column while grid runs them across
the first row. The album has explicit Move earlier / Move later controls, so the owner's
ordering is real, and masonry silently reads it in the wrong direction. Nobody had noticed
because the arrangement looks identical either way.

**This is left open, with a recommendation.** Either make masonry row-major — CSS grid with a
row span computed from each photograph's aspect ratio, which also gives it genuinely varied
heights — or drop the choice and keep one layout. Row-major spans need `width` and `height`
in the `shared-album` payload, which does not carry them today, or the owner's view and the
visitor's view would disagree about the same album. Shipping the move below without deciding
this would be hiding a broken feature rather than fixing it.

## The first screen belongs to the album

Two changes, no new capability:

- The layout switch moved from above the photographs to its own **Arrangement** section
  below them, next to Sharing. It is a setting about how photographs are arranged, not a step
  on the way to adding them, and at the top it stood between the owner and the thing she
  opened the album to work on. That section is also where further arrangement options belong
  if any are added.
- The drop zone collapses to a single row once an album holds photographs. An empty album has
  nothing else to offer and keeps the full zone and its full explanation; a full one gets the
  button and a one-line version of the same reassurance. What leaves the device is still
  stated either way — it is not something to say once and then hide.

On a 1280x900 desktop the first photograph moves from below the fold to about 535px down the
page; on a 390x844 phone two rows of photographs are visible without scrolling.
