# Albums Studio project structure

This is the living visual map of the project. Green nodes exist now; blue nodes are planned
by the roadmap. Authentication and album shells exist; photo upload, AI, and trusted server
functions remain planned.

## Frontend and backend architecture

```mermaid
flowchart LR
    User([Owner or editor]):::external
    Viewer([Shared viewer]):::external
    Model[AI provider]:::external

    subgraph Frontend["Frontend - browser"]
        App["React and TypeScript app"]:::current
        AuthUI["Email auth, reset, protected library"]:::current
        Router["Client routing<br/>/ and /albums/:slug"]:::current
        AlbumUI["Album shells<br/>create, rename, layout, describe, delete"]:::current
        PhotoUI["Photo grid and editors"]:::planned
        Studio["AI Story Studio"]:::planned
        Local["Local image processing<br/>resize, thumbnail, pHash, sharpness"]:::planned
        Upload["Upload queue"]:::planned

        App --> AuthUI
        App --> Router --> AlbumUI
        AlbumUI --> PhotoUI
        App --> Studio
        PhotoUI --> Local --> Upload
    end

    subgraph Supabase["Supabase backend"]
        Auth["Auth<br/>email and password"]:::current
        DataAPI["Data API<br/>RLS and column grants"]:::current
        RPC["Sharing RPC<br/>get_shared_album"]:::current
        Storage["Private photos bucket"]:::current
        Vault["Vault extension"]:::current

        subgraph Database["Postgres 17"]
            Profiles[(profiles)]:::current
            Albums[(albums)]:::current
            Photos[(photos)]:::current
            Usage[(ai_usage)]:::current
            Tokens[(private album_share_tokens)]:::current
            TextSchema["Stories and visibility"]:::planned
            AISchema["Drafts, interactions, suggestions"]:::planned
            SearchSchema["Full-text and semantic search"]:::planned
            OutputSchema["Collages, slideshows, exports"]:::planned
            FaceSchema["Consent and face embeddings"]:::planned
        end

        Edge["Trusted Edge Functions<br/>signed URLs, sharing, AI, quotas"]:::planned

        Auth --> Profiles
        DataAPI --> Albums & Photos & Profiles & Usage
        Albums --> Tokens
        RPC --> Albums & Photos & Tokens
        Edge --> Database
        Edge --> Storage
        Edge --> Vault
    end

    User --> App
    AuthUI --> Auth
    AlbumUI --> DataAPI
    Upload --> Storage
    Studio --> Edge
    Edge --> Model
    Viewer --> RPC
    RPC -. "private object paths" .-> Edge
    Edge -. "short-lived signed URLs" .-> Viewer

    classDef current fill:#dcfce7,stroke:#15803d,color:#14532d
    classDef planned fill:#dbeafe,stroke:#2563eb,color:#1e3a8a,stroke-dasharray:5 5
    classDef external fill:#f3f4f6,stroke:#6b7280,color:#1f2937
```

## Current data model

This diagram reflects the live schema. `PK` means primary key, `FK` means foreign key, and
`UK` means unique. Required fields are labeled `NOT NULL`.

```mermaid
erDiagram
    AUTH_USERS ||--|| PROFILES : creates
    AUTH_USERS ||--o{ ALBUMS : owns
    AUTH_USERS ||--o{ PHOTOS : owns
    AUTH_USERS ||--o{ AI_USAGE : consumes
    ALBUMS ||--o{ PHOTOS : contains
    ALBUMS ||--|| ALBUM_SHARE_TOKENS : has
    ALBUMS o|--o| PHOTOS : "uses as cover"

    AUTH_USERS {
        uuid id PK "managed by Supabase Auth"
    }

    PROFILES {
        uuid id PK, FK
        text display_name
        timestamptz created_at "NOT NULL"
    }

    ALBUMS {
        uuid id PK
        uuid owner_id FK "NOT NULL"
        text title "NOT NULL"
        text slug "NOT NULL; unique with owner_id"
        date date
        text description
        text layout "NOT NULL; masonry or grid"
        float8 lat
        float8 lng
        album_visibility visibility "NOT NULL; private, link, or public"
        uuid cover_photo_id FK
        timestamptz created_at "NOT NULL"
        timestamptz updated_at "NOT NULL"
    }

    PHOTOS {
        uuid id PK
        uuid album_id FK "NOT NULL"
        uuid owner_id FK "NOT NULL"
        text storage_path UK "NOT NULL"
        text thumbnail_path
        text mime
        int4 width
        int4 height
        text caption
        text alt
        text alt_source "ai or human"
        bit phash "64-bit perceptual hash"
        float4 sharpness
        float4 quality_score "zero to one"
        int4 sort_order "NOT NULL"
        timestamptz created_at "NOT NULL"
        timestamptz updated_at "NOT NULL"
    }

    AI_USAGE {
        uuid owner_id PK, FK
        date period PK
        text operation PK
        int4 count "NOT NULL"
        boolean byok PK
    }

    ALBUM_SHARE_TOKENS {
        uuid album_id PK, FK
        uuid token UK "NOT NULL"
        timestamptz created_at "NOT NULL"
    }
```

