# Project notes for Claude

## What this is

A productized, AI-led Story Studio. Users work with photos through AI-led suggestions,
voice/text input, captions/story notes/manual alt text, and drafts that turn images plus
spoken/written owner context into stories, blog sections, captions, search context,
slideshow scripts, and accessible descriptions. They can curate near-duplicates/bursts,
choose presentation layouts, and share albums by secret link without forcing viewers to
register.

**Build AI-led, but human-approved.** The key product loop is photos + spoken/typed owner
context -> AI Story Studio suggestions/drafts/actions -> owner review/edit/confirm ->
published album/blog/slideshow. AI should lead suggestions so the user does not need to
think through every next step. Voice is an input method, not the brand; text input must work
equally well for accessibility and preference. Captions and stories can be visible in the
album or hidden behind the scenes for organization/search. Manual alt text should feel
similar to Slack or Twitter. AI output must remain draft-first until the owner accepts it,
and destructive/share actions must require confirmation.

Blog and map views are optional. The predecessor was travel-specific, but this product must
work for weddings, client shoots, school events, portfolios, family albums, technical
projects, and trips. Treat blog/map as layouts, not the product center.

## Collaboration rule — critical product advisor

Act like a critical senior product manager and AI-first product advisor, not an agreeable
note-taker. The owner wants sharp product judgment based on real user behavior, UX patterns,
market expectations, competitive products, pricing, and AI-first product experience.

Do not agree with product direction just because the owner suggested it. Treat new ideas as
hypotheses to evaluate. When a decision matters, gently challenge it, name the tradeoffs,
suggest 2-3 viable alternatives, and let the owner choose. Good pushback should protect the
MVP, cost model, accessibility, privacy, product coherence, and ability to become best in
market without dismissing the idea.

Default response pattern for meaningful product changes:

- Restate the idea in neutral terms.
- Compare it to what users already understand from existing products when relevant.
- Name what is strong about it.
- Name the risks, hidden costs, UX friction, monetization issues, or contradictions.
- Offer alternatives, including the simplest MVP-compatible version and the most
  differentiated/best-in-market version.
- Recommend a path, but ask the owner to choose when the decision has meaningful
  consequences.

Predecessor: `family-travels`, a Drive-backed family travel map. It is finished and is not
being migrated yet. Use it as a reference product and likely future import source, not code
to clone. The useful pieces are the no-account sharing model, photo-gallery behavior, and
lessons from Drive/App Script limitations.

## Supabase — the schema is the repo's, not the dashboard's

Project name `albums-studio`, ref `vsxbedlsnfmsbnlfayae`, region `eu-central-1`.

`supabase/migrations/` is the source of truth. **Never change the hosted database without
committing the migration that did it** — the two drift apart silently and you will not
notice until something breaks.

Two operational rules learned the hard way:

- **Never apply a migration while a project is `COMING_UP`.** It reports success, and a
  finishing restore then overwrites the schema. Check `get_project` status first.
- **Verify with `list_migrations`, not `list_tables`.** The latter can show tables that a
  restore is about to erase.

## AI-led cost model

AI is a core product cost because the differentiator is proactive multimodal story creation
and search over images plus spoken/written owner context. Track usage through `ai_usage`;
support BYOK/platform keys before broad launch.

Do not offer unlimited platform-paid AI on the free tier. Free should include strong
non-AI/local value and possibly small AI trial credits for alt drafts, AI search, or one/few
AI Story Studio drafts. Ongoing AI-led creation, proactive suggestions, transcription, and
larger AI search quotas belong behind paywall or BYOK.

Before paying for AI, evaluate free/open options: browser libraries, Python libraries,
open-source models, and Hugging Face models. This is especially important for transcription,
image-quality scoring, duplicate/near-duplicate detection, embeddings, face/eyes-open
signals, and local semantic search. If open/local quality is good enough, prefer it because
it improves margins and can support better pricing.

Do not waste AI on deterministic support tasks. Duplicate detection is perceptual hashing,
best-shot starts with Laplacian sharpness and can later add local face mesh/eyes-open
signals, collages are layout, basic slideshows are timeline/playback UI, and face *grouping*
can use a local embedding model. All of those can run in the browser for free. Movie/video
export may need a rendering pipeline, but it is not inherently an AI feature.

Photo curation should be a decision-assist flow: group similar shots, score blur/sharpness,
suggest the best one or two, and let the user confirm keep/hide/delete. Do not silently
delete photos.

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

## Captions, story notes, and alt text

Manual captions, story notes, input transcripts, and manual alt text are the owner-control
layer for AI.

- `caption` is owner-entered context. It may be visible in the album or hidden behind the
  scenes for organization and future search.
- Story notes are richer memories/descriptions attached to a whole photo or a specific
  part of the image. Voice capture/transcription is core, with typed editing always
  available.
- Voice/text transcripts can become story notes, captions, search clues, blog sections,
  slideshow scripts, or proposed app actions.
- `alt` is accessibility text for screen readers.
- Human-entered alt text should set `alt_source = 'human'`.

The initial schema has `caption` but not caption visibility. Before implementing the editor,
add a migration for `caption_visibility`, probably `hidden` / `visible`, and add a
`photo_stories` table. Owners should be able to search hidden captions/stories; shared
viewers should only search/display visible text.

Important product loop: adding spoken/typed context and captions/story notes/alt text should
reward the owner with better AI suggestions, stories, search, and organization while making
shared albums more accessible. Design the UI so metadata entry feels useful immediately, not
like compliance homework.

Never publish AI-generated text without a review path. Wrong alt text is worse than none: it
actively misleads the people who depend on it. Before implementing AI, add an AI draft model
so generated stories/captions/alt text cannot accidentally appear as published content.

## Repo memory — docs index

`docs/README.md` is the index of plans, specs, and session logs. Read it first when picking
up work or checking "did we already decide X?". When you add or meaningfully change
anything under `docs/`, update its entry there.

## Session logs

At the end of a working session, write a short searchable log to
`docs/sessions/YYYY-MM-DD-<topic>.md`: what we set out to do, key findings, decisions made
and why, artifacts produced, and the next step. Add a keyword line near the top so it is
greppable. Keep it narrative — link to plans rather than duplicating them.
