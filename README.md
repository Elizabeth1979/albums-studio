# Albums Studio

Albums Studio turns photos plus spoken or written context into owner-reviewed albums,
stories, captions, slideshows, and accessible descriptions. AI leads with suggestions and
drafts, while the owner controls what is edited, published, shared, or deleted.

The product works for family albums, weddings, client shoots, school events, portfolios,
projects, and trips. Blog and map views are optional layouts rather than the product center.

## MVP

1. Sign in and create an album.
2. Upload resized photos to private Storage.
3. Choose a masonry or grid layout.
4. Add captions, story notes, and manual alt text.
5. Generate a reviewable AI Story Studio draft from selected photos and owner context.
6. Share an album without requiring the viewer to register.

AI text is never published automatically. Destructive and sharing actions require explicit
confirmation. Duplicate detection, sharpness scoring, collage layout, and similar
deterministic work should run locally rather than consume model tokens.

## Architecture

```text
Browser
  |-- resize, thumbnail, pHash, sharpness -> local processing
  |-- metadata and private Storage paths -> Supabase with RLS
  |-- voice or text context              -> editable transcript
  `-- AI draft request                   -> trusted server/Edge Function -> model

Shared viewer -> token endpoint -> album metadata + short-lived signed image URLs
```

The `photos` bucket is private and the database stores canonical object paths rather than
URLs. An owner signs their own images from the browser: Storage checks its policy against
the caller's token first, so an owner can only ever sign objects under their own prefix.
Shared viewers carry no token, so trusted server code must sign on their behalf.

## Current state

The React and TypeScript application provides email/password authentication and an album
library: albums can be created, opened, renamed, described, switched between masonry and
grid layouts, and deleted behind a confirmation. Photos can be added from a phone's gallery
or dropped in, and are resized, thumbnailed, hashed and scored in the browser before
upload. The library lives at `/` and each album at `/albums/:slug`. The hosted Supabase project is
configured and versioned in `supabase/migrations/`; its minimal schema contains `profiles`,
`albums`, `photos`, and `ai_usage`. Later-phase structures will be added only when
implemented.

Phases 1 to 3 are implemented and automatically verified. Password sign-in, magic links,
and password reset are supported; signup does not require email confirmation. A real
sign-in and password-reset pass has been confirmed against production. A magic-link request
made seconds after a reset email was refused by Supabase's per-address email throttle, so
successful magic-link delivery is still unconfirmed; the app now explains that refusal
rather than repeating it. Phase 4 adds captions, story notes, and manual alt text.

Production: [albums-studio.vercel.app](https://albums-studio.vercel.app)

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Fill `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env.local` with a Supabase publishable key. Secret
Supabase keys and AI provider keys belong only in trusted server environments.

Run the project checks with `npm run typecheck`, `npm test`, `npm run build`, and
`npm run test:e2e`.

`npm test` covers components and the `App` authentication state machine with a mocked
Supabase client. `npm run test:e2e` drives the real client in Chromium with every Supabase
request intercepted in the browser, so neither suite needs credentials or network access.
The end-to-end suite includes an axe-core accessibility pass over every screen at WCAG
2.0/2.1 A and AA.
Both run on every push and pull request via `.github/workflows/ci.yml`.

The database history can be replayed with `npx supabase start` and
`npx supabase db reset`; local Supabase requires Docker.

## Documentation

- [Current state and document index](docs/README.md)
- [Active roadmap](docs/plans/2026-08-15-albums-studio-roadmap.md)
- [Repository guidance](AGENTS.md)
