# Roadmap: Albums Studio — AI-led stories, albums, layouts, curation, and accessible text

**Status:** schema applied, no app code written yet. Roadmap revised on 2026-08-15:
AI Story Studio is core; voice and text are input methods; manual captions/story notes/alt
text are the review and control layer.
**Keywords:** AI-led, AI Story Studio, proactive AI, freemium, paywall, trial quota, voice,
text input, speech, transcript, commands, multimodal AI, LLM stories, albums, layouts,
gallery, captions, hidden captions, story notes, audio notes, image regions, manual alt
text, accessibility, semantic search, LLM search, curation, dedupe, phash, best shot,
collage, slideshow, music, movie export, video export, face recognition, consent, BYOK,
subscription, Supabase, RLS, share links, Family Travels.

## ▶ Resume point

- ✅ **Supabase project ready.** Project name `albums-studio`, ref `vsxbedlsnfmsbnlfayae`,
  region `eu-central-1`, repurposed from an abandoned project. Migration
  `album_studio_initial_schema` is applied: `profiles`, `albums`, `photos`, `people`,
  `face_embeddings`, `album_shares`, `library_shares`, `ai_usage` — all with RLS.
- ✅ **Storage bucket `photos`** exists: public read, 5 MB limit, image MIME types only,
  owner-namespaced write policies (`photos/<owner_uuid>/…`).
- ⏳ **No application code yet.** Nothing has been built.
- ✅ **Product direction clarified.** Albums Studio is not just a travel map and not just a
  gallery. It is AI-led: the product should suggest what to do next, what story to create,
  which photos need context, who might know missing details, and which captions/search clues
  to add. Images plus spoken/written context become stories, captions, blog sections,
  searchable context, slideshow scripts, and accessible descriptions. Manual captions/story
  notes/alt text remain the owner-control and review layer.
- ⏳ **Frontend stack not chosen** — React is still recommended for selection-heavy photo
  workflows.

**Next action:** scaffold the app, wire Supabase auth, and build the first checkpoint:
signed-in user sees an empty library and can create an album shell. The first AI checkpoint
comes after upload/text foundation: capture typed or spoken context and generate a
reviewable AI Story Studio draft with proactive suggestions.

**Known schema gaps:** the applied Supabase migration is the initial v0 schema. Add
migrations before shipping later phases for `albums.layout`, `photos.caption_visibility`,
`photo_stories`, `ai_drafts`, `studio_interactions`, and `ai_suggestions`.

## Context

This replaces a retired plan to migrate a personal family travel map onto Supabase. That
site is finished and stays on Google Drive for now. Albums Studio is the productized
version: many users, many album types, layout choices, owner editing, and no-account
viewer links.

The predecessor is worth knowing about for two reasons. Its pain — album metadata crammed
into Google Drive folder descriptions, no in-app editor, redeploying a script to change
behavior — is what this product must not reproduce. And its sharing model, plain links that
relatives open without accounts, is what this product should keep.

Family Travels is a reference product and likely first real dataset, not code to clone.
Albums Studio may eventually replace it for the owner only after it reaches feature parity
for the workflows she relies on.

## Product shape

The product is not "a map" and not only a blog. Blog and map views are optional layouts. A
user may be sharing a wedding, a professional shoot, a family event, a school album, a
portfolio, a technical project, or a trip. The product center is:

1. Upload photos.
2. Add memories with voice or text, without forcing one input style.
3. Let AI lead: suggest missing context, who to ask, captions, titles, stories, blog
   sections, slideshow scripts, layouts, and search clues from images plus spoken/written
   text.
4. Review/edit the AI output and choose the right presentation layout.
5. Curate, share, or export without forcing viewers to register.

Captions, stories, and alt text are separate:

- **Caption** - owner-entered context. It can be shown visually in the album or kept hidden
  behind the scenes for organization and future search.
- **Story note** - a longer memory, explanation, or description attached to a whole photo
  or a specific image region. It can come from typed text or voice capture/transcription.
- **Alt text** - accessibility text for screen readers. The app should support manual alt
  text and AI drafts. Think Slack/Twitter-style editing, but with reviewable AI suggestions.
- **Input transcript** - spoken or typed memory/command. It can become a story note, caption
  draft, search clue, blog section, slideshow script, or pending app action.

Hidden captions and story notes are still product value. They let the owner describe what
is in the photo without putting that text on the public album page. AI story generation,
semantic search, and LLM-assisted retrieval can use captions and stories to find specific
photos and create richer narratives.

Story notes are how Albums Studio preserves memory, not just image metadata: what happened,
why it mattered, who made the cake, what was funny, what is visible in one corner of the
photo. Voice is a powerful capture mode, but text must be equally supported for
accessibility, privacy, noisy spaces, and user preference. The important thing is that memory
becomes searchable owner context.

