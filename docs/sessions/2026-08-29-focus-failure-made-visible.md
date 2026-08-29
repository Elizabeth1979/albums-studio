# Silence that could not be told apart from success

**Date:** 2026-08-29

Third report from the owner: the blurred photograph is still not offered. Two rounds of
fixes, both merged, both green, and the album still says nothing.

## The design fault underneath all three rounds

`measureFocus` returned `null` for two entirely different situations: a photograph with too
little contrast anywhere to judge, and a photograph whose bytes could not be read at all. The
album treated both the same way — by saying nothing.

**An album where nothing could be measured and an album with nothing to report looked
identical.** That is why three rounds of debugging were blind: every hypothesis about
thresholds assumed the measurement had run, and nothing on screen could confirm it had. The
threshold work may well have been right and irrelevant.

Silence is only honest when something was actually measured.

## What changed

- `measureFocus` returns one of three outcomes — `measured`, `unjudgeable`, `failed` — instead
  of a number or null.
- The album reports the third: "N photographs could not be checked for focus." A footnote
  rather than a warning, because nothing is wrong with the photographs themselves, but
  visible, because the alternative is what happened here.

## And the most likely reason it was failing

The bytes were read by fetching the signed URL the tiles are drawn from. **An `<img>` may
display a URL that script is not allowed to read.** Drawing a picture needs no permission to
read it; measuring it does. So every tile could render perfectly while every measurement
failed, and the old code caught that and returned null — silence again.

The thumbnail now comes through `photoBytes`, which uses the Supabase client's own download,
the same authenticated path already used everywhere else here. This was not confirmed against
the live site — outbound access from the working environment is blocked to both the site and
the storage host, so it could not be — but it is the failure the visible message will now
identify if it is still happening.

## Why no test caught it

The end-to-end suite intercepts every Supabase call in the browser, so a stubbed response
never has the cross-origin properties of a real one. **The suite proved the measurement works
on bytes it was handed, never that the app can obtain those bytes.** There is now a test for
the download failing, which is the closest this suite can get to the real thing.

## What the owner will see next

One of three outcomes, and each says something different:

- The blurred photograph is offered — the threshold work was right and this was the last
  fault.
- Nothing appears and no message — the measurement ran on every photograph and judged them
  all acceptable, so the threshold is genuinely too strict for her pictures.
- "N photographs could not be checked" — the reading is still failing, and the message names
  how many.

Before this, all three looked the same.
