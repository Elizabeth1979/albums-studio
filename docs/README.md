# Albums Studio documentation

Use this file to find durable project decisions without duplicating the documents themselves.

**Keywords:** roadmap, sessions, AI Story Studio, albums, captions, story notes, alt text,
sharing, private Storage, signed URLs, Supabase, RLS, accessibility, AI cost.

## Current state

- No application code exists yet.
- Supabase is healthy and its complete migration history is committed.
- The minimal schema is `profiles`, `albums`, `photos`, and `ai_usage`, all protected by
  RLS and explicit Data API grants.
- The `photos` bucket is private and owner-namespaced. Shared delivery will use short-lived
  signed URLs from trusted server code.
- Next: scaffold authentication and an empty album library.

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

When adding or materially changing a document under `docs/`, update its entry here.
