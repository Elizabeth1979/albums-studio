-- albums-studio: initial schema.
--
-- Already applied to project vsxbedlsnfmsbnlfayae on 2026-08-15 and recorded in that
-- project's migration history as 20260815131251. Committed here so the repo is the source
-- of truth: never edit the hosted database by hand without adding a migration, or the two
-- drift apart silently.
--
-- The filename says "album_studio" because that was the working name when the migration
-- was applied, and that name is what Supabase recorded. Renaming the file would break the
-- correspondence with the hosted migration history, so it stays.
--
-- The leading drops clear a speculative schema from an abandoned project that this one was
-- repurposed from. Those tables held zero rows and were never read by anything.

drop function if exists public.get_shared_album(uuid);
drop table if exists public.photos cascade;
drop table if exists public.albums cascade;

create extension if not exists vector with schema extensions;

-- Profiles -------------------------------------------------------------------
create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  display_name     text,
  -- BYOK: a Vault secret id, never the key itself. Only an Edge Function with
  -- the service role resolves it; the client must never be able to read it.
  ai_key_secret_id uuid,
  ai_provider      text check (ai_provider in ('gemini', 'anthropic', 'openai')),
  plan             text not null default 'free' check (plan in ('free', 'pro')),
  created_at       timestamptz not null default now()
);

-- Albums ---------------------------------------------------------------------
do $$ begin
  create type public.album_visibility as enum ('private', 'link', 'public');
exception when duplicate_object then null;
end $$;

create table public.albums (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users (id) on delete cascade,
  title          text not null,
  slug           text not null,
  date           date,
  description    text,
  lat            double precision,
  lng            double precision,
  visibility     public.album_visibility not null default 'private',
  -- Secret half of the share URL. Rotating it revokes every link handed out so
  -- far, which is the whole reason it lives per-album.
  share_token    uuid not null default gen_random_uuid(),
  cover_photo_id uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (owner_id, slug)
);

create unique index albums_share_token_idx on public.albums (share_token);
create index albums_owner_idx on public.albums (owner_id);

-- Photos ---------------------------------------------------------------------
create table public.photos (
  id            uuid primary key default gen_random_uuid(),
  album_id      uuid not null references public.albums (id) on delete cascade,
  owner_id      uuid not null references auth.users (id) on delete cascade,
  storage_path  text,
  url           text not null,
  thumb_url     text,
  mime          text,
  width         integer,
  height        integer,
  caption       text,   -- visible text
  alt           text,   -- accessibility text, owner-approved before shared display
  alt_source    text check (alt_source in ('ai', 'human')),
  -- Perceptual hash for duplicate detection: computed in the browser, no API
  -- call and no cost. Near-duplicates are found by Hamming distance.
  phash         bit(64),
  -- Local quality signals for "best shot of this burst". Also free — sharpness
  -- is a Laplacian variance, eyes-open comes from a local face mesh.
  sharpness     real,
  quality_score real,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (album_id, url)
);

create index photos_album_sort_idx on public.photos (album_id, sort_order);
create index photos_owner_idx on public.photos (owner_id);

alter table public.albums
  add constraint albums_cover_photo_id_fkey
  foreign key (cover_photo_id) references public.photos (id) on delete set null;

-- People + faces --------------------------------------------------------------
-- Consent modeled from day one. Faceprints are biometric data (GDPR Art. 9
-- special category; Illinois BIPA). Keeping embeddings in their own table means
-- withdrawing consent deletes the biometrics without touching the photos.

create table public.people (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  -- Explicit state rather than a nullable boolean: "never asked" and "said no"
  -- are different, and only 'granted' may be processed.
  consent    text not null default 'pending'
             check (consent in ('pending', 'granted', 'declined', 'withdrawn')),
  consent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table public.face_embeddings (
  id         uuid primary key default gen_random_uuid(),
  photo_id   uuid not null references public.photos (id) on delete cascade,
  person_id  uuid references public.people (id) on delete set null,
  owner_id   uuid not null references auth.users (id) on delete cascade,
  bbox       jsonb not null,
  embedding  extensions.vector(128),
  created_at timestamptz not null default now()
);

create index face_embeddings_owner_idx on public.face_embeddings (owner_id);
create index face_embeddings_photo_idx on public.face_embeddings (photo_id);

-- Sharing ---------------------------------------------------------------------
create table public.album_shares (
  album_id   uuid not null references public.albums (id) on delete cascade,
  viewer_id  uuid not null references auth.users (id) on delete cascade,
  can_edit   boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (album_id, viewer_id)
);

create index album_shares_viewer_idx on public.album_shares (viewer_id);

-- "Share my whole library with X" — survives albums added later, which a
-- per-album grant cannot.
create table public.library_shares (
  owner_id   uuid not null references auth.users (id) on delete cascade,
  viewer_id  uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, viewer_id)
);

