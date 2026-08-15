drop index public.albums_cover_photo_idx;

create index albums_cover_photo_owner_idx
  on public.albums (cover_photo_id, id, owner_id)
  where cover_photo_id is not null;

create index photos_album_owner_idx
  on public.photos (album_id, owner_id);
