# Albums Studio project structure

This is the living visual map of the project. Green nodes exist now; blue nodes are planned
by the roadmap. The application frontend and trusted server functions have not been
scaffolded yet.

## Frontend and backend architecture

```mermaid
flowchart LR
    User([Owner or editor]):::external
    Viewer([Shared viewer]):::external
    Model[AI provider]:::external

    subgraph Frontend["Frontend - browser"]
        App["React and TypeScript app"]:::planned
        AuthUI["Authentication and library"]:::planned
        AlbumUI["Album layouts and editors"]:::planned
        Studio["AI Story Studio"]:::planned
        Local["Local image processing<br/>resize, thumbnail, pHash, sharpness"]:::planned
        Upload["Upload queue"]:::planned

        App --> AuthUI
        App --> AlbumUI
        App --> Studio
        AlbumUI --> Local --> Upload
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
|-- src/                         planned frontend application
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

Update this file when a planned component becomes real or an architectural boundary
changes. Keep implementation details in the roadmap or feature-specific documents rather
than expanding this into a second plan.
