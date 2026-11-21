-- Which photographs an album's slideshow plays.
--
-- On by default, so every album that already exists plays exactly what it did
-- before, and a new upload joins the slideshow without anyone asking. The owner
-- leaves photographs out; she never has to opt each one in.
--
-- A flag on the photograph rather than a list on the album: it lives and dies
-- with the row, so a removed photograph cannot linger in a list, and moving a
-- photograph earlier or later needs nothing kept in step.
alter table public.photos
  add column in_slideshow boolean not null default true;

-- Insert is not granted: an upload never sets it, the default does. The table's
-- select grant already covers reading it.
grant update (in_slideshow) on table public.photos to authenticated;

-- A visitor's slideshow plays the owner's choice -------------------------------
--
-- Rebuilt from album_story_drafts, the latest applied definition, with
-- `in_slideshow` added at the end. `display_path` is added beside it: another
-- change (share_the_display_copy) adds the same column to this function, and
-- whichever of the two is applied second has to keep both, so this one carries
-- it already. The photo stays in the result when it is left out of the
-- slideshow: it is still in the album a visitor sees.
--
-- The return type changes, which needs a drop; both run in this transaction.
drop function if exists public.get_shared_album(uuid);

create function public.get_shared_album(share_token uuid)
returns table (
  album_id uuid,
  title text,
  description text,
  layout text,
  story text,
  photo_id uuid,
  storage_path text,
  thumbnail_path text,
  caption text,
  alt text,
  sort_order integer,
  display_path text,
  in_slideshow boolean
)
language sql
stable
security definer
set search_path to ''
as $function$
  select a.id, a.title, a.description, a.layout, a.story,
         p.id, p.storage_path, p.thumbnail_path,
         case when p.caption_visibility = 'visible' then p.caption end,
         p.alt, p.sort_order, p.display_path, p.in_slideshow
  from private.album_share_tokens t
  join public.albums a on a.id = t.album_id
  left join public.photos p on p.album_id = a.id
  where t.token = share_token
    and a.visibility in ('link', 'public')
  order by p.sort_order;
$function$;

revoke all on function public.get_shared_album(uuid) from public, anon;
grant execute on function public.get_shared_album(uuid) to anon, authenticated;
