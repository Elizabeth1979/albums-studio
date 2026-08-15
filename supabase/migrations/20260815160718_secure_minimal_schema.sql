-- Tighten the initial schema before application development starts.
-- All affected tables are empty at the time this migration is applied.

-- Remove speculative features until their complete product and privacy flows exist.
drop table public.face_embeddings;
drop table public.people;
drop extension if exists vector;

drop table public.album_shares;
drop table public.library_shares;

-- A user-editable profile must not contain billing entitlements or Vault references.
alter table public.profiles
  drop column ai_key_secret_id,
  drop column ai_provider,
  drop column plan;

-- Store canonical private Storage paths instead of permanent public URLs.
drop function public.get_shared_album(uuid);

alter table public.albums
  drop constraint albums_cover_photo_id_fkey;

alter table public.photos
  drop constraint photos_album_id_fkey,
  drop constraint photos_album_id_url_key,
  drop column url,
  drop column thumb_url,
  alter column storage_path set not null,
  add column thumbnail_path text,
  add constraint photos_storage_path_key unique (storage_path),
  add constraint photos_dimensions_check check (
    (width is null or width > 0) and (height is null or height > 0)
  ),
  add constraint photos_sharpness_check check (sharpness is null or sharpness >= 0),
  add constraint photos_quality_score_check check (
    quality_score is null or quality_score between 0 and 1
  ),
  add constraint photos_sort_order_check check (sort_order >= 0);

alter table public.albums
  add constraint albums_coordinates_check check (
    (lat is null or lat between -90 and 90)
    and (lng is null or lng between -180 and 180)
  ),
  add constraint albums_id_owner_key unique (id, owner_id);

alter table public.photos
  add constraint photos_album_owner_fkey
    foreign key (album_id, owner_id)
    references public.albums (id, owner_id)
    on delete cascade,
  add constraint photos_id_album_owner_key unique (id, album_id, owner_id);

alter table public.albums
  add constraint albums_cover_photo_fkey
    foreign key (cover_photo_id, id, owner_id)
    references public.photos (id, album_id, owner_id)
    on delete set null (cover_photo_id);

create index albums_cover_photo_idx on public.albums (cover_photo_id)
  where cover_photo_id is not null;

alter table public.ai_usage
  add constraint ai_usage_count_check check (count >= 0);

-- Trigger helpers do not need to be callable through the Data API.
alter function public.set_updated_at() security invoker;
revoke all on function public.set_updated_at() from public, anon, authenticated;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name');
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Keep the recursive RLS helper out of the exposed public schema.
drop policy albums_select on public.albums;
drop policy photos_select on public.photos;
drop function public.can_view_album_id(uuid);

create function private.can_view_album_id(target uuid)
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
      )
  );
$$;

revoke all on function private.can_view_album_id(uuid) from public;
grant usage on schema private to anon, authenticated;
grant execute on function private.can_view_album_id(uuid) to anon, authenticated;

create policy albums_select on public.albums
  for select to anon, authenticated
  using (private.can_view_album_id(id));

create policy photos_select on public.photos
  for select to anon, authenticated
  using (private.can_view_album_id(album_id));

-- Separate write policies avoid overlapping SELECT policies and make intent explicit.
drop policy albums_write_own on public.albums;
create policy albums_insert_own on public.albums
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy albums_update_own on public.albums
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy albums_delete_own on public.albums
  for delete to authenticated
  using ((select auth.uid()) = owner_id);

drop policy photos_write_own on public.photos;
create policy photos_insert_own on public.photos
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy photos_update_own on public.photos
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy photos_delete_own on public.photos
  for delete to authenticated
  using ((select auth.uid()) = owner_id);

drop policy profiles_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Explicit least-privilege Data API grants.
revoke all on table public.profiles, public.albums, public.photos, public.ai_usage
  from anon, authenticated;

grant select on table public.albums, public.photos to anon;
grant select, insert, update, delete on table public.albums, public.photos
  to authenticated;
grant select on table public.profiles, public.ai_usage to authenticated;
grant update (display_name) on table public.profiles to authenticated;

-- Private objects make share-token rotation meaningful for the image bytes too.
update storage.buckets
set public = false
where id = 'photos';

drop policy photos_bucket_public_read on storage.objects;
create policy photos_bucket_owner_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy photos_bucket_owner_update on storage.objects;
create policy photos_bucket_owner_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Link sharing remains an intentional anonymous SECURITY DEFINER endpoint.
-- A server or Edge Function must exchange returned paths for short-lived signed URLs.
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
  from public.albums a
  left join public.photos p on p.album_id = a.id
  where a.share_token = token
    and a.visibility in ('link', 'public')
  order by p.sort_order;
$$;

revoke all on function public.get_shared_album(uuid) from public;
grant execute on function public.get_shared_album(uuid) to anon, authenticated;
