# Plan: AI alt text drafts (roadmap Phase 11)

**Status:** Slice 1 built 2026-11-18: migration `20261118123129_alt_text_drafts` applied,
`alt-draft` deployed, `client_paths.sql` clean. Not yet tried on a real photograph. Slice 2
not started.
**Keywords:** alt text, accessibility, screen reader, AI draft, `ai_drafts`, `alt_source`,
`alt-draft` Edge Function, Claude Sonnet 5.5, review queue, allowance.

## TL;DR

- The owner presses **Suggest** beside a photo's alt text box. The AI looks at that photo and
  drafts a description. She reads it, edits it if she wants, and saves it. Nothing reaches the
  share link until she saves.
- It reuses what the story studio already built: the same model (Claude Sonnet 5.5), the same
  drafts table, the same monthly counting. One new server function, one small database change.
- **The AI only sees text that is already public.** Alt text is always given to visitors, so a
  private caption or note never goes to the alt writer, where a name in it could leak out.
- **Her own words are never replaced.** The AI never writes to a photo, only to a draft. A
  suggestion lands in the box only when she presses "Use this", and is kept only when she
  presses Save.
- Two slices. **Slice 1:** one photo at a time, in the photo editor. **Slice 2:** "12 photos
  have no alt text — describe them", then a review list, one photo at a time.

## What it will look like

Slice 1, in the photo editor, on a photo with no alt text yet:

```
  Alt text
  ┌────────────────────────────────────────────────────────────┐
  │                                                            │
  └────────────────────────────────────────────────────────────┘
  Describes the picture for anyone using a screen reader. …

  [ Suggest a description ]   49 of 50 left this month
```

After pressing it:

```
  ┌ Suggested ─────────────────────────────────────────────────┐
  │ Two children sit on the end of a wooden jetty at sunset,   │
  │ their feet in the water.                                   │
  │                                                            │
  │ Check that it says what you see. It is not saved yet.      │
  │ [ Use this ]   [ Discard ]                                 │
  └────────────────────────────────────────────────────────────┘
```

"Use this" puts the text in the box above, where it can be changed like anything typed. Save
works the same as today. On a photo that already has alt text, the button reads
**Suggest a different description**, and the suggestion appears below her text without
touching it.

Slice 2, on the album page:

```
  12 photographs have no alt text.  [ Describe them ]   (uses 12 of 50 this month)

  ── Review descriptions  (3 of 12) ─────────────────────────────
  ┌──────────┐  ┌──────────────────────────────────────────────┐
  │  photo   │  │ A grey heron standing in shallow water near  │
  │          │  │ reeds.                                       │
  └──────────┘  └──────────────────────────────────────────────┘
                [ Save and next ]  [ Skip ]
```

## Context / why

Alt text is what a screen reader says instead of the photo. Albums Studio already lets the
owner write it, and it already reaches visitors on share links. But writing it for 200
photographs is the chore nobody does. A good first draft turns it into a quick check. That
makes shared albums usable by blind and low-vision relatives, and it is a free-tier taster of
the AI.

The roadmap's warning stands: **wrong alt text is worse than none**, because the people who
rely on it cannot see that it is wrong. So every draft is reviewed before it is used, and
the prompt is built to leave things out rather than guess.

## Decisions (made here, with reasons)

| Decision | Why | What would change it |
|---|---|---|
| Claude Sonnet 5.5, not a free in-browser model | The roadmap's evaluation found the free models (Florence-2, SmolVLM) generic, prone to miscounting people and inventing objects, and 300-500 MB to load, which many phones cannot do. Sonnet already reads these albums for stories. | A free model measured on her real photos describing as well, which would make the free tier cheaper. |
| Only public text goes to the alt writer: album title, *visible* captions, *visible* story notes | Alt text is always shown to visitors. Private notes help a story because she reviews a whole story, but a short description is exactly where a private name would slip through unnoticed. | Nothing. This is a privacy rule, not a tuning choice. |
| The AI writes drafts, never `photos.alt` | Keeps the "draft first" invariant. `alt_source = 'human'` text can never be overwritten by a suggestion, because nothing a suggestion does touches `alt`. | — |
| Saved unchanged: `alt_source = 'ai'`. Edited first: `'human'` | Keeps an honest record of who wrote the words, so a later audit can find unedited AI descriptions. The draft is also marked `accepted`, so each one traces back to its source. | — |
| Free allowance: **50 descriptions a month**, counted separately from the 5 stories | One photo is about one twentieth of a story's input. The first real story was measured at about 5 US cents for 20 photos, so about a quarter of a cent each, and at most about 12 cents a month at 50. Enough to describe a whole holiday album. | Her call on price. The first real drafts' token counts confirm the cost. |
| A new `alt-draft` Edge Function rather than a mode of `story-draft` | Different input (one photo), different prompt, different allowance. Sharing a function would couple two features that change for different reasons. Common pieces move to `_shared/`. | — |

