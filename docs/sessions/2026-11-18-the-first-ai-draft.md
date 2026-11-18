# The first AI draft

2026-11-16 to 2026-11-18. Phase 5's first slice: an album's story, drafted by AI, edited by
its owner, and published only when she uses it.

## What shipped

- `ai_drafts`, written only by the `story-draft` Edge Function with the service role. The
  client may read its own drafts and set `status`; `body` is never rewritten, so an accepted
  story can always be traced to what produced it.
- `albums.story` and `albums.story_draft_id`, the latter tied to the same owner's draft by a
  composite foreign key. `get_shared_album` returns the story; drafts never leave the studio.
- `record_ai_use`, an atomic monthly counter callable by the service role alone.
- `story-draft`, JWT verification on, reading the album and its photographs through a
  client carrying the owner's token, so row-level security decides what may be drafted from.
- The Story panel on the album page and the story at the top of the shared album.

Verified against the hosted project: migration recorded as `20261118070038`, column
privileges as designed, `client_paths.sql` 0 of 43 failed with five new checks, advisors
showing nothing new beyond an informational unindexed `ai_drafts.owner_id` (used only when an
account is deleted). Live: the function answers a request with no key configured in plain
words, and a real share link returns the `story` field.

## Decisions and why

- **Stories before voice and suggestions.** The smallest slice that runs the whole loop, so
  cost, quality and review are measured on something real first.
- **Claude Sonnet 5.5, medium effort, server-side fallback.** Opus 5.5 was the first choice;
  the owner moved it to Sonnet 5.5 on cost, at half the price (about 7 US cents a story
  against 14). Opus is one line away if real drafts read flat. Fallback keeps an ordinary family album from being lost
  to an over-cautious refusal.
- **Platform key, five drafts a month, counted on every completed call.** Owners should not
  need an AI account to try the studio. Five is provisional: estimated at about 7 US cents
  for 15 photographs, to be confirmed from the token counts the first real drafts record.
- **Private notes go to the model, marked private, with an instruction not to quote them.**
  They are often the context that makes the story true; the owner is told so beside the
  button.
- **The Story panel sits below the photographs on the album page.** Above them it pushed the
  first photograph past the middle of a phone screen, which the phone-layout test caught.
  Visitors still read it first.

## Open

- The `ANTHROPIC_API_KEY` function secret, which only the owner can add.
- The first real draft: its quality, and its cost from `ai_drafts.input_tokens` and
  `output_tokens`, before the allowance is called final.
