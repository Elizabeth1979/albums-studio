-- A visitor could not be shown the album the owner arranged.
--
-- `get_shared_album` returned the title and description but not `layout`, so
-- the shared page had nothing to lay out by and rendered one column whatever
-- the owner had chosen. Masonry and grid are an owner's decision about how
-- their photographs should be read, and the person they send the link to is
-- exactly who that decision was for.
--
-- The return type gains a column, which needs a drop: `create or replace`
-- refuses to change one.
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
  sort_order integer
)
language sql
stable
security definer
set search_path to ''
as $function$
  select a.id, a.title, a.description, a.layout,
         p.id, p.storage_path, p.thumbnail_path,
         case when p.caption_visibility = 'visible' then p.caption end,
         p.alt, p.sort_order
  from private.album_share_tokens t
  join public.albums a on a.id = t.album_id
  left join public.photos p on p.album_id = a.id
  where t.token = share_token
    and a.visibility in ('link', 'public')
  order by p.sort_order;
$function$;

revoke all on function public.get_shared_album(uuid) from public;
grant execute on function public.get_shared_album(uuid) to anon, authenticated;