This should be framed as a product flywheel: adding text should reward the owner with
better search and organization, while also making shared albums more accessible when alt
text is supplied.

## AI-first cost model (this shapes everything)

Albums Studio is AI-led because the best product experience is proactive and multimodal:
photos plus spoken/written human context become stories, searchable memory, captions, blog
sections, and presentation scripts. That makes AI a core product cost, not a decorative
add-on.

Some important supporting features still should not need paid AI. Duplicate detection is
perceptual hashing, best-shot is sharpness scoring plus later local face/eyes-open signals,
collages are layout, basic slideshows are timeline/playback UI, and face grouping can use a
local embedding model with human naming. Movie export may need a rendering pipeline, but it
does not need AI.

Before paying for AI, evaluate free/open options: browser-side libraries, Python libraries,
open-source models, and Hugging Face models. This especially applies to transcription,
image-quality scoring, duplicate/near-duplicate detection, embeddings, face/eyes-open
signals, and other features where an open model or classical algorithm may be good enough.

Consequences:

- The MVP should prove the AI-led story/search loop early, not postpone it indefinitely.
- Free/local features should avoid wasting model calls where deterministic tools are enough.
- Free/open AI options should be considered before paid APIs. If open models are good enough,
  they improve margins and can support better pricing.
- Cost exposure must be visible through quotas, BYOK/platform-key rules, and `ai_usage`.
- Freemium should include strong non-AI value plus a small AI trial, but not unlimited
  platform-paid AI.
- Heavy local compute belongs in the browser (Web Workers), not on a server.

Freemium shape:

- Free forever: upload within quota, layouts, sharing, manual captions/story notes/manual alt
  text, local duplicate/blur scoring, basic text search, collages, basic slideshows, and any
  open/local AI features that are cheap enough to operate.
- Free AI taste: limited trial credits for a small number of AI alt drafts, AI searches, or
  one/few AI Story Studio drafts. The trial may be time-boxed (day/week/month), usage-boxed,
  or both.
- Paid: ongoing AI Story Studio, proactive suggestions, larger AI search quotas,
  transcription, model-generated summaries, and high-volume AI alt/caption/story generation.
- Guardrail: never allow unlimited platform-paid AI on the free tier. BYOK can unlock more
  usage without platform cost, but still track it in `ai_usage`.

## Phase gates

Each phase ends with a human-checkable checkpoint. Do not move to the next phase just
because code compiles; the product loop should be visible and testable.

### Phase 1 — Scaffold + auth
Vite app, Supabase client, email/password auth, `profiles` row created on signup. A user
can sign in and see an empty library.

**Checkpoint:** local dev server runs; user can sign up/sign in/out; an authenticated empty
library screen renders; profile row exists.

### Phase 2 — Albums + layouts
Create/edit/delete album shells. Add a layout field to the schema before this phase ships.
Start with two layouts:

- **Masonry** - default for most albums.
- **Grid** - predictable and scannable for large batches.

Later layouts:

- **Story** - sections by date/caption.
- **Slideshow** - full-screen viewing.
- **Map** - optional, only when date/location metadata matters.
- **Blog** - post-like sections that combine photos, story notes, descriptions, and optional
  date/location context for any subject: trips, technical projects, events, portfolios, or
  family memories.

Date and location stay optional. Not every album is a trip.

**Checkpoint:** user can create an album, choose masonry or grid, rename it, and see the
empty album page in that layout.

### Phase 3 — Upload (the spine)
Drag photos in. In the browser, per file: resize to ~2000px, generate a thumbnail, compute
pHash, compute sharpness. Upload to Storage at `photos/<owner>/<album>/<uuid>`, then insert
the `photos` row with those precomputed fields.

Do this properly the first time — throttle to ~4 concurrent, show progress, retry failures.
It is the operation users will do with 500 files at once, and it is where a naive
implementation falls over.

**Checkpoint:** user can upload a small batch, refresh, and still see photos, thumbnails,
sort order, pHash, and sharpness metadata.

### Phase 4 — Text foundation: captions, story notes + manual alt text
Add photo editing UI for:

- `caption` - owner-entered context.
- `caption_visibility` - whether the caption is visible in shared views or hidden/search-only.
- Story notes - longer memories/descriptions for a photo or part of a photo.
- `alt` - accessibility text used by screen readers.

The initial schema has `caption` but does not yet have caption visibility or story notes.
Add a migration before this phase ships. Recommended shape:

- `caption_visibility text not null default 'hidden' check (caption_visibility in ('hidden', 'visible'))`
- `photo_stories` table with `id`, `photo_id`, `owner_id`, `body`, `visibility`, optional
  `region`, optional `audio_path`, optional `transcript`, and timestamps.

