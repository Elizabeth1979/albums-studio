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

The `photos` bucket is private. The database stores canonical object paths, and trusted
server code must create short-lived signed URLs for owners and shared viewers.

## Current state

The hosted Supabase project is configured and versioned in `supabase/migrations/`. The
minimal schema contains `profiles`, `albums`, `photos`, and `ai_usage`; later-phase
story, AI-draft, search, sharing, and biometric structures will be added only when implemented.

Application code has not been scaffolded yet. The next checkpoint is authentication plus an
empty library where a signed-in user can create an album shell.

## Local setup

Once the application is scaffolded:

```bash
npm install
cp .env.example .env
npm run dev
```

Use a Supabase publishable key in the browser. Secret Supabase keys and AI provider keys
belong only in trusted server environments.

The database history can be replayed with `npx supabase start` and
`npx supabase db reset`; local Supabase requires Docker.

## Documentation

- [Current state and document index](docs/README.md)
- [Active roadmap](docs/plans/2026-08-15-albums-studio-roadmap.md)
- [Repository guidance](AGENTS.md)
