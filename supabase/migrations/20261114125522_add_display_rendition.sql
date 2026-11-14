-- A mid-size copy of each photograph for the album grid.
--
-- A tile needs roughly 500 device pixels on a phone and 800 on a retina laptop.
-- The 400px thumbnail is too small for either once the tile crops it square, so
-- the browser took the 2000px stored image every time: about 340 KB a tile
-- against roughly a quarter of that for a 1080px copy.
--
-- Nullable because every photograph uploaded before this has none. The album
-- page writes one the first time it opens such a photograph, which is why the
-- owner may update this path column when she may not update the others: unlike
-- storage_path it can be filled in after the row exists. The same owner-prefix
-- check as the other path columns keeps it inside her own namespace.

alter table public.photos add column display_path text;

alter table public.photos
  add constraint photos_display_path_owner_check check (
    display_path is null
    or (
      display_path like owner_id::text || '/%'
      and length(display_path) > length(owner_id::text) + 1
    )
  );

grant select (display_path), insert (display_path), update (display_path)
  on table public.photos to authenticated;
