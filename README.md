# family-albums

AI-assisted photo albums, built around the one thing the big photo apps do badly:
**accessible alt text**.

You upload photos. The app writes real alt text for them, finds your duplicates, picks the
best shot out of a burst, builds collages, and learns who's who. You share an album with
whoever you choose — by link, without forcing your relatives to create accounts.

---

## Why this exists

Google Photos already does duplicate detection, face grouping, and collages, and does them
well. Competing there is a losing fight.

What it does *not* do is produce usable alt text. Photo sharing on the web is, for
screen-reader users, largely a wall of "image". That gap is real, underserved, and it is
what this product leads with. The rest are table stakes that make the app worth living in.

## The five features, and what they actually cost

A useful thing to know before designing pricing: **only one of these needs a paid API.**

| Feature | How it works | Cost |
| --- | --- | --- |
| **Alt text** | Vision LLM | 💰 the only real cost |
| **Duplicate removal** | Perceptual hash (pHash), Hamming distance | free — local compute |
| **Best shot of a burst** | Laplacian sharpness + local face mesh for eyes-open | free — local compute |
| **Collages** | Layout algorithm | free — no AI at all |
| **Face grouping** | Local embedding model; naming is done by a human | free — local compute |

Four of the five are classical image processing that has been solved for decades. They
*feel* like AI features, but running them costs nothing per photo. That makes a genuinely
useful free tier possible and narrows cost exposure to a single countable operation.

## Monetization

Two paths, one code path:

- **Bring your own key** — the user supplies a provider key. Metered for display, not
  billing.
- **Subscription** — an included monthly quota of vision calls.

The key is stored as a Supabase Vault secret and decrypted only inside an Edge Function.
**A user's API key must never reach the browser after they enter it** — otherwise any XSS
on this site drains their credit, and that is a breach you would have to disclose.

## Sharing model

Viewers should never be forced to register. That is how people actually share family
photos, and it is what the predecessor project (a Drive-backed family travel map) got
right.

- `private` — owner only
- `link` — anyone holding the secret URL. `albums.share_token` is the secret half;
  rotating it revokes every link handed out so far.
- `public` — indexable

Named grants exist for viewers who *do* have accounts: `album_shares` for one album,
`library_shares` for "everything I own, including albums I make later".

Link-shared albums are deliberately **not** readable through RLS. They are reached through
`get_shared_album(token)`, a `SECURITY DEFINER` function, so the secret never has to be
expressible in a policy.

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
  ├── resize + pHash + face detect ──► all local, no API, no cost
  ├── upload ──────────────────────► Supabase Storage (bucket: photos)
  ├── read/write metadata ─────────► Supabase Postgres (RLS)
  └── request alt text ────────────► Edge Function ──► vision model
                                       └── resolves the user's Vault key (BYOK)
                                           or uses the platform key (subscription)
```

Photos are resized in the browser before upload (~2000px long edge). That single choice is
the difference between a 500-photo library costing ~2 GB and ~250 MB.

## Supabase

Project ref `vsxbedlsnfmsbnlfayae`, region `eu-central-1`. Schema lives in
`supabase/migrations/` and is the source of truth — never edit the hosted database by hand
without committing the migration, or the repo and the database drift apart.

Tables: `profiles`, `albums`, `photos`, `people`, `face_embeddings`, `album_shares`,
`library_shares`, `ai_usage`.

> **Operational note learned the hard way:** never apply a migration while a project is
> `COMING_UP`. It will report success, and a finishing restore will then silently overwrite
> your schema. Check `get_project` status first, and verify after with `list_migrations` —
> not just `list_tables`.

## Getting started

```bash
npm install
cp .env.example .env      # fill in the Supabase URL + publishable key
npm run dev
```

## Status

Nothing is built yet. The schema is applied and the plan is in
[`docs/plans/`](docs/plans/). First slice: upload photos → AI alt text → review and edit.
