-- The share token was decorative.
--
-- `get_shared_album(token uuid)` filtered on `where t.token = token`. In a
-- SQL-language function a column reference beats a parameter of the same name,
-- so that compiled to `t.token = t.token` — true for every row. Any uuid opened
-- any album whose visibility was 'link' or 'public'.
--
-- Nothing was exposed: no album has ever left 'private', and there is no
-- sharing interface yet. But this is the function the whole of sharing rests
-- on, and building on it would have shipped a share link that was not a
-- credential at all.
--
-- The parameter is renamed rather than qualified. Qualifying works, but leaves
-- the same trap set for the next person to edit the function; a name that
-- cannot collide removes it. Renaming a parameter needs a drop — `create or
-- replace` refuses to change one.
drop function if exists public.get_shared_album(uuid);

create function public.get_shared_album(share_token uuid)
returns table (
  album_id uuid,
  title text,
  description text,
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
  select a.id, a.title, a.description,
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

drop function if exists public.get_shared_album_stories(uuid);

create function public.get_shared_album_stories(share_token uuid)
returns table (photo_id uuid, body text, created_at timestamptz)
language sql
stable
security definer
set search_path to ''
as $function$
  select s.photo_id, s.body, s.created_at
  from private.album_share_tokens t
  join public.albums a on a.id = t.album_id
  join public.photos p on p.album_id = a.id
  join public.photo_stories s on s.photo_id = p.id
  where t.token = share_token
    and a.visibility in ('link', 'public')
    and s.visibility = 'visible'
  order by p.sort_order, s.created_at;
$function$;

revoke all on function public.get_shared_album_stories(uuid) from public;
grant execute on function public.get_shared_album_stories(uuid) to anon, authenticated;

-- Supabase's default privileges grant execute on every new function to anon as
-- well, so `revoke ... from public` left these callable by a signed-out
-- visitor. They returned nothing, because auth.uid() is null and the owner
-- check fails — but a function that hands out a credential should not be
-- reachable by someone who can never hold one.
revoke all on function public.album_share_token(uuid) from anon;
revoke all on function public.rotate_album_share_token(uuid) from anon;
