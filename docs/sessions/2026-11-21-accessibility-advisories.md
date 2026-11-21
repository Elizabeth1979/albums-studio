# Accessibility advisories, real and not

2026-11-21. Worked through the 16 advisories AEE v0.8.0 posted on pull request #95. Each was
checked against the code before anything changed, because announcing what does not need
announcing makes a screen reader noisier, which is a harm of its own.

## Fixed: seven real faults

- **Stepping through photographs said nothing.** The viewer's slide region was live only in a
  paused slideshow. It is now polite whenever it is not playing by itself, and it holds the
  position ("2 of 5"); the visible counter is hidden from screen readers so it is not read
  twice.
- **Story notes changed in silence.** Saving, editing, deleting and changing who can read a
  story now say so, and a delete lands focus on the "Story notes" heading instead of losing it
  with the button that went.
- **Choosing the album cover lost focus.** The button pressed is replaced by the "Album cover"
  note; focus now moves to the note as it appears. Moved on the note's arrival, not after a
  timer: a timer raced the album page marking the cover, and the test failed only under load.
- **The story form opened without saying so.** Focus now goes into its first field, and back to
  the button that opened it on Cancel, as the other in-place forms already did.
- **The upload count could go unheard.** Its live region was created together with its text,
  which `LiveStatus` exists to avoid. It now uses `LiveStatus`.
- **No main heading while renaming an album.** The title becomes the field; a visually hidden
  `h1` keeps the page's heading.
- **The architecture page had no main landmark.** Its sections are now in `<main>`.

## Left alone: false positives, and why

- **Results already announced by a status message**: the new album row ("Added … to your
  library."), story notes ("Story saved."), questions ("2 new questions."), the cost panel.
  AEE flags the changed content itself; WCAG 4.1.3 is met by the status message.
- **Content arriving while a page finishes loading**: "No photos yet", "1 photo", "1 of 1
  photos has nothing written about it yet", the photo hint. These vary between runs with the
  machine's speed, which is the sign that they are timing, not behaviour.
- **The slideshow's counter while it plays by itself**: silent on purpose (WAI carousel
  guidance, and the 2026-11-18 slideshow log). AEE's report on the first push of this work
  did surface one real fault at that edge: a step taken *by hand* while it plays was silent
  too. A separate polite region now says where a hand step landed ("3 of 5: The pier"); the
  timer's steps stay silent. AEE will go on flagging the slide text itself, which is correct
  behaviour.
- **The search box appearing after the first album**: nothing opened it; there is now
  something to search.
- **"2 of up to 20 chosen."**: each checkbox already says whether it is ticked.

What would change this: AEE learning to credit a status message announced by the same press,
and to ignore content that arrives after a loading state. Both are changes to AEE, not here.
