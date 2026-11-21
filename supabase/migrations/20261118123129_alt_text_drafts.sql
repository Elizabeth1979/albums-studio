-- Phase 11, first slice: alt text drafted by AI, one photograph at a time.
--
-- Same loop as an album's story: the owner asks, the `alt-draft` Edge Function
-- drafts, the owner reads and edits, and only her Save puts words in
-- `photos.alt`. A draft never touches the photograph itself, so text she wrote
-- (`alt_source = 'human'`) cannot be overwritten by a suggestion.

-- A draft may now be alt text, and alt text belongs to one photograph.
alter table public.ai_drafts
  drop constraint ai_drafts_draft_type_check;

alter table public.ai_drafts
  add constraint ai_drafts_draft_type_check check (draft_type in ('album_story', 'alt'));

alter table public.ai_drafts
  add column photo_id uuid;

-- Through the owner, as everything else here: a draft can only ever point at
-- its own owner's photograph, and goes when the photograph does.
alter table public.ai_drafts
  add constraint ai_drafts_photo_owner_fkey
    foreign key (photo_id, owner_id) references public.photos (id, owner_id) on delete cascade;

alter table public.ai_drafts
  add constraint ai_drafts_alt_has_photo check (draft_type <> 'alt' or photo_id is not null);

create index ai_drafts_photo_owner_idx on public.ai_drafts (photo_id, owner_id);

-- No grant changes. The function writes drafts with the service role; the
-- client still reads its own drafts and may change their status and nothing
-- else, and already holds update on photos.alt and photos.alt_source.
