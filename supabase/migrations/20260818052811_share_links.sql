-- Sharing, from the database's side.
--
-- Everything a visitor is allowed to see is decided here rather than in the
-- page or the Edge Function that serves them. A share link is a bearer
-- credential: whoever holds it is the visitor, so the decision has to live
-- somewhere the caller cannot influence, and there is only one such place.
--
-- Story notes join captions in that arrangement. `get_shared_album` already
-- returns a caption only when the owner marked it visible; this does the same
-- for stories, and returns nothing at all for an album whose visibility has
-- been set back to private.
create or replace function public.get_shared_album_stories(token uuid)
returns table (
  photo_id uuid,
  body text,
  created_at timestamptz
)
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
  where t.token = token
    and a.visibility in ('link', 'public')
    and s.visibility = 'visible'
  order by p.sort_order, s.created_at;
$function$;

revoke all on function public.get_shared_album_stories(uuid) from public;
grant execute on function public.get_shared_album_stories(uuid) to anon, authenticated;

-- The owner's own view of the token.
--
-- The table stays out of the Data API: a share token is a credential, and an
-- ordinary album query must never carry one. This hands it to the one person
-- entitled to it, checked against the album's owner rather than against
-- anything the caller supplied.
create or replace function public.album_share_token(album uuid)
returns uuid
language sql
stable
security definer
set search_path to ''
as $function$
  select t.token
  from private.album_share_tokens t
  join public.albums a on a.id = t.album_id
  where t.album_id = album
    and a.owner_id = (select auth.uid());
$function$;

revoke all on function public.album_share_token(uuid) from public;
grant execute on function public.album_share_token(uuid) to authenticated;

-- Rotating is how a link is taken back.
--
-- There is no "unshare this one link": the token is the link, so replacing it
-- retires every copy that was ever handed out at once. That is the honest
-- model, and the interface says so in those words.
create or replace function public.rotate_album_share_token(album uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path to ''
as $function$
declare
  fresh uuid;
begin
  update private.album_share_tokens t
  set token = gen_random_uuid(), created_at = now()
  from public.albums a
  where a.id = t.album_id
    and t.album_id = album
    and a.owner_id = (select auth.uid())
  returning t.token into fresh;

  if fresh is null then
    raise exception 'no album to rotate' using errcode = 'insufficient_privilege';
  end if;

  return fresh;
end;
$function$;

revoke all on function public.rotate_album_share_token(uuid) from public;
grant execute on function public.rotate_album_share_token(uuid) to authenticated;