Manual captions, story notes, and manual alt text are core control features even in an
AI-first app. Editing or entering alt text sets `alt_source = 'human'`. Empty
caption/story/alt text is allowed when the owner has not supplied it yet.

The UI should make the benefit clear through behavior: after a user writes useful captions,
story notes, or alt text, search should become noticeably better. Do not make metadata
entry feel like charity or compliance work; make it a practical album-management tool.

**Checkpoint:** user can add/edit/remove a caption, story note, and alt text manually;
choose whether captions/stories are visible or hidden; shared album views render visible
captions/stories and image alt text, but do not show hidden text.

### Phase 5 — AI Story Studio
The first AI feature should prove the core product loop: the studio looks at selected photos
plus owner context, then proactively suggests useful next steps and drafts that the owner can
edit. This should feel less like filling out a dashboard and more like being guided by a
creative studio that knows the album.

Initial AI actions:

- Draft an album story from selected photos and owner notes.
- Capture voice or text input and save an editable transcript.
- Suggest section titles, album descriptions, and blog-style paragraphs.
- Suggest captions for photos that have no caption yet.
- Suggest which photos need more context and who the owner might ask for missing memories.
- Produce a slideshow/storyboard script from selected photos.
- Interpret safe app commands, such as "add this as a story note", "rename the album",
  "make a blog draft", "hide this caption", or "find photos from the birthday cake".
- Save AI output as drafts, not published text.
- Require explicit confirmation before destructive or sharing actions.

Recommended schema before this ships:

- `ai_drafts` table with `id`, `owner_id`, `album_id`, optional `photo_id`, `draft_type`,
  `prompt`, `input_refs`, `body`, `status`, `model`, `created_at`, `updated_at`.
- `draft_type` examples: `album_story`, `blog_section`, `caption`, `alt`, `slideshow_script`,
  `search_summary`.
- `status` examples: `draft`, `accepted`, `rejected`, `superseded`.
- `studio_interactions` table with `id`, `owner_id`, optional `album_id`, optional
  `photo_id`, `input_mode`, optional `audio_path`, `transcript`, `intent`,
  `proposed_action`, `status`, `model`, `created_at`.
- `input_mode` examples: `text`, `voice`.
- `studio_interactions.status` examples: `captured`, `drafted`, `action_pending`,
  `action_confirmed`, `dismissed`.
- `ai_suggestions` table with `id`, `owner_id`, optional `album_id`, optional `photo_id`,
  `suggestion_type`, `body`, `reason`, `status`, `created_at`, `expires_at`.
- `suggestion_type` examples: `missing_context`, `ask_person`, `caption`, `story`,
  `layout`, `search_query`, `slideshow`.

AI can read visible and hidden owner text for the owner experience, but shared viewers should
only see accepted/published output. Every AI action increments `ai_usage`, BYOK included.
Stored audio should be optional; transcripts must be editable and deletable. Suggestions must
never contact another person automatically; they can only recommend that the owner ask
someone.

**Checkpoint:** owner selects photos, speaks or types a memory/instruction, sees a
transcript, receives proactive suggestions, generates a story/blog draft, edits it, accepts
it, and sees the accepted story in an album layout while the raw draft remains traceable.

### Phase 6 — Sharing
Visibility switch (`private` / `link` / `public`), share-link generation, token rotation as
a visible "revoke links" action. A viewer page reads through `get_shared_album(token)` and
requires no account.

**Checkpoint:** owner can share an album link in a private browser session; link rotation
revokes the old album page.

### Phase 7 — Photo curation
Group photos by pHash Hamming distance and burst-like timing/order. Show clusters side by
side with useful signals:

- Near-duplicate score.
- Sharpness / blur score.
- Later: faces visible / eyes open.
- App suggestion for best one or two photos.

Implementation should start with Python/browser-friendly free options before any paid model:
pHash/dHash, Laplacian sharpness, EXIF/timestamp burst grouping, face/eyes-open signals from
open models if quality and privacy are acceptable, and only then paid AI if needed.

This is a decision-assist UI, not automatic deletion. The user must confirm which photos to
keep, hide, or delete.

**Checkpoint:** given a set of similar photos, the app groups them and lets the user compare
and keep the best one or two.

### Phase 8 — Collages
High-quality, editable collage layouts from selected photos, rendered to canvas and saved as
a new photo. No AI required. This should compete with Google Photos-style collage creation,
but feel more controllable: choose photos, swap/crop/reorder, pick a layout, and keep the
result as an album item.

**Checkpoint:** user selects photos, creates a collage, and sees it as a photo in the album.

### Phase 9 — Slideshows, music + movie export
Start with a timed slideshow player over selected photos or an album. Music is optional and
should not block the first version. Later, users can export the slideshow as a shareable
movie/video.

Treat this as creative output, not AI. The hard parts are timing, transitions, music rights,
audio upload/storage, and rendering/export quality. Browser-only preview can come first;
server-side rendering or a dedicated video pipeline can be evaluated later if exports need
to be reliable across devices.

