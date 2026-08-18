-- Stored bytes that no photo row references.
--
-- Storage holds no foreign keys to the database, so nothing makes these two
-- agree by itself. Deleting an album removes its objects from the browser, and
-- that is a best-effort step: a tab closed mid-delete, or a request that fails
-- after the rows are already gone, leaves bytes behind that no owner can see
-- and no query will ever join to.
--
-- Read-only. Run it whenever storage looks larger than the library:
--
--   psql "$DATABASE_URL" -f supabase/checks/orphaned_objects.sql
--
-- Anything listed is safe to delete, because by definition no photo points at
-- it. Check the ages first — an object seconds old may belong to an upload
-- still in flight, whose row has not been written yet.
select
  o.name,
  pg_size_pretty((o.metadata ->> 'size')::bigint) as size,
  o.created_at,
  now() - o.created_at as age
from storage.objects o
where o.bucket_id = 'photos'
  and not exists (
    select 1
    from public.photos p
    where p.storage_path = o.name
       or p.thumbnail_path = o.name
  )
order by o.created_at;

-- The summary, for a quick answer to "is anything leaking?"
select
  count(*) filter (where referenced) as referenced_objects,
  count(*) filter (where not referenced) as orphaned_objects,
  pg_size_pretty(
    coalesce(sum((metadata ->> 'size')::bigint) filter (where not referenced), 0)
  ) as wasted
from (
  select
    o.metadata,
    exists (
      select 1
      from public.photos p
      where p.storage_path = o.name
         or p.thumbnail_path = o.name
    ) as referenced
  from storage.objects o
  where o.bucket_id = 'photos'
) as objects;
