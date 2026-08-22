# Albums Studio documentation

Use this file to find durable project decisions without duplicating the documents themselves.

**Keywords:** roadmap, sessions, React, authentication, AI Story Studio, albums, captions,
story notes, alt text, sharing, private Storage, signed URLs, Supabase, RLS, accessibility,
AI cost.

## Current state

- The React and TypeScript application has email/password authentication, an album library
  (create, open, rename, describe, delete), and photo upload.
- Photos are resized to 2000px with a 400px thumbnail, hashed (pHash) and scored for
  sharpness in a Web Worker, then uploaded four at a time with retry. Measurements are
  stored so Phase 7 duplicate detection and best-shot ranking need no model calls.
- Owners sign their own image URLs from the browser; Storage checks its policy against
  the caller's token first. Shared viewers have no token and still need Phase 6 server code.
- Both the studio gallery and the visitor's view offer the thumbnail and the stored 2000px
  image together in a `srcset`. A tile is about a third of a 78rem canvas, so a retina screen
  needs close to 800 device pixels and the 400px thumbnail alone rendered visibly soft. A
  mid-size rendition written at upload is the follow-up if this costs too much bandwidth.
- Addresses are real routes: `/` for the library, `/albums/:slug` for one album. History-API
  routing, because Supabase delivers auth tokens in the URL hash.
- Accessibility is checked by axe-core in CI across ten screens, at WCAG 2.0/2.1 A and AA.
- Phone layout is covered by an end-to-end suite at a 412x915 viewport, including a guard on
  field height and a check that no page scrolls sideways.
- Supabase is healthy and its complete migration history is committed.
- The minimal schema is `profiles`, `albums`, `photos`, `photo_stories`, and `ai_usage`,
  all protected by RLS and explicit Data API grants.
- Owners write three separate kinds of text about a photo: a caption (private by default,
  publishable per photo), alt text (always delivered, since it exists to be read out), and
  story notes (several per photo, each with its own visibility). Writing alt text records
  `alt_source = 'human'` so a Phase 5 AI draft can never quietly overwrite it.
- Hidden text is hidden in the database, not only in the interface. `get_shared_album`
  returns a caption only when it is marked visible, and `anon` holds a named column list on
  `photos` that excludes `caption`. Story notes have no anon grant at all.
- Album cards in the library show a cover photo. The first photo into an album with no cover
  becomes one, and the owner can choose a different photo from its editor. An album that
  already has a cover keeps it, so an upload never overrules a choice.
- A photo can be removed on its own, after a confirmation, and its bytes go with it. If it
  was the album's cover, the next photo takes over: the foreign key nulls the cover when its
  photo goes, which would otherwise leave a full album showing an empty card.
- Photos can be reordered with Move earlier / Move later rather than dragging, which works
  the same for touch, keyboard and screen readers. A move swaps one pair, so the cost does
  not grow with the album; `listPhotos` breaks ties on id so a half-applied swap cannot make
  the album reshuffle itself.
- Deleting an album removes its stored objects as well as its rows. Storage holds no foreign
  keys, so nothing does this by itself: paths are collected while the rows exist, the rows go
  next, and the bytes last, so a failed delete can never strand an album full of broken
  images. `supabase/checks/orphaned_objects.sql` finds anything that still slips through.
- The `photos` bucket is private and owner-namespaced. Shared delivery will use short-lived
  signed URLs from trusted server code.
- Authentication covers password sign-in, magic links, and password reset. Password inputs
  carry a reveal toggle, and a recovery link must reach the set-a-new-password step before
  the library opens.
- **Albums have one arrangement, and it is not a choice.** Equal tiles in three columns,
  two on a phone, reading across the rows — the same in the studio and for a visitor. The
  masonry/grid switch was withdrawn on 2026-08-22: for a phone album of uniformly 4:3 frames
  the two were indistinguishable, and masonry's CSS `columns` read the owner's ordering down
  the columns while Move earlier / Move later promise it runs across the rows. Deferred to
  **Phase 7.5** in the roadmap, which says what a version worth having would need.
