-- albums.cover_photo_id has existed since the initial schema but nothing ever
-- wrote it, so every album card in the library looked the same whether the album
-- held forty photographs or none. The client now sets a cover when the first
-- photo lands in an album that has none; this gives the albums that were filled
-- before that code shipped the same treatment.
--
-- Empty albums keep a null cover: the subquery returns no row and the column is
-- set to null, which is what it already held.
--
-- No grant is needed. cover_photo_id was already in the authenticated update
-- grant from the initial schema, confirmed against
-- information_schema.column_privileges before the client was taught to write it.
update public.albums as album
set cover_photo_id = (
  select photo.id
  from public.photos as photo
  where photo.album_id = album.id
  order by photo.sort_order, photo.created_at, photo.id
  limit 1
)
where album.cover_photo_id is null;
