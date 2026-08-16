-- 20260816173548 added albums.layout but not the column privileges that make it
-- writable. Client writes are granted per column, so inserting or updating an
-- album with a layout was refused with "permission denied for column layout"
-- while every test passed: the unit suite mocks the client and the end-to-end
-- suite intercepts the network, so neither reaches a real grant.
--
-- Any future column the client writes needs its grant in the same migration
-- that adds the column.
grant insert (layout) on table public.albums to authenticated;
grant update (layout) on table public.albums to authenticated;
