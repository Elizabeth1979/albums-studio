# Search her own words

2026-11-18 to 2026-11-20. Phase 10's first slice: the owner searches everything she has
written, across every album, with no AI and no cost.

## What shipped

- `public.search_library(search_text)`, a `security invoker` SQL function. It reads album
  titles, descriptions and stories, captions, alt text and story notes, and returns one row
  per piece of text that matched, with the album, the photograph and its thumbnail path.
  Executable by `authenticated` only; revoked from `public` and `anon` by name.
- A search box on the library, above the albums once there are any. Results show the
  photograph, its album, where the words were found and the words themselves, highlighted.
  A photo result opens that photograph's editor in its album; an album result opens the album.
- `/albums/:slug?photo=:id` opens a photograph on arrival, so a result is a real address.

Verified against the hosted project: migration recorded as `20261118125542`; `anon` cannot
execute it, `authenticated` can; a trial run inside a rolled-back transaction found real text
in the owner's own album; security and performance advisors show nothing new. The
`client_paths.sql` checks for search were written and added, but the full run had not been
confirmed when this was written: the approval prompt for it timed out twice.

## Decisions and why

- **One database function, not client queries.** Six fields across three tables would be six
  round trips, each with its own escaping, and the join from a story note to its album rebuilt
  in TypeScript. Invoker rights keep RLS and column grants in charge; the explicit
  `owner_id = auth.uid()` filter is there because `albums_select` also admits public albums,
  and a library search must not list other people's.
- **Plain case-insensitive substring matching, every word in the same text.** The `english`
  text-search configuration stems and would mangle Hebrew; `simple` matches whole words only,
  so "birth" would not find "birthday". `ILIKE` handles both languages. LIKE's own wildcards
  are escaped, so a typed `%` is a character. A few hundred photographs per owner make a scan
  cheap; a trigram index is the next step if that stops being true.
- **The parameter is `search_text`,** a name no column has, so a filter cannot quietly
  compare a column with itself. The checks include a term that matches nothing.
- **No visitor search.** The roadmap's checkpoint also asks that shared viewers search only
  visible text. Nothing reachable without an account was built; that half is withdrawn from
  this slice rather than met.
- **Search runs on submit, not per keystroke,** and a failed search says "The search did not
  run" in an alert, never "nothing matches".
- **The phone budget moved from 400px to 490px.** The search row pushes the first album card
  from 376px to 481px on a 412x915 screen. Searching is how a photograph is found once there
  are more albums than a screen holds, so it was given the row; the label stays visible and
  the explanatory line is hidden on phones only (still read by screen readers). This is the
  owner's call to reverse.

## Found on the way

- A photograph chosen before the album finished loading never opened its editor: the dialog
  is only in the page after loading, and the hook that opens it ran once, before it existed.
  The unit suite cannot see this (jsdom shows a closed dialog's contents); the end-to-end
  test caught it. The editor now opens only once loading has ended.
- A visually hidden "Search your albums" heading matched every test that looks for a
  "Your albums" heading. The search has no heading now; the form is a search landmark.

## Not confirmed

- The owner has not tried it on her own albums and phone.
- The `client_paths.sql` run including the new search checks (see above).
