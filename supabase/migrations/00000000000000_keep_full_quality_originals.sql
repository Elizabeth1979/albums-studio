-- Keep each photograph exactly as it was chosen, beside the copies the app draws.
--
-- Until now an upload stored a 2000px copy and threw the original away. That is
-- enough for a screen and for a 10x15 cm print, not for a full page or a photo
-- book, and it cannot be undone: an original not kept at upload is gone. So this
-- comes before anything that would want one.
--
-- Nullable, and it stays null for every photograph uploaded before this: there
-- are no bytes to point at. Insert only, not update: unlike the display copy,
-- an original cannot be made after the fact, so nothing has a reason to set it
-- on a row that already exists.
--
-- Not readable by anon. Originals carry the camera's metadata, including where
-- the photograph was taken, which the redrawn copies do not. A visitor gets them
-- only once that is removed (roadmap Phase 3.5, step 2).

alter table public.photos add column original_path text;

alter table public.photos
  add constraint photos_original_path_owner_check check (
    original_path is null
    or (
      original_path like owner_id::text || '/%'
      and length(original_path) > length(owner_id::text) + 1
    )
  );

grant select (original_path), insert (original_path) on table public.photos to authenticated;

-- The bucket took 5 MB, which a phone original routinely exceeds, and no HEIC.
-- Mirrored by ORIGINAL_SIZE_LIMIT and the kept types in src/lib/originals.ts;
-- change them together.
update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic', 'image/heif'
    ]
where id = 'photos';
