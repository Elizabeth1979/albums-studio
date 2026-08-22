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

## Masonry and Grid really do look the same — so the choice was withdrawn

Not a rendering bug. With photographs of varying shape the two layouts are obviously
different. With a phone album — every frame 4:3, which is the normal case — three equal
columns of 4:3 and three equal columns of 1:1 crops differ only in the crop.

There is a second, worse difference hiding behind that. Masonry is CSS `columns`, which fills
**column-major**: photographs 1, 2, 3 run down the first column while grid runs them across
the first row. The album has explicit Move earlier / Move later controls, so the owner's
ordering is real, and masonry had been reading it in the wrong direction since Phase 2.
Nobody had noticed because the arrangement looks identical either way.

Put to the owner as a decision — make masonry row-major, or keep one layout — she chose to
keep one for now and pick the work up in a later phase. So:

- **The interface offers no layout choice at all.** Not in the album page, not in the create
  form, and no badge on the library card. `Album` has no `layout` field, `createAlbum` sends
  none, and `updateAlbumDetails` cannot write one.
- **Everything renders equal tiles, reading across the rows** — three columns wide, two on a
  phone, in the studio and in the visitor's view alike. That is the arrangement whose reading
  order matches what Move earlier / Move later promise. Cropping is confined to the tile: the
  whole photograph is one tap away in the editor and in the visitor's lightbox.
- **The database was not touched.** `albums.layout`, its check constraint and its column
  grants are all still there, holding whatever each album was created with. Withdrawing a
  choice from the interface is reversible; a migration that drops the column is not, and the
  later phase needs the field anyway. New albums take the column's own default because
  nothing sends a value.

**Phase 7.5 in the roadmap** records what a version worth having needs: a row-major masonry
built on grid row spans from each photograph's aspect ratio, `width` and `height` added to
the `shared-album` payload so the owner's view and the visitor's view cannot disagree, and
the standard that a layout choice earns its place only when the options produce visibly
different albums from the same photographs.

## The first screen belongs to the album

Two changes, no new capability:

- The layout switch left the top of the page. It first moved to its own **Arrangement**
  section below the photographs; when the choice itself was withdrawn a few minutes later,
  the section went with it. Either way it is no longer the first thing between the owner and
  the album she opened.
- The drop zone collapses to a single row once an album holds photographs. An empty album has
  nothing else to offer and keeps the full zone and its full explanation; a full one gets the
  button and a one-line version of the same reassurance. What leaves the device is still
  stated either way — it is not something to say once and then hide.

On a 1280x900 desktop the first photograph moves from below the fold to about 535px down the
page; on a 390x844 phone two rows of photographs are visible without scrolling. The album
creation form lost its layout radios in the same pass, so it is now title, description and
the button on one row.
