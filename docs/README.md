# Repo memory — index of plans, specs & sessions

The single entry point to everything written *about* Albums Studio, as opposed to the code
itself. Start here when picking up work or asking "did we already decide X?".

**Keywords:** memory, index, plans, sessions, AI-led, AI Story Studio, proactive AI,
freemium, paywall, trial quota, free AI, open-source AI, Hugging Face, local AI, Python,
voice, text input, speech, transcript, commands, multimodal AI, LLM stories, albums,
layouts, gallery, captions, hidden captions, story notes, audio notes, image regions, manual
alt text, accessibility, semantic search, LLM search, curation, dedupe, phash, best shot,
collage, slideshow, music, movie export, video export, face recognition, consent, BYOK,
subscription, Supabase, RLS, sharing, Family Travels.

---

## 🟢 Active project state (read this first)

**Nothing is built yet.** The schema is applied and the plan is written; there is no
application code.

- **Supabase is live.** Project name `albums-studio`, ref `vsxbedlsnfmsbnlfayae`, region
  `eu-central-1`. Eight tables with RLS (`profiles`, `albums`, `photos`, `people`,
  `face_embeddings`, `album_shares`, `library_shares`, `ai_usage`), a `photos` storage
  bucket, and pgvector enabled. Schema is version-controlled in
  [`supabase/migrations/`](../supabase/migrations/). This is the initial v0 schema; later
  roadmap phases need additional migrations listed in the active roadmap's known schema gaps.
- **Product direction:** Albums Studio is productized albums and AI-led Story Studio, not a
  travel-map clone or blog clone. MVP is albums, upload, selectable layouts, captions/story
  notes/manual alt text, AI Story Studio drafts/suggestions, and sharing. Voice and text are
  input methods. Captions/stories can be visible or hidden/search-only. Photo curation avoids
  paid AI where deterministic, local, open-source, or Hugging Face options are enough.
- **Next up:** Phase 1 of the plan — scaffold, Supabase auth, a `profiles` row on signup,
  and an empty library where a signed-in user can create an album shell.
- **Undecided:** frontend stack (React recommended), public bucket vs signed image access,
  layout schema, blog layout depth, caption/story visibility schema, story region model,
  Studio interaction behavior, AI draft/suggestion schema, freemium trial design,
  platform-key economics, free-tier storage quota, and
  eventual Family Travels import. See the plan's open questions.

---

## 📋 Plans

- [plans/2026-08-15-albums-studio-roadmap.md](plans/2026-08-15-albums-studio-roadmap.md) —
  **active.** The build plan: gated phases from scaffold to layouts, upload, text
  foundation, AI Story Studio, sharing, local photo curation, collages, slideshow/movie
  export, AI-assisted search, AI alt drafts, and faces.

## 📓 Session logs

- [sessions/2026-08-15-roadmap-reorder.md](sessions/2026-08-15-roadmap-reorder.md) —
  recorded the decision trail: Albums Studio is product-first, blog/map optional, now
  AI-led for story creation/search/actions, with voice/text as input methods and
  captions/story notes/manual alt text as the owner-control layer.

---

## Convention — keep this index current

When you add or meaningfully change a doc under `docs/`, add or update its one-line entry
here. New plans go in `docs/plans/`, session logs in `docs/sessions/`. This index is the
durable, greppable counterpart to Claude's private cross-session memory.
