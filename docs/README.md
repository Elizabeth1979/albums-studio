# Albums Studio documentation

Use this file to find durable project decisions without duplicating the documents themselves.

**Keywords:** roadmap, sessions, React, authentication, AI Story Studio, albums, captions,
story notes, alt text, sharing, private Storage, signed URLs, Supabase, RLS, accessibility,
AI cost.

## Current state

- The React and TypeScript application has email/password authentication and an album
  library: albums can be created, opened, renamed, described, relayouted, and deleted.
- Addresses are real routes: `/` for the library, `/albums/:slug` for one album. History-API
  routing, because Supabase delivers auth tokens in the URL hash.
- Accessibility is checked by axe-core in CI across ten screens, at WCAG 2.0/2.1 A and AA.
- Phone layout is covered by an end-to-end suite at a 412x915 viewport, including a guard on
  field height and a check that no page scrolls sideways.
- Supabase is healthy and its complete migration history is committed.
- The minimal schema is `profiles`, `albums`, `photos`, and `ai_usage`, all protected by
  RLS and explicit Data API grants.
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
- Next: Phase 3 browser-side upload into the private `photos` bucket.

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

When adding or materially changing a document under `docs/`, update its entry here.
