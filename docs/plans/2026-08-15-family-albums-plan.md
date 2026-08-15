# Plan: family-albums — AI photo albums with accessible alt text

**Status:** schema applied, no code written yet.
**Keywords:** alt text, accessibility, dedupe, phash, best shot, collage, face recognition,
consent, BYOK, subscription, Supabase, RLS, share links.

## ▶ Resume point

- ✅ **Supabase project ready.** Ref `vsxbedlsnfmsbnlfayae`, region `eu-central-1`,
  repurposed from an abandoned project. Migration `album_studio_initial_schema` is applied:
  `profiles`, `albums`, `photos`, `people`, `face_embeddings`, `album_shares`,
  `library_shares`, `ai_usage` — all with RLS.
- ✅ **Storage bucket `photos`** exists: public read, 5 MB limit, image MIME types only,
  owner-namespaced write policies (`photos/<owner_uuid>/…`).
- ⏳ **No application code yet.** Nothing has been built.
- ⏳ **Frontend stack not chosen** — see the open question below.

**Next action:** pick the stack, scaffold, then build Slice 1.

## Context

This replaces a retired plan to migrate a personal family travel map onto Supabase. That
site is finished and stays on Google Drive. What the owner actually wants is a product:
AI photo albums for many users, each sharing with people they choose.

The predecessor is worth knowing about for two reasons. Its pain — album metadata crammed
into Google Drive folder descriptions, no in-app editor, redeploying a script to change
behavior — is what this product must not reproduce. And its sharing model, plain links that
relatives open without accounts, is what this product should keep.

## The wedge

Lead with **alt text**. Google Photos already does dedupe, face grouping, and collages
well; competing there directly is a losing fight. It produces essentially no usable alt
text, and accessible photo sharing is a real gap.

The other four features are table stakes — they make the app somewhere you'd keep your
photos. They are not the reason anyone switches.

## Cost model (this shapes everything)

Only alt text needs a paid API. Duplicate detection is perceptual hashing, best-shot is
Laplacian sharpness plus a local face mesh, collages are layout, and face *grouping* is a
local embedding model — naming is done by a human.

Consequences:

- The free tier can include four of five features without costing anything per photo.
- Cost exposure is one countable operation, so metering is a small table rather than a
  billing subsystem.
- Heavy local compute belongs in the browser (Web Workers), not on a server.

## Phases

### Phase 1 — Scaffold + auth
Vite app, Supabase client, email/password auth, `profiles` row created on signup. A user
can sign in and see an empty library.

### Phase 2 — Upload (the spine)
Drag photos in. In the browser, per file: resize to ~2000px, generate a thumbnail, compute
pHash, compute sharpness. Upload to Storage at `photos/<owner>/<album>/<uuid>`, then insert
the `photos` row with those precomputed fields.

Do this properly the first time — throttle to ~4 concurrent, show progress, retry failures.
It is the operation users will do with 500 files at once, and it is where a naive
implementation falls over.

### Phase 3 — Alt text (the wedge)
An Edge Function takes a photo id, resolves the caller's key (Vault secret for BYOK, or the
platform key for subscribers), calls the vision model, writes `alt` with
`alt_source = 'ai'`. The UI shows drafts for review; editing flips `alt_source` to
`'human'`.

Never auto-publish AI alt text without a review path. Wrong alt text is worse than none —
it actively misleads the people who depend on it.

Increment `ai_usage` on every call, BYOK included, so users can see their own consumption.

### Phase 4 — Sharing
Visibility switch (private / link / public), share-link generation, token rotation as a
visible "revoke links" action. A viewer page that reads through `get_shared_album(token)`
and requires no account.

### Phase 5 — Duplicates
Group photos by pHash Hamming distance. Show clusters side by side with the sharpest
pre-selected. Bulk delete the rest. No API calls anywhere in this feature.

### Phase 6 — Best shot + collages
Rank a burst by sharpness and eyes-open. Collage layouts from selected photos, rendered to
canvas and saved as a new photo.

### Phase 7 — Faces
Local face detection produces embeddings into `face_embeddings`. Cluster them, ask the
owner to name a cluster, which creates a `people` row.

**Consent gates processing, not just display.** Only `consent = 'granted'` people may be
processed. Withdrawal deletes embeddings and leaves photos intact. Ship the deletion path
in the same release as the feature — not later.

## Open questions

1. **Frontend stack.** Plain Vite + vanilla (like the predecessor) is simplest; React is
   better suited to a photo grid with heavy selection state. Recommend React — this UI has
   real interaction complexity.
2. **Platform key economics.** What does a vision call cost per photo, and what monthly
   quota does a subscription include? Needs a real number before pricing is set.
3. **Free tier limits.** Storage is the constraint, not compute. A per-user byte quota is
   needed before signup opens to anyone.
4. **Does the owner's existing archive get imported?** Not required. The product should be
   proved on fresh uploads first.

## Non-goals for now

Mobile apps, video, collaborative editing, public discovery/search, and anything requiring
a background worker fleet. All of these are plausible later; none are needed to test
whether the wedge lands.
