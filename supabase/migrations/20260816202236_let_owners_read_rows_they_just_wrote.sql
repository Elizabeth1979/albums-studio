-- albums_select delegated every case to private.can_view_album_id(id), which is
-- STABLE and re-queries public.albums. A STABLE function reads the snapshot from
-- the start of the statement, so a row being inserted by that same statement is
-- invisible to it.
--
-- PostgREST asks for the created row back, which makes every insert an
-- INSERT ... RETURNING, and RETURNING is filtered by the SELECT policy. The
-- owner's own insert was therefore refused with "new row violates row-level
-- security policy" even though the INSERT check itself passed. Creating an album
-- could never succeed.
--
-- Testing ownership against the row's own column fixes it: no table lookup, so
-- nothing depends on the row already being visible. The helper still covers the
-- public and link-shared cases, which is what it was introduced for -- those do
-- need a lookup, and only apply to rows that already exist.
drop policy albums_select on public.albums;

create policy albums_select on public.albums
  for select to anon, authenticated
  using (
    owner_id = (select auth.uid())
    or private.can_view_album_id(id)
  );

-- photos reads through the album, which always exists before its photos, so the
-- same trap does not apply there. Ownership is still checked directly first so
-- an owner's insert never depends on snapshot timing.
drop policy photos_select on public.photos;

create policy photos_select on public.photos
  for select to anon, authenticated
  using (
    owner_id = (select auth.uid())
    or private.can_view_album_id(album_id)
  );