**Checkpoint:** user chooses photos, previews a timed slideshow, optionally adds music, and
can export or save the slideshow/movie once the rendering path is chosen.

### Phase 10 — AI-assisted search
Start with ordinary text search over album titles, album descriptions, visible captions,
story notes, and hidden captions/stories the owner has written. Then add AI-assisted search
over owner-approved text, hidden owner context, and model-generated summaries. Shared viewers
should only search public/visible text. Owners can search their hidden captions, story notes,
and private AI summaries too.

LLM-assisted search can use captions and story notes as retrieval context: "find the photo
where everyone is around the cake" should work better because the owner already added
caption/story context text.

**Checkpoint:** owner can search their library by caption/story context and find matching
photos; shared viewers only search text that is meant to be visible.

### Phase 11 — AI alt drafts
An Edge Function takes a photo id, resolves the caller's key (Vault secret for BYOK, or the
platform key for subscribers), calls the vision model, and writes an AI draft.

Use the general `ai_drafts` table from Phase 5 with `draft_type = 'alt'`. Keep `alt` as the
published field and only copy draft text into `alt` after owner approval. The safer product
behavior is draft-first: AI text should be visible to the owner for review, not silently
treated as final.

Never auto-publish AI alt text without a review path. Wrong alt text is worse than none
because it actively misleads the people who depend on it.

Increment `ai_usage` on every call, BYOK included, so users can see their own consumption.

**Checkpoint:** owner can generate an AI alt draft, edit it, approve it, and the approved
text appears in shared views.

### Phase 12 — Faces
Local face detection produces embeddings into `face_embeddings`. Cluster them, ask the
owner to name a cluster, which creates a `people` row.

**Consent gates processing, not just display.** Only `consent = 'granted'` people may be
processed. Withdrawal deletes embeddings and leaves photos intact. Ship the deletion path
in the same release as the feature — not later.

## Open questions

1. **Frontend stack.** React is recommended because album layouts, upload queues, selection,
   comparison views, and editors have real interaction state.
2. **Public storage vs signed image access.** The current bucket is public. If rotating a
   share link must revoke copied image URLs too, use a private bucket plus signed URLs or
   an image proxy before launch.
3. **Layout schema.** Add an album layout field before Phase 2 ships. Initial values:
   `masonry`, `grid`; later `story`, `slideshow`, `map`, `blog`.
4. **Caption/story visibility schema.** Add `caption_visibility` before Phase 4 so captions
   can be visible or hidden/search-only. Add `photo_stories` with its own visibility field.
5. **Story region model.** Decide whether story notes can attach to normalized image
   regions (`x`, `y`, `width`, `height`) in Phase 4, or whether region annotations wait
   until after basic story notes.
6. **Studio interaction behavior.** Decide what actions AI Story Studio can take directly,
   which actions require confirmation, whether raw audio is stored by default, and how
   transcripts can be edited/deleted. Voice and text must both work.
7. **AI draft/suggestion schema.** Add `ai_drafts`, `studio_interactions`, and
   `ai_suggestions` before AI Story Studio so AI stories/captions/alt text/actions cannot
   accidentally publish or execute before review.
8. **Search scope.** Owners can search hidden captions/stories; shared viewers should only
   search text intended for them. Decide exact behavior before shared search exists.
9. **Open/free AI evaluation.** Before choosing paid APIs, research browser/Python/open-source
   and Hugging Face options for transcription, embeddings, image quality, near-duplicate
   detection, face/eyes-open signals, and local semantic search. Record quality, runtime,
   privacy, hosting cost, and licensing.
10. **Platform key economics.** What does a vision call cost per photo, and what monthly
   quota does a subscription include? Needs a real number before pricing is set.
11. **Freemium/trial design.** Decide whether free AI trials are day/week/month based,
   usage-credit based, or both. The free tier should demonstrate AI alt/search/story value
   without creating open-ended platform AI cost.
12. **Free tier limits.** Storage is the constraint, not compute. A per-user byte quota is
   needed before signup opens to anyone.
13. **Slideshow/movie export pipeline.** Decide whether exports are browser-rendered,
   server-rendered, or powered by a dedicated video pipeline. Music requires clear rules for
   upload, storage, rights, and whether shared viewers can download the final movie.
14. **Family Travels import.** Not MVP, but likely useful later so the owner can eventually
   replace the personal site with Albums Studio.

## Non-goals for now

Mobile apps, collaborative editing, public discovery/search, and anything requiring a
background worker fleet. Raw video upload support is optional and should be decided before
upload work: Family Travels supports video, but Albums Studio can prove the product on
photos first. Slideshow/movie export is a separate creative-output feature and can ship
later without requiring general video-library support.
