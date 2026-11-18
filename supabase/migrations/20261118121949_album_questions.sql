-- Phase 5: the studio asks about photographs nobody has written about yet.
--
-- A suggestion here is a question about one photograph, asked because it has no
-- caption and no note. The owner answers it (typed or spoken) and the answer is
-- kept as a private note on the photograph, or she dismisses it. Nothing is ever
-- sent to another person: `reason` may say who might know, and that is all.

create table public.ai_suggestions (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null,
  album_id        uuid not null,
  photo_id        uuid not null,
  suggestion_type text not null check (suggestion_type in ('missing_context')),
  -- The question itself.
  body            text not null check (char_length(body) between 1 and 500),
  -- Why it is asked, or who might know: grounded in the owner's own words.
  reason          text check (reason is null or char_length(reason) <= 500),
  status          text not null default 'open'
                  check (status in ('open', 'answered', 'dismissed')),
  model           text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Through the photograph's own (id, album, owner), so a question can only ever
  -- point at a photograph in its own album, of its own owner. The owner's
  -- account is reached through the photograph, and deleting either removes it.
  constraint ai_suggestions_photo_fkey
    foreign key (photo_id, album_id, owner_id)
    references public.photos (id, album_id, owner_id) on delete cascade
);

create index ai_suggestions_photo_idx on public.ai_suggestions (photo_id, album_id, owner_id);
create index ai_suggestions_album_idx on public.ai_suggestions (album_id, owner_id, status);

create trigger ai_suggestions_set_updated_at before update on public.ai_suggestions
  for each row execute function public.set_updated_at();

alter table public.ai_suggestions enable row level security;

-- Supabase grants everything on a new public table to anon and authenticated.
-- Written only by the `album-questions` Edge Function, with the service role.
revoke all on table public.ai_suggestions from anon, authenticated;
grant select on table public.ai_suggestions to authenticated;
grant update (status) on table public.ai_suggestions to authenticated;

create policy ai_suggestions_owner_select on public.ai_suggestions
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy ai_suggestions_owner_update on public.ai_suggestions
  for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