create index library_shares_viewer_idx on public.library_shares (viewer_id);

-- AI usage metering -------------------------------------------------------------
-- Meter all platform-paid AI operations, including BYOK calls for user visibility.
-- Dedupe, collage, best-shot, and similar deterministic/local/open features should
-- avoid paid model calls whenever quality is good enough.
create table public.ai_usage (
  owner_id  uuid not null references auth.users (id) on delete cascade,
  period    date not null,
  operation text not null,
  count     integer not null default 0,
  byok      boolean not null default false,
  primary key (owner_id, period, operation, byok)
);

-- updated_at ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger albums_set_updated_at before update on public.albums
  for each row execute function public.set_updated_at();
create trigger photos_set_updated_at before update on public.photos
  for each row execute function public.set_updated_at();

-- Visibility helper ---------------------------------------------------------------
-- SECURITY DEFINER on purpose: it is called from the RLS policies of both albums
-- and photos. An invoker-rights version would re-enter albums' own policy and
-- recurse.
create or replace function public.can_view_album_id(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.albums a
    where a.id = target
      and (
        a.visibility = 'public'
        or a.owner_id = (select auth.uid())
        or exists (
          select 1 from public.album_shares s
          where s.album_id = a.id and s.viewer_id = (select auth.uid())
        )
        or exists (
          select 1 from public.library_shares l
          where l.owner_id = a.owner_id and l.viewer_id = (select auth.uid())
        )
      )
  );
$$;

-- Row-Level Security ---------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.albums          enable row level security;
alter table public.photos          enable row level security;
alter table public.people          enable row level security;
alter table public.face_embeddings enable row level security;
alter table public.album_shares    enable row level security;
alter table public.library_shares  enable row level security;
alter table public.ai_usage        enable row level security;

create policy profiles_own on public.profiles
  for all to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Link-shared albums are deliberately NOT readable here: they are reached
-- through get_shared_album(token), so the secret never appears in a policy.
create policy albums_select on public.albums
  for select to anon, authenticated using (public.can_view_album_id(id));

create policy albums_write_own on public.albums
  for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

create policy photos_select on public.photos
  for select to anon, authenticated using (public.can_view_album_id(album_id));

create policy photos_write_own on public.photos
  for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

-- People and faces are owner-only: nothing biometric is readable by a viewer,
-- however widely an album is shared.
create policy people_own on public.people
  for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

create policy faces_own on public.face_embeddings
  for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

create policy album_shares_owner on public.album_shares
  for all to authenticated
  using (exists (
    select 1 from public.albums a
    where a.id = album_shares.album_id and a.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.albums a
    where a.id = album_shares.album_id and a.owner_id = (select auth.uid())
  ));

create policy library_shares_owner on public.library_shares
  for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

create policy ai_usage_own on public.ai_usage
  for select to authenticated using ((select auth.uid()) = owner_id);

-- Link sharing --------------------------------------------------------------------
-- Anyone holding the token reads the album without an account. SECURITY DEFINER
-- so the lookup bypasses RLS; the only way in is presenting the secret, and
-- rotating share_token revokes every outstanding link at once.
create or replace function public.get_shared_album(token uuid)
returns table (
  album_id    uuid,
  title       text,
  description text,
  photo_id    uuid,
  url         text,
  thumb_url   text,
  caption     text,
  alt         text,
  sort_order  integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.title, a.description,
         p.id, p.url, p.thumb_url, p.caption, p.alt, p.sort_order
  from public.albums a
  left join public.photos p on p.album_id = a.id
  where a.share_token = token
    and a.visibility in ('link', 'public')
  order by p.sort_order;
$$;

revoke all on function public.get_shared_album(uuid) from public;
grant execute on function public.get_shared_album(uuid) to anon, authenticated;
