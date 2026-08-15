-- Historical migration already applied to the hosted project.
-- Kept verbatim so local migration history matches Supabase.

create table if not exists public.albums (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users (id) on delete cascade,
  title          text not null,
  slug           text not null,
  date           date,
  description    text,
  lat            double precision,
  lng            double precision,
  type           text not null default 'travel' check (type in ('travel', 'event')),
  cover_photo_id uuid,
  is_published   boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (owner_id, slug)
);

create table if not exists public.photos (
  id         uuid primary key default gen_random_uuid(),
  album_id   uuid not null references public.albums (id) on delete cascade,
  owner_id   uuid not null references auth.users (id) on delete cascade,
  url        text not null,
  thumb_url  text,
  mime       text,
  caption    text,
  alt        text,
  sort_order integer not null default 0,
  width      integer,
  height     integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (album_id, url)
);

alter table public.albums
  drop constraint if exists albums_cover_photo_id_fkey;
alter table public.albums
  add constraint albums_cover_photo_id_fkey
  foreign key (cover_photo_id) references public.photos (id) on delete set null;

create index if not exists photos_album_id_sort_order_idx
  on public.photos (album_id, sort_order);
create index if not exists photos_owner_id_idx on public.photos (owner_id);
create index if not exists albums_owner_id_idx on public.albums (owner_id);
create index if not exists albums_published_idx on public.albums (is_published)
  where is_published;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists albums_set_updated_at on public.albums;
create trigger albums_set_updated_at
  before update on public.albums
  for each row execute function public.set_updated_at();

drop trigger if exists photos_set_updated_at on public.photos;
create trigger photos_set_updated_at
  before update on public.photos
  for each row execute function public.set_updated_at();

alter table public.albums enable row level security;
alter table public.photos enable row level security;

drop policy if exists albums_select_published on public.albums;
create policy albums_select_published on public.albums
  for select to anon, authenticated using (is_published);

drop policy if exists albums_select_own on public.albums;
create policy albums_select_own on public.albums
  for select to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists albums_insert_own on public.albums;
create policy albums_insert_own on public.albums
  for insert to authenticated with check ((select auth.uid()) = owner_id);

drop policy if exists albums_update_own on public.albums;
create policy albums_update_own on public.albums
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists albums_delete_own on public.albums;
create policy albums_delete_own on public.albums
  for delete to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists photos_select_published on public.photos;
create policy photos_select_published on public.photos
  for select to anon, authenticated using (
    exists (
      select 1 from public.albums a
      where a.id = photos.album_id and a.is_published
    )
  );

drop policy if exists photos_select_own on public.photos;
create policy photos_select_own on public.photos
  for select to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists photos_insert_own on public.photos;
create policy photos_insert_own on public.photos
  for insert to authenticated with check ((select auth.uid()) = owner_id);

drop policy if exists photos_update_own on public.photos;
create policy photos_update_own on public.photos
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists photos_delete_own on public.photos;
create policy photos_delete_own on public.photos
  for delete to authenticated using ((select auth.uid()) = owner_id);
