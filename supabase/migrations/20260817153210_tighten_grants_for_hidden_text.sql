-- Two grant problems, both found by checking information_schema.column_privileges
-- after the previous migration rather than trusting that it had done what it read
-- as if it did.

-- 1. The caption revoke was a no-op ----------------------------------------
--
-- anon holds `grant select on table public.photos`, granted table-wide by
-- 20260815160718. A column cannot be subtracted from a table-level grant:
-- `revoke select (caption) ... from anon` parses, succeeds, and changes nothing.
-- The only way down to a subset is to drop the table grant and name the columns.
--
-- This is the list a signed-out viewer needs to draw a photograph and nothing
-- else. Absent on purpose: `caption`, which may be hidden and now reaches
-- viewers only through get_shared_album; `owner_id`, which is a user's id;
-- and the measurement columns, which are ours rather than theirs.
revoke select on table public.photos from anon;

grant select (
  id,
  album_id,
  storage_path,
  thumbnail_path,
  width,
  height,
  alt,
  sort_order
) on table public.photos to anon;

-- 2. photo_stories was born world-writable ---------------------------------
--
-- Supabase's default privileges for the public schema grant everything on every
-- new table to anon, authenticated and service_role. `create table` therefore
-- handed anon full select/insert/update/delete on story notes, and handed
-- authenticated more columns than the previous migration named. Row-level
-- security still refused anon, which has no policy — but this project keeps
-- grants and policies as two independent layers, and one of them was open.
--
-- 20260815160718 does exactly this for the tables that existed then. Any table
-- added later needs the same revoke, in the migration that creates it.
revoke all on table public.photo_stories from anon, authenticated;

grant select (id, photo_id, owner_id, body, visibility, created_at, updated_at)
  on table public.photo_stories to authenticated;
grant insert (photo_id, owner_id, body, visibility)
  on table public.photo_stories to authenticated;
grant update (body, visibility) on table public.photo_stories to authenticated;
grant delete on table public.photo_stories to authenticated;