- `albums.layout` is still `masonry` or `grid`, checked in the database, with its column
  grants intact. Nothing was migrated away and no album lost its value; the client simply
  stopped writing and reading the column. `createAlbum` sends no `layout`, so the column
  default stands. Phase 7.5 starts by widening the constraint.
- Renaming an album leaves its slug untouched, because the slug is the stable half of a
  future share URL.
- Phases 1 and 2 pass type checks, component tests, `App` state-machine tests, an
  end-to-end Chromium suite, a production build, and a dependency audit. They are deployed
  to [albums-studio.vercel.app](https://albums-studio.vercel.app), where sign-in and
  password reset have been confirmed by hand.
- Magic-link delivery has never succeeded in production. The one real attempt was refused
  with `over_email_send_rate_limit` because it followed a reset email by five seconds.
- Auth mail still comes from Supabase's built-in sender, which delivers only to addresses
  on the project organization's team. Owner email arrives for that reason; nobody else's
  would. Custom SMTP is a prerequisite for opening signup — see roadmap open question 12b.
- An album can be shared with a link, from its own page: a visibility switch, the link with a
  copy button, and a "replace this link" action that retires every copy already handed out.
  `public` stays in the enum and is offered nowhere — a link is unguessable and revocable,
  which `public` is not.
- `/shared/:token` renders before the sign-in gate, so a visitor never meets a login form.
  Images reach them through the `shared-album` Edge Function, the only place holding a key
  that can sign a private object for someone with no session. It accepts a token and nothing
  else, and answers identically for a wrong token, a rotated one, and a withdrawn album.
- Share links are token-gated in the database: `get_shared_album` and
  `get_shared_album_stories` serve an album only for its own token and only while its
  visibility is `link` or `public`, and hidden captions and unpublished stories never leave.
  The owner reads or rotates the token through `album_share_token` /
  `rotate_album_share_token`; rotation retires every link handed out.
- Checks run on every push and pull request via `.github/workflows/ci.yml`.
- Every automated test fakes the database: the unit suite mocks the Supabase client and the
  end-to-end suite intercepts the network. `supabase/checks/client_paths.sql` is the
  counterweight — it runs the client's real writes against the real schema as `authenticated`
  and `anon`, then rolls back. Run it after any migration. It reproduces all four faults that
  reached the deployed app past a green suite.
- Next: Phase 5 AI Story Studio. Phases 1 to 4 are done and deployed.

## Plans

- [Albums Studio roadmap](plans/2026-08-15-albums-studio-roadmap.md) — active phased build
  plan and open product decisions.

## Architecture

- [Project structure](project-structure.md) — visual frontend/backend map, planned services,
  and album lifecycle state machine.

## Session logs

- [Roadmap reorder](sessions/2026-08-15-roadmap-reorder.md) — established the AI-led,
  human-approved product direction.
- [Security and repository cleanup](sessions/2026-08-15-security-cleanup.md) — restored
  migration history, reduced the schema, tightened authorization, and adopted `AGENTS.md`.
- [Phase 1 authentication](sessions/2026-08-15-phase-1-auth.md) — scaffolded the frontend,
  connected Supabase Auth, and added the protected empty library.
- [Password recovery, tests, and Phase 2 albums](sessions/2026-08-16-phase-2-albums.md) —
  added the password reveal toggle and reset flow, the recovery-session guard, the
  end-to-end suite and CI, album shells with masonry and grid layouts, and a pre-Phase-3
  review that added routing, album descriptions, and enforced accessibility.
- [Phase 3 upload spine](sessions/2026-08-17-phase-3-upload.md) — browser-side resize,
  thumbnail, perceptual hash and sharpness in a worker, with a throttled upload queue.
- [Phase 4 captions, story notes, and alt text](sessions/2026-08-17-phase-4-text.md) — the
  photo editor, per-photo visibility choices, and the grant and share-function fixes that
  had to land before any text could be called hidden.
- [Album first fold and image sharpness](sessions/2026-08-22-album-first-fold.md) — served
  full-size images to studio tiles, collapsed the drop zone for albums that already hold
  photos, and withdrew the masonry/grid choice after finding the two indistinguishable and
  masonry's reading order wrong.

When adding or materially changing a document under `docs/`, update its entry here.
