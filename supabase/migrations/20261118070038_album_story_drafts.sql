-- Phase 5, first slice: an album's story, drafted by AI and accepted by its owner.
--
-- The loop this serves: photographs plus the owner's words, then an AI draft,
-- then the owner's edit, then a published story. Every draft is kept, so an
-- accepted story can always be traced back to what produced it.

-- Drafts -------------------------------------------------------------------------
--
-- Written only by the `story-draft` Edge Function, with the service role: the
-- client never invents a draft, it asks for one. The owner may read their own
-- and change one thing about them — whether they were accepted or set aside.
create table public.ai_drafts (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users (id) on delete cascade,
  album_id      uuid not null,
  draft_type    text not null check (draft_type in ('album_story')),
  -- What the owner wrote to steer it, kept beside what came back.
  prompt        text check (prompt is null or char_length(prompt) <= 4000),
  -- Which photographs it was shown, as photo ids.
  input_refs    jsonb not null default '[]'::jsonb,
  body          text not null,
  status        text not null default 'draft'
                check (status in ('draft', 'accepted', 'rejected', 'superseded')),
  model         text not null,
  -- What it cost, as the model reported it. The measured price of a draft.
  input_tokens  integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint ai_drafts_album_owner_fkey
    foreign key (album_id, owner_id) references public.albums (id, owner_id) on delete cascade,
  constraint ai_drafts_id_owner_key unique (id, owner_id)
);

create index ai_drafts_album_owner_idx on public.ai_drafts (album_id, owner_id);

create trigger ai_drafts_set_updated_at before update on public.ai_drafts
  for each row execute function public.set_updated_at();

alter table public.ai_drafts enable row level security;

-- Supabase grants everything on a new public table to anon and authenticated.
revoke all on table public.ai_drafts from anon, authenticated;
grant select on table public.ai_drafts to authenticated;
grant update (status) on table public.ai_drafts to authenticated;

create policy ai_drafts_owner_select on public.ai_drafts
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy ai_drafts_owner_update on public.ai_drafts
  for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

-- The accepted story, on the album --------------------------------------------
--
-- Published text: readable wherever the album already is, which for a visitor
-- means only through `get_shared_album`. The draft it came from is linked,
-- through the owner, so a story can only ever point at its own owner's draft.
alter table public.albums
  add column story text check (story is null or char_length(story) <= 20000),
  add column story_draft_id uuid;

alter table public.albums
  add constraint albums_story_draft_fkey
    foreign key (story_draft_id, owner_id) references public.ai_drafts (id, owner_id)
    on delete set null (story_draft_id);

create index albums_story_draft_idx on public.albums (story_draft_id, owner_id);

grant update (story, story_draft_id) on table public.albums to authenticated;

-- Counting AI use ----------------------------------------------------------------
--
-- One row per owner, month and operation, counted up by the server after each
-- call that cost money. Atomic, so two drafts at once cannot both read the old
-- count. Callable by the service role alone.
create function public.record_ai_use(p_owner uuid, p_operation text)
returns integer
language sql
security invoker
set search_path to ''
as $function$
  insert into public.ai_usage (owner_id, period, operation, count, byok)
  values (p_owner, date_trunc('month', now())::date, p_operation, 1, false)
  on conflict (owner_id, period, operation, byok)
  do update set count = public.ai_usage.count + 1
  returning count;
$function$;

revoke all on function public.record_ai_use(uuid, text) from public, anon, authenticated;
grant execute on function public.record_ai_use(uuid, text) to service_role;

-- The shared album carries its story -------------------------------------------
drop function if exists public.get_shared_album(uuid);

create function public.get_shared_album(share_token uuid)
returns table (
  album_id uuid,
  title text,
  description text,
  layout text,
  story text,
  photo_id uuid,
  storage_path text,
  thumbnail_path text,
  caption text,
  alt text,
  sort_order integer
)
language sql
stable
security definer
set search_path to ''
as $function$
  select a.id, a.title, a.description, a.layout, a.story,
         p.id, p.storage_path, p.thumbnail_path,
         case when p.caption_visibility = 'visible' then p.caption end,
         p.alt, p.sort_order
  from private.album_share_tokens t
  join public.albums a on a.id = t.album_id
  left join public.photos p on p.album_id = a.id
  where t.token = share_token
    and a.visibility in ('link', 'public')
  order by p.sort_order;
$function$;

revoke all on function public.get_shared_album(uuid) from public;
grant execute on function public.get_shared_album(uuid) to anon, authenticated;
