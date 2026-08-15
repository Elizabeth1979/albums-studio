-- The unique (owner_id, slug) index already supports owner_id lookups and
-- the albums.owner_id foreign key, so a second owner-only index is redundant.
drop index public.albums_owner_idx;
