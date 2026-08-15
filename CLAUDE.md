# Project notes for Claude

## What this is

An AI photo album product. Users upload photos; the app writes accessible alt text, finds
duplicates, picks the best shot of a burst, builds collages, and groups faces. Owners share
albums with whoever they choose — by secret link, without forcing viewers to register.

**Alt text is the wedge.** Google Photos already does the other four features well and
produces almost no usable alt text. Lead with accessibility; the rest are table stakes.

Predecessor: `family-travels`, a Drive-backed family travel map. It is finished and is not
being migrated. Its schema shape and Gemini vision plumbing were the only things worth
carrying over.

## Supabase — the schema is the repo's, not the dashboard's

Project ref `vsxbedlsnfmsbnlfayae`, region `eu-central-1`.

`supabase/migrations/` is the source of truth. **Never change the hosted database without
committing the migration that did it** — the two drift apart silently and you will not
notice until something breaks.

Two operational rules learned the hard way:

- **Never apply a migration while a project is `COMING_UP`.** It reports success, and a
  finishing restore then overwrites the schema. Check `get_project` status first.
- **Verify with `list_migrations`, not `list_tables`.** The latter can show tables that a
  restore is about to erase.

## Cost model — check before adding an "AI feature"

Only alt text needs a paid API. Duplicate detection is perceptual hashing, best-shot is
Laplacian sharpness plus a local face mesh, collages are layout, and face *grouping* is a
local embedding model. All of those run in the browser for free.

Before reaching for a model call, ask whether classical image processing already solves it.
Usually it does.

## Faces and consent — not optional, not later

Faceprints are biometric data: GDPR Article 9 special-category (this project runs in the
EU) and the subject of nine-figure BIPA settlements.

- `people.consent` is an explicit state (`pending`/`granted`/`declined`/`withdrawn`). Only
  `granted` may be processed.
- Embeddings live in `face_embeddings` so withdrawal deletes biometrics without touching
  photos.
- Faces and people are owner-only under RLS, however widely an album is shared.
- Ship the deletion path in the same release as the feature.

## API keys — never in the browser

Users may bring their own provider key. Store it as a Supabase Vault secret; decrypt only
inside an Edge Function. A key that reaches the client can be drained by any XSS on the
site, and that is a disclosable breach.

## Alt text — always reviewable

Never publish AI-generated alt text without a review path. Wrong alt text is worse than
none: it actively misleads the people who depend on it. `alt_source` distinguishes `'ai'`
drafts from `'human'`-confirmed text.

## Repo memory — docs index

`docs/README.md` is the index of plans, specs, and session logs. Read it first when picking
up work or checking "did we already decide X?". When you add or meaningfully change
anything under `docs/`, update its entry there.

## Session logs

At the end of a working session, write a short searchable log to
`docs/sessions/YYYY-MM-DD-<topic>.md`: what we set out to do, key findings, decisions made
and why, artifacts produced, and the next step. Add a keyword line near the top so it is
greppable. Keep it narrative — link to plans rather than duplicating them.
