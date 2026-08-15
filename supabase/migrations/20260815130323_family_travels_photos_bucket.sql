-- Historical migration already applied to the hosted project.
-- Kept verbatim so local migration history matches Supabase.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'photos',
  'photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists photos_bucket_public_read on storage.objects;
create policy photos_bucket_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'photos');

drop policy if exists photos_bucket_owner_insert on storage.objects;
create policy photos_bucket_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists photos_bucket_owner_update on storage.objects;
create policy photos_bucket_owner_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists photos_bucket_owner_delete on storage.objects;
create policy photos_bucket_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
