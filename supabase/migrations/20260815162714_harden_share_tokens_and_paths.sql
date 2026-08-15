-- Keep share credentials out of Data API-visible album rows.
create table private.album_share_tokens (
  album_id   uuid primary key references public.albums (id) on delete cascade,
  token      uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table private.album_share_tokens enable row level security;
revoke all on table private.album_share_tokens from public, anon, authenticated;

insert into private.album_share_tokens (album_id, token)
select id, share_token
from public.albums;

drop function public.get_shared_album(uuid);
drop index public.albums_share_token_idx;

alter table public.albums
  drop column share_token;

create function private.create_album_share_token()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.album_share_tokens (album_id)
  values (new.id);
  return new;
end;
$$;

revoke all on function private.create_album_share_token()
  from public, anon, authenticated;

create trigger albums_create_share_token
  after insert on public.albums
  for each row execute function private.create_album_share_token();

-- A photo may only point at objects inside its owner's bucket namespace.
alter table public.photos
  add constraint photos_storage_path_owner_check check (
    storage_path like owner_id::text || '/%'
    and length(storage_path) > length(owner_id::text) + 1
  ),
  add constraint photos_thumbnail_path_owner_check check (
    thumbnail_path is null
    or (
      thumbnail_path like owner_id::text || '/%'
      and length(thumbnail_path) > length(owner_id::text) + 1
    )
  );

-- Clients may create rows and edit product fields, but not rewrite identity,
-- ownership, timestamps, Storage paths, or generated upload metadata.
revoke insert, update on table public.albums, public.photos from authenticated;

grant insert (
  owner_id,
  title,
  slug,
  date,
  description,
  lat,
  lng,
  visibility
) on table public.albums to authenticated;

grant update (
  title,
  slug,
  date,
  description,
  lat,
  lng,
  visibility,
  cover_photo_id
) on table public.albums to authenticated;

grant insert (
  album_id,
  owner_id,
  storage_path,
  thumbnail_path,
  mime,
  width,
  height,
  caption,
  alt,
  alt_source,
  phash,
  sharpness,
  quality_score,
  sort_order
) on table public.photos to authenticated;

grant update (
  caption,
  alt,
  alt_source,
  sort_order
) on table public.photos to authenticated;

-- Anonymous link lookup is the only public path to the private token table.
create function public.get_shared_album(token uuid)
returns table (
  album_id       uuid,
  title          text,
  description    text,
  photo_id       uuid,
  storage_path   text,
  thumbnail_path text,
  caption        text,
  alt            text,
  sort_order     integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.title, a.description,
         p.id, p.storage_path, p.thumbnail_path, p.caption, p.alt, p.sort_order
  from private.album_share_tokens t
  join public.albums a on a.id = t.album_id
  left join public.photos p on p.album_id = a.id
  where t.token = token
    and a.visibility in ('link', 'public')
  order by p.sort_order;
$$;

revoke all on function public.get_shared_album(uuid) from public;
grant execute on function public.get_shared_album(uuid) to anon, authenticated;