## Constraints

- **Draft first, always.** Nothing the AI produces is visible to a visitor until the owner
  saves it. Never auto-publish.
- **Private text never reaches the alt writer.** A unit test asserts that a private caption
  and a private note are absent from what is sent. The test must be seen to fail with the
  filter removed.
- **The AI key stays in the Edge Function** (`ANTHROPIC_API_KEY`, already set). It never
  reaches the browser.
- **Database rules from `AGENTS.md`:** forward-only migration; rename it to the version the
  database records; no new client grants are needed (the client still only changes a
  draft's `status`, and already holds `update` on `alt` and `alt_source`). Confirm that
  against `information_schema.column_privileges`. Add the new paths to
  `supabase/checks/client_paths.sql` and run it. Run the security and performance advisors.
- **A failure must not look like "nothing to say".** No allowance left, the AI unreachable,
  and the AI declining each get their own plain message on screen.
- **Accessibility:** the suggestion is announced through the existing `LiveStatus`; every
  control works by keyboard; check it with axe, and on a phone and a desktop screen before
  calling it done.

## What the AI is asked to do (prompt outline)

Describe what matters in the photograph for someone who cannot see it, in one or two plain
sentences. Don't start with "image of" or "photo of". Use a person's name only if a visible
caption gives it, and otherwise describe, never identify. Don't guess age, ethnicity or
feelings beyond what is plainly visible. Read out meaningful text that appears in the photo.
If something is unclear, leave it out. Write in the language the album is written in. Return
only the description.

This follows established alt text guidance (WebAIM, W3C's alt decision tree): concise,
content and purpose first, no redundant "image of".

## Work, one piece at a time

### ▶ This session

- [x] This plan, linked from `docs/README.md` and the roadmap's Phase 11.
- [x] Slice 1, steps 1-6 below. Step 7's merge and the owner's first real try are left.

### ▷ Next session: Slice 1, one photo at a time

1. **Migration** `ai_alt_drafts`: widen `ai_drafts.draft_type` to `('album_story', 'alt')`;
   add `photo_id uuid` with `foreign key (photo_id, owner_id) references photos (id,
   owner_id) on delete cascade` (the unique `photos_id_owner_key` already exists); require
   it when `draft_type = 'alt'`; index `(photo_id, owner_id)`. Grants unchanged.
2. **`_shared/altContext.ts`**, a pure function: photo row + album + notes → the text sent to
   the model, with private text removed. Tested on its own, including the "private text
   absent" test.
3. **`alt-draft` Edge Function:** `verify_jwt` on; reads the photo as the owner (row-level
   security decides); checks the 50-a-month allowance under operation `alt`; sends the
   display copy and the public context; counts every completed call; saves the draft with
   its token count; returns it. Same refusal and error handling as `story-draft`.
4. **`src/lib/altDraft.ts`:** `draftAlt(photoId)` plus reuse of `settleDraft`. `updatePhoto`
   learns to save `alt_source = 'ai'` when the text equals an accepted draft unchanged.
5. **Photo editor UI:** Suggest button with the allowance count, the suggestion panel, Use
   this / Discard, the messages for each failure.
6. **Tests:** component tests; an end-to-end test with the function intercepted;
   `client_paths.sql` updated and run against the real project.
7. **Ship:** apply the migration, deploy the function, merge. Then she tries it on real
   photos. This is the roadmap's Phase 11 checkpoint: generate, edit, approve, and the
   approved text is what a screen reader gets on the share link.

### ▷ The session after: Slice 2, a whole album

8. Album page: count photos with no alt text; "Describe them" drafts up to the allowance
   left, a few at a time with progress.
9. A review list, one photo at a time: Save and next / Skip. Skipped drafts are marked
   `rejected`, never deleted.
10. Same checks, at phone and desktop width.

## Reuse

- `supabase/functions/story-draft/index.ts`: auth as owner, the allowance check,
  `record_ai_use`, image download and base64, server-side fallback, error messages. Move
  the shared helpers into `supabase/functions/_shared/`.
- `src/lib/albumStory.ts`: the `invoke` and error-reading pattern, `settleDraft`.
- `src/components/PhotoEditor.tsx`: the alt text field, its hint, `LiveStatus`.
- `supabase/checks/client_paths.sql`: the existing `ai_drafts` probes.

## Verification

- Unit: the context builder leaves out private text, and fails when the filter is removed.
- Component and end-to-end: suggest, use, edit, save; discard; each error shows its message.
- Real database: `client_paths.sql` passes; the migration is recorded under its real
  version; the advisors are clean.
- Real use: three or four of her own photos described, token counts read from `ai_drafts`,
  cost per photo confirmed or the allowance changed.
- Share link: the saved text is the `alt` of the image a visitor's screen reader gets.
