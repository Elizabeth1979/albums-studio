-- Phase 4 gives owners three separate kinds of text about a photograph: a
-- caption, a story note, and alt text. Alt text is already a column. This adds
-- the two that were only ever sketched, and closes the leak that introducing
-- "hidden" text opens up.

-- 1. Captions can be kept back ---------------------------------------------
--
-- A caption an owner writes for their own organisation is not necessarily one
-- they want printed under the photograph for visitors. Hidden is the default
-- because it is the safe direction to be wrong in: text becomes visible only
-- when someone says so.
alter table public.photos
  add column caption_visibility text not null default 'hidden'
    check (caption_visibility in ('hidden', 'visible'));

grant insert (caption_visibility) on table public.photos to authenticated;
grant update (caption_visibility) on table public.photos to authenticated;

-- 2. Hidden captions must not reach viewers --------------------------------
--
-- Two paths would have served them anyway, and both are shut here rather than
-- left for the phase that switches sharing on.
--
-- The first is this function, which handed back every caption to anyone holding
-- a share token. It now returns a caption only when the owner marked it visible.
create or replace function public.get_shared_album(token uuid)
returns table (
  album_id uuid,
  title text,
  description text,
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
  select a.id, a.title, a.description,
         p.id, p.storage_path, p.thumbnail_path,
         case when p.caption_visibility = 'visible' then p.caption end,
         p.alt, p.sort_order
  from private.album_share_tokens t
  join public.albums a on a.id = t.album_id
  left join public.photos p on p.album_id = a.id
  where t.token = token
    and a.visibility in ('link', 'public')
  order by p.sort_order;
$function$;

-- The second is the Data API. A row-level policy decides which photos a signed
-- out visitor may read, but a column grant is all or nothing, so anon holding
-- `select (caption)` would expose hidden captions on any album whose visibility
-- became 'public'. Visible captions reach viewers through the function above,
-- which can make the row-by-row decision that a grant cannot.
--
-- alt text keeps its grant on purpose: it exists to be read out to a visitor
-- using a screen reader, so there is no hidden state to protect.
revoke select (caption) on table public.photos from anon;

-- 3. Story notes ------------------------------------------------------------
--
-- Longer than a caption and separate from it: what happened, who made the cake,
-- why the photograph mattered. A photo can carry several.
--
-- The foreign key is composite so that a story cannot be attached to someone
-- else's photograph even if the row-level policy were ever loosened. `albums`
-- already carries the matching unique key for the same reason; `photos` needs
-- one before it can be pointed at this way.
alter table public.photos
  add constraint photos_id_owner_key unique (id, owner_id);

create table public.photo_stories (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  visibility text not null default 'hidden'
    check (visibility in ('hidden', 'visible')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- An empty story is not a story. Removing the text is how you delete one, so
  -- there is no reason to store a blank row.
  constraint photo_stories_body_not_blank check (btrim(body) <> ''),
  constraint photo_stories_photo_fkey foreign key (photo_id, owner_id)
    references public.photos (id, owner_id) on delete cascade
);

-- Stories are read for one photo at a time and for a screenful of photos at
-- once; both go through photo_id.
create index photo_stories_photo_idx on public.photo_stories (photo_id);
create index photo_stories_owner_idx on public.photo_stories (owner_id);

create trigger photo_stories_set_updated_at
  before update on public.photo_stories
  for each row execute function public.set_updated_at();

alter table public.photo_stories enable row level security;

-- Owner-only, with no anon grants at all. Sharing story notes is Phase 6's
-- decision and will come through trusted server code that can read the
-- visibility column, the same way captions now do.
create policy photo_stories_select on public.photo_stories
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy photo_stories_insert on public.photo_stories
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy photo_stories_update on public.photo_stories
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy photo_stories_delete on public.photo_stories
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Writes are granted per column, so every column the client sends needs naming
-- here. `owner_id` is writable because the client supplies it on insert; the
-- policy above is what checks it is the caller's own.
grant select (id, photo_id, owner_id, body, visibility, created_at, updated_at)
  on table public.photo_stories to authenticated;
grant insert (photo_id, owner_id, body, visibility)
  on table public.photo_stories to authenticated;
grant update (body, visibility) on table public.photo_stories to authenticated;
grant delete on table public.photo_stories to authenticated;
