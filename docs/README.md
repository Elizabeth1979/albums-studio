# Repo memory — index of plans, specs & sessions

The single entry point to everything written *about* family-albums, as opposed to the code
itself. Start here when picking up work or asking "did we already decide X?".

**Keywords:** memory, index, plans, sessions, alt text, accessibility, dedupe, phash,
best shot, collage, face recognition, consent, BYOK, subscription, Supabase, RLS, sharing.

---

## 🟢 Active project state (read this first)

**Nothing is built yet.** The schema is applied and the plan is written; there is no
application code.

- **Supabase is live.** Project ref `vsxbedlsnfmsbnlfayae`, region `eu-central-1`. Eight
  tables with RLS (`profiles`, `albums`, `photos`, `people`, `face_embeddings`,
  `album_shares`, `library_shares`, `ai_usage`), a `photos` storage bucket, and pgvector
  enabled. Schema is version-controlled in [`supabase/migrations/`](../supabase/migrations/).
- **Next up:** Phase 1 of the plan — scaffold, Supabase auth, a `profiles` row on signup.
  Then Phase 2 (upload) and Phase 3 (alt text, the wedge).
- **Undecided:** frontend stack (React recommended), platform-key economics, free-tier
  storage quota. See the plan's open questions.

---

## 📋 Plans

- [plans/2026-08-15-family-albums-plan.md](plans/2026-08-15-family-albums-plan.md) —
  **active.** The build plan: seven phases from scaffold to faces, the cost model that
  shapes pricing, and why alt text leads.

## 📓 Session logs

_None yet — the first working session will add one (see the convention in `CLAUDE.md`)._

---

## Convention — keep this index current

When you add or meaningfully change a doc under `docs/`, add or update its one-line entry
here. New plans go in `docs/plans/`, session logs in `docs/sessions/`. This index is the
durable, greppable counterpart to Claude's private cross-session memory.
