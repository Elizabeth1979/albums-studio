# Albums Studio repository guidance

## Start here

- Read `docs/README.md` for current state and decision history.
- Use `docs/plans/2026-08-15-albums-studio-roadmap.md` for sequencing; do not copy it into
  other files.
- Prefer the smallest implementation that satisfies the current phase. Add later-phase
  tables and dependencies only when that phase begins.

## Product invariants

- The core loop is photos plus owner context -> AI draft or suggestion -> owner review ->
  published result.
- Voice and text are equal input methods. AI output is always editable and draft-first.
- Never silently delete photos or execute destructive or sharing actions without confirmation.
- Shared viewers must not need an account.
- Accessibility, privacy, and predictable AI cost are product requirements.

## Database and security

- `supabase/migrations/` is the complete schema history and source of truth.
- Before applying a migration, confirm the hosted project is `ACTIVE_HEALTHY`. Verify the
  recorded migration and run security and performance advisors afterward.
- Never edit an applied migration; add a forward-only migration.
- A `SELECT` policy is what filters `RETURNING`, and PostgREST makes every insert an
  `INSERT ... RETURNING`. A select policy that looks the row up through a `STABLE` function
  cannot see a row the same statement is creating, so it silently blocks inserts. Test
  ownership against the row's own columns and reserve lookups for rows that already exist.
- Client writes are granted per column. A new column the client writes needs its
  `grant insert`/`grant update` in the same migration that adds it, and the grant must be
  confirmed against `information_schema.column_privileges` afterwards. No test catches a
  missing grant: the unit suite mocks the client and the end-to-end suite intercepts the
  network, so both pass against a schema that would refuse the write.
- Enforce tenant ownership in constraints as well as RLS. Do not trust a client-supplied
  `owner_id` by itself.
- Keep privileged functions outside exposed schemas unless they are intentional public RPCs.
- Keep share tokens in the private schema. Public album rows and ordinary client queries must
  never expose bearer credentials.
- Keep the `photos` bucket private. Store paths, not permanent URLs; issue short-lived signed
  URLs from trusted server code after reauthorizing every request. Database paths must begin
  with the owner's UUID and match the Storage object namespace.
- Publishable keys may be used in the browser. Secret keys and AI provider keys never may.

## Working conventions

- Preserve user changes and avoid unrelated rewrites.
- Do not add dependencies without a current use.
- After schema changes, verify migration history, RLS, grants, constraints, Storage policies,
  and Supabase advisors.
- Update `docs/README.md` when adding or materially changing a document under `docs/`.
- Add a short session log only for work that changes durable decisions or project state.
