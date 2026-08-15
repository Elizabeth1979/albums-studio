# Albums Studio

A productized, AI-led Story Studio for people who want images, memories, voice, and text to
be shaped into albums, stories, blogs, slideshows, and shareable memories without forcing
viewers to create accounts.

You should not have to live in a dashboard or decide every next step yourself. AI should lead
the experience: suggest what story to create, which photos need context, who might know a
missing memory, what captions/alt text/search clues to add, and what layout or slideshow
could work. Users can speak or type; voice is an input method, not the brand. Captions can be
shown visually or kept behind the scenes as private/searchable context. Story notes preserve
memories, details, or explanations attached to a whole image or a specific part of it. Smart
curation helps find duplicates, blurry shots, and the best one or two photos from a burst.

---

## Why this exists

Most people do not just need storage. They need to turn a pile of photos into something
worth sharing.

Family travel maps are one use case, but not the product. A user might be sharing a
wedding, a client shoot, a school event, a private family album, a portfolio, or a trip.
The common need is the same: make an album, choose a layout, remove the bad duplicates,
add useful context, and share it cleanly.

Accessible alt text still matters. The product should support manual alt text in the same
spirit as Slack or Twitter, plus AI drafts that the owner can review before publishing.

The product should make that effort feel worth it immediately. Captions, story notes, and
alt text should improve the owner's own search experience, not just help some abstract
future viewer. The same text that makes an album accessible can also help the owner find
"the photo where everyone is around the cake" months later.

## Core features

| Feature | How it works | Cost |
| --- | --- | --- |
| **Albums** | Create, edit, upload, choose covers, reorder photos | normal app/storage cost |
| **Layouts** | Masonry, grid, story/slideshow, optional blog or map views when useful | free |
| **Sharing** | Private, secret link, or public album pages | free |
| **AI Story Studio** | Proactively suggests stories, captions, missing context, layouts, search clues, and next actions | paid API / BYOK; limited trial |
| **Captions + manual alt text** | Owner-entered text per photo; captions may be visible or private | free |
| **Story notes** | Rich memories/descriptions attached to photos or image regions | voice/transcript first |
| **Voice/text input** | Speak or type memories, commands, corrections, and story context | accessibility-first input layer |
| **Photo curation** | pHash near-duplicates, blur/sharpness scoring, comparison UI | free local compute |
| **Collages** | High-quality, editable collage layouts from selected photos | free |
| **Slideshows + movie export** | Timed slideshow with optional music; later export as a shareable video/movie | free preview, rendering cost later |
| **Search** | Text search plus AI-assisted retrieval over album titles, captions, stories, and image context | free baseline, AI-enhanced |
| **AI alt drafts** | Vision model drafts alt text for owner review | paid API / BYOK |
| **Face grouping** | Local embedding model; naming is done by a human | free local compute, later |

The core product is AI-led: the best use of the product is giving it photos plus human
memory, then letting it reduce the thinking burden by suggesting stories, gaps, captions,
layouts, search clues, and next actions. Some important supporting features still should not
spend AI tokens when simple tools are enough: duplicate grouping, blur/sharpness scoring,
collage layout, and basic slideshow playback can be local.

## Monetization

AI is the product differentiator, so most AI-led features belong behind a paywall or quota.
The app still needs a useful free/manual baseline so users can organize albums, review
drafts, and understand the value before paying.

- **Free/local value** - layouts, upload, sharing, captions, manual alt text, story notes,
  duplicate grouping, sharpness scoring, text search, collages, and basic slideshows.
- **Free/open AI value** - prefer local/browser/Python/open-source models when they are good
  enough, especially for transcription, image-quality signals, duplicate grouping, and
  embeddings.
- **Free AI trial value** - a small limited allowance for trying AI alt drafts, AI search, or
  one story draft. This can be day/week/month based, usage-count based, or both.
- **Paid AI value** - story drafting, caption/title suggestions, AI alt drafts,
  proactive suggestions, semantic/LLM search, transcription, and multimodal assistance over
  photos plus owner-written or spoken context.
- **Render/export value** - high-quality movie exports, long slideshows, and hosted media
  processing if browser-only export is not enough.
- **Storage value** - quotas and paid plans once open signup exists.

If users bring their own AI key later, the key is stored as a Supabase Vault secret and
decrypted only inside an Edge Function. **A user's API key must never reach the browser
after they enter it**.

## Sharing model

Viewers should never be forced to register. That is how people actually share photos with
family, clients, guests, and friends.

- `private` — owner only
- `link` — anyone holding the secret URL. `albums.share_token` is the secret half;
  rotating it revokes every link handed out so far.
- `public` — indexable

Named grants exist for viewers who *do* have accounts: `album_shares` for one album,
`library_shares` for "everything I own, including albums I make later".

Link-shared albums are deliberately **not** readable through RLS. They are reached through
`get_shared_album(token)`, a `SECURITY DEFINER` function, so the secret never has to be
expressible in a policy.

## Layout model

