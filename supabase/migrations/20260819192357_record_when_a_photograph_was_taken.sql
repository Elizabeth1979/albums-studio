-- When the camera says the photograph was taken.
--
-- Without a time zone, deliberately. EXIF's DateTimeOriginal is wall-clock time
-- with no offset recorded, so timestamptz would force a zone to be invented --
-- the uploader's, or the server's -- and move the photograph in time. What the
-- camera wrote is what is kept.
--
-- Nullable, and it will often be null: a screenshot has no EXIF, a messaging
-- app strips it, and photographs already uploaded cannot be backfilled because
-- the original bytes are gone.
alter table public.photos
  add column if not exists taken_at timestamp;

comment on column public.photos.taken_at is
  'Capture time from EXIF DateTimeOriginal, as wall-clock local time with no zone. Null when the file carried none.';

-- Matched to the client: it writes this on insert and reads it back to group
-- photographs taken moments apart.
grant select (taken_at), insert (taken_at) on public.photos to authenticated;

-- Not to anon. A visitor with a share link is shown photographs, not a record
-- of when their owner was somewhere.
revoke all (taken_at) on public.photos from anon;
