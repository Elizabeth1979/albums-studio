# Albums Studio documentation

Use this file to find durable project decisions without duplicating the documents themselves.

**Keywords:** roadmap, sessions, React, authentication, AI Story Studio, albums, captions,
story notes, alt text, sharing, private Storage, signed URLs, Supabase, RLS, accessibility,
AI cost.

## Current state

- The React and TypeScript application has email/password authentication, an album library
  (create, open, rename, describe, relayout, delete), and photo upload.
- Photos are resized to 2000px with a 400px thumbnail, hashed (pHash) and scored for
  sharpness in a Web Worker, then uploaded four at a time with retry. Measurements are
  stored so Phase 7 duplicate detection and best-shot ranking need no model calls.
- Owners sign their own thumbnail URLs from the browser; Storage checks its policy against
  the caller's token first. Shared viewers have no token and still need Phase 6 server code.
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
- The `photos` bucket is private and owner-namespaced. Shared delivery will use short-lived
  signed URLs from trusted server code.
- Authentication covers password sign-in, magic links, and password reset. Password inputs
  carry a reveal toggle, and a recovery link must reach the set-a-new-password step before
  the library opens.
- `albums.layout` is `masonry` or `grid`, checked in the database. Later layouts widen that
  constraint in the migration for the phase that renders them.
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
- Checks run on every push and pull request via `.github/workflows/ci.yml`.
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

When adding or materially changing a document under `docs/`, update its entry here.
