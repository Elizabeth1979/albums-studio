# The first slideshow

2026-11-18. Phase 9's first slice: an album played as a timed slideshow in the browser. No
music, no export, no database change.

## What shipped

- `src/lib/slideshow.ts`, pure and tested: slide count (story first), how long each slide
  stays, stopping at the end, where Play resumes, and which way a swipe goes.
- `PhotoLightbox` gained an optional `playback`: a pause control, the story as slide 0, and
  Space to pause. Swipe and a one-ahead look-ahead serve the ordinary viewer as well.
- `Slideshow` — the Play button and its timer — on the owner's album page (beside the hint
  above the grid) and in the shared album's header.

## Decisions and why

- **One viewer, not two.** The lightbox already had the dialog, focus trap, Escape, focus
  return and wrapping steps; the slideshow is that viewer with a timer.
- **Published captions only, for the owner too.** The owner may read hidden captions
  anywhere else, but a slideshow is put on a screen for other people; pressing Play should
  never put a private caption on the television. What would change it: the owner asking for
  a "just for me" playback.
- **Caption, not story notes.** A note under a photograph is a paragraph; at five seconds a
  slide it is gone before it is read. The album story gets its own slide, timed by length at
  about 180 words a minute (6 to 45 seconds).
- **Stops on the last photograph.** A slideshow watched together has an end; Play from there
  starts over.
- **Five seconds a photograph** — a common default, not measured. Worth asking the owner
  after she has watched one.
- **One photograph ahead, the stored 2000px image.** That is the best copy already signed;
  the 1080px display copy would be cheaper but is not offered to visitors yet. Two decoded
  2000px frames are about 24 MB, well inside a phone tab; a whole album would not be.
- **Reduced motion: starts paused, no fade.** The fade is declared only under
  `prefers-reduced-motion: no-preference`.
- **Screen readers:** the slide region is `aria-live="off"` while playing and `polite` when
  paused, as the WAI carousel pattern gives, so a playing slideshow does not talk over
  everything every five seconds. The pause button is first in the dialog and gets focus.

## Not verified

- Swipe on a real phone (covered by unit tests with synthetic pointer events only).
- Whether five seconds feels right.

## Found while building

- An end-to-end check that the next photograph is fetched ahead passed with the look-ahead
  deleted: a visitor's grid already loads every image, so the request it waited for always
  came. It is a unit test now, watching what the viewer itself fetches.
- The Play button first wrapped under the owner's hint and pushed her first photographs 34px
  past the phone first-screen budget (554 of 520). It now shares the hint's line.

## Choosing the photographs (2026-11-21)

- `photos.in_slideshow`, on by default, so every album that existed plays as before. A flag on
  the photograph rather than a list on the album: it goes with the row, and reordering needs
  nothing kept in step. Recorded as `20261121052540`; `client_paths.sql` 0 of 73 failed with
  three new checks; advisors showed nothing new.
- `get_shared_album` returns it, and `display_path` beside it: a parallel change adds that
  column to the same function, and whichever lands second must carry both.
- The chooser sits under "Slideshow" below the photographs, folded away, so the phone's first
  screen still starts with the pictures. Music will join it there.
- A photo left out stays in the album for visitors; it only stops playing. The `shared-album`
  Edge Function passes the flag on and must be redeployed for visitors to see the choice.