The human-facing text fields have separate purposes:

- `albums.title` is editable; `albums.slug` is not. The slug is the stable half of a future
  share URL and of the current `/albums/:slug` address, so a rename must not move it.
- `albums.layout` selects the presentation. Its check constraint lists only the layouts the
  application can draw today, and each later phase widens it when it ships the renderer.
- `albums.description` describes the album as a whole.
- `photos.caption` provides visible context for one photo. Caption visibility is planned but
  is not yet stored separately.
- `photos.alt` is owner-approved accessibility text for screen readers.
- `photos.alt_source` records whether the current alt text originated from AI or a human.

`album_share_tokens` belongs to the private schema and is never exposed as ordinary album
data. Supabase manages `auth.users`; the application owns the other tables shown here.

## Album lifecycle

This state machine describes the intended product workflow. It is not a database status
enum; only visibility and durable content states should be persisted when their phases are
implemented.

```mermaid
stateDiagram-v2
    [*] --> SignedOut
    SignedOut --> Library: sign in
    Library --> AlbumDraft: create album
    AlbumDraft --> Uploading: add photos
    Uploading --> Editing: upload completes
    Uploading --> Uploading: retry failed files

    Editing --> StudioDraft: request AI assistance
    StudioDraft --> Editing: revise or reject
    StudioDraft --> Editing: accept into editable content

    Editing --> Private: save privately
    Private --> LinkShared: create share link
    Private --> Public: publish publicly
    LinkShared --> Private: rotate or revoke link
    Public --> Private: unpublish

    Editing --> DeletionPending: request deletion
    Private --> DeletionPending: request deletion
    LinkShared --> DeletionPending: request deletion
    Public --> DeletionPending: request deletion
    DeletionPending --> Editing: cancel
    DeletionPending --> [*]: confirm deletion

    Library --> SignedOut: sign out
```

## Repository layout

```text
albums-studio/
|-- src/
|   |-- components/              current screens and shared UI
|   |-- lib/                     current data access and helpers
|   `-- *.test.tsx               current component and state-machine tests
|-- e2e/                         current Playwright suites, including axe checks
|-- .github/workflows/ci.yml     current typecheck, tests, build, end-to-end
|-- supabase/
|   |-- config.toml              current local Supabase configuration
|   |-- migrations/              current schema history and source of truth
|   `-- functions/               planned trusted Edge Functions
|-- docs/
|   |-- project-structure.md     this visual architecture map
|   |-- plans/                   phased roadmap
|   `-- sessions/                durable decision history
|-- AGENTS.md                    repository guidance
`-- README.md                    project overview
```

## Routing

Addresses are history-API routes, not hash routes: Supabase delivers recovery and
magic-link tokens in the URL hash, which a hash router would consume before the client
reads them. `vercel.json` rewrites every path to `index.html` so a deep link survives a
reload in production.

| Path | Screen |
| --- | --- |
| `/` | Library: album list and creation |
| `/albums/:slug` | One album: rename, description, layout, delete |
| anything else | Redirected to `/` |

Update this file when a planned component becomes real or an architectural boundary
changes. Keep implementation details in the roadmap or feature-specific documents rather
than expanding this into a second plan.