Blog and map views are optional presentation layouts, not the product center.

- **Masonry** - default, good for most albums.
- **Grid** - predictable and scannable for large batches.
- **Story** - sections with captions and dates, useful for weddings, trips, events, and
  portfolios.
- **Blog** - post-like sections that combine photos, story notes, descriptions, and optional
  date/location context for any subject: trips, technical projects, events, portfolios, or
  family memories.
- **Slideshow** - full-screen viewing; later timed playback with optional music and movie
  export.
- **Map** - only when album or photo locations matter.

The data model should keep date/location fields optional. Not every album is a trip.

## Text and story model

A photo can have four different kinds of owner/AI context:

- `caption` - owner-entered context about the photo. It can be **visible** in the shared
  album or **hidden** behind the scenes for organization and future search.
- `alt` - accessibility text for screen readers. The owner can add, edit, or clear it
  manually without using AI.
- `story notes` - longer memories, descriptions, or explanations. A story can describe the
  whole photo or a specific part of the image, such as "this is the old house we stayed in"
  or "this corner shows the cake my aunt made."
- `voice/text transcripts` - spoken or typed memories/commands captured by the studio. A
  transcript can become a story note, caption draft, search clue, blog section, slideshow
  script, or app action.

This distinction matters because hidden captions and story notes are still valuable. They
give the owner a place to write "Aunt Dana holding the cake before the candles" without
necessarily putting that sentence on the public album page. AI search and LLM-assisted
story creation can use captions and stories to answer requests like "find the photo where
everyone is around the cake" or "turn this wedding album into a warm story for the family."

Story notes make albums feel like memory objects, not just grids of images. Users should be
able to speak or type a memory, keep an editable transcript, optionally store the audio, and
turn the memory into searchable owner context. Voice matters, but text must be equally
supported for accessibility, privacy, noisy rooms, and user preference.

This creates the right incentive loop: adding useful text improves the album for the owner
through search and organization, while also making shared photos more accessible when alt
text is supplied.

AI should draft, suggest, structure, and retrieve, but not silently publish. AI output must be
reviewable and editable before it is treated as confirmed, especially for alt text. Wrong alt
text is worse than none because it can mislead the people who depend on it.

## Faces and consent

Faceprints are biometric data: **GDPR Article 9 special-category** in the EU (this project
runs in `eu-central-1`), and the subject of nine-figure settlements under Illinois BIPA.

This is not a reason to skip the feature — Google and Apple both ship it — but it is a
reason to build it correctly from the first commit:

- `people.consent` is an explicit state (`pending` / `granted` / `declined` / `withdrawn`),
  not a nullable boolean. "Never asked" and "said no" are different facts.
- Embeddings live in their own table, so withdrawing consent deletes the biometrics
  without touching the photos.
- Faces and people are owner-only under RLS. Nothing biometric is readable by a viewer,
  however widely an album is shared.

Retrofitting this after launch is a rewrite. Doing it now costs almost nothing.

## Architecture

```
Browser
  ├── resize + thumbnail + pHash + sharpness ──► local, no API cost
  ├── optional open/local AI helpers ───────────► browser/Python/Hugging Face candidates
  ├── upload ─────────────────────────────────► Supabase Storage (bucket: photos)
  ├── read/write metadata + captions/stories ─► Supabase Postgres (RLS)
  ├── speak/type + confirm actions ────────────► Studio input + transcript/action review
  ├── choose layout + share link ─────────────► public/link/private album views
  ├── search titles + captions + stories ─────► Postgres text search baseline
  └── request AI story/search/alt drafts ─────► Edge Function ──► multimodal model
                                                  └── resolves BYOK or platform key
```

Photos are resized in the browser before upload (~2000px long edge). That single choice is
the difference between a 500-photo library costing ~2 GB and ~250 MB.

## Supabase

Project name `albums-studio`, ref `vsxbedlsnfmsbnlfayae`, region `eu-central-1`. Schema
lives in `supabase/migrations/` and is the source of truth — never edit the hosted
database by hand without committing the migration, or the repo and the database drift
apart.

Tables: `profiles`, `albums`, `photos`, `people`, `face_embeddings`, `album_shares`,
`library_shares`, `ai_usage`.

> **Operational note learned the hard way:** never apply a migration while a project is
> `COMING_UP`. It will report success, and a finishing restore will then silently overwrite
> your schema. Check `get_project` status first, and verify after with `list_migrations` —
> not just `list_tables`.

## Getting started

Application code has not been scaffolded yet. Once it exists, the expected local flow is:

```bash
npm install
cp .env.example .env      # fill in the Supabase URL + publishable key
npm run dev
```

## Status

Nothing is built yet. The schema is applied, and the active roadmap is
[`docs/plans/2026-08-15-albums-studio-roadmap.md`](docs/plans/2026-08-15-albums-studio-roadmap.md).
First slice: scaffold + auth, then create albums, upload photos, choose layouts, add
captions/story notes/manual alt text, and generate the first reviewable AI Story Studio
draft.
