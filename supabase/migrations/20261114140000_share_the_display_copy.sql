-- A visitor's album drew every tile from the 2000px stored image.
--
-- The owner's grid draws from the 1080px display copy (see
-- add_display_rendition), but `get_shared_album` never returned its path, so
-- the `shared-album` Edge Function had nothing to sign and a visitor on a phone
-- downloaded about 340 KB a tile instead of roughly a quarter of that.
--
-- Same body, same grants; one column added at the end. The path is no more
-- sensitive than `storage_path` beside it: the bucket is private and a path
-- alone signs nothing.
--
-- The return type gains a column, which needs a drop: `create or replace`
-- refuses to change one. Both run in this migration's transaction, so there is
-- no moment without the function.
drop function if exists public.get_shared_album(uuid);

create function public.get_shared_album(share_token uuid)
returns table (
  album_id uuid,
  title text,
  description text,
  layout text,
  photo_id uuid,
  storage_path text,
  thumbnail_path text,
  caption text,
  alt text,
  sort_order integer,
  display_path text
)
language sql
stable
security definer
set search_path to ''
as $function$
  select a.id, a.title, a.description, a.layout,
         p.id, p.storage_path, p.thumbnail_path,
         case when p.caption_visibility = 'visible' then p.caption end,
         p.alt, p.sort_order, p.display_path
  from private.album_share_tokens t
  join public.albums a on a.id = t.album_id
  left join public.photos p on p.album_id = a.id
  where t.token = share_token
    and a.visibility in ('link', 'public')
  order by p.sort_order;
$function$;

revoke all on function public.get_shared_album(uuid) from public;
grant execute on function public.get_shared_album(uuid) to anon, authenticated;
