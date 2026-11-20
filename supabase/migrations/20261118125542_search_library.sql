-- Phase 10, first slice: the owner searches everything she has written.
--
-- One function rather than client queries. Six text fields across three tables
-- would be six round trips from the browser, each needing its own escaping, and
-- the joins that say which album a story note belongs to would be rebuilt in
-- TypeScript. Here it is one call and one place to read.
--
-- `security invoker`, so RLS and the column grants still decide what can be
-- read: the function can see nothing the caller could not select directly. It
-- also filters on `owner_id = auth.uid()` itself, because `albums_select` lets
-- a signed-in user read other people's public albums, and search is a library,
-- not a directory. No `anon` grant: visitors never search, and hidden captions
-- and story notes are exactly what this reads.
--
-- Matching is plain case-insensitive substring, word by word: every word typed
-- must appear in the same piece of text. No text-search configuration, because
-- `english` stems ("swimming" -> "swim") and would mangle Hebrew, while `simple`
-- needs whole words and cannot find "birthday" from "birth". Albums hold a few
-- hundred photographs, so a scan of one owner's rows is cheap; a trigram index
-- is the next step if a library ever outgrows that.
--
-- The parameter is `search_text`, which no column is called. In a SQL function
-- a column beats a parameter of the same name, so a parameter named like a
-- column would turn every filter into a comparison of a column with itself.

create function public.search_library(search_text text)
returns table (
  album_id       uuid,
  album_slug     text,
  album_title    text,
  photo_id       uuid,
  thumbnail_path text,
  field          text,
  matched_text   text
)
language sql
stable
security invoker
set search_path to ''
as $$
  with terms as (
    -- LIKE's own wildcards are escaped so "100%" means the characters typed.
    select array_agg('%' || replace(replace(replace(word, '\', '\\'), '%', '\%'), '_', '\_') || '%')
             as patterns
    from regexp_split_to_table(btrim(coalesce(search_text, '')), '\s+') as word
    where word <> ''
    having count(*) between 1 and 8
       and char_length(btrim(search_text)) between 2 and 200
  ),
  owned_albums as (
    select a.id, a.slug, a.title, a.description, a.story, a.cover_photo_id, a.created_at
    from public.albums a
    where a.owner_id = (select auth.uid())
  ),
  hits as (
    select a.id as album_id, null::uuid as photo_id, f.field, f.body, 0 as rank, null::integer as sort_order
    from owned_albums a
    cross join lateral (values
      ('album_title', a.title),
      ('album_description', a.description),
      ('album_story', a.story)
    ) as f (field, body)
    union all
    select p.album_id, p.id, f.field, f.body, 1, p.sort_order
    from public.photos p
    cross join lateral (values ('caption', p.caption), ('alt', p.alt)) as f (field, body)
    where p.owner_id = (select auth.uid())
    union all
    select p.album_id, p.id, 'story_note', s.body, 1, p.sort_order
    from public.photo_stories s
    join public.photos p on p.id = s.photo_id and p.owner_id = s.owner_id
    where s.owner_id = (select auth.uid())
  )
  select a.id, a.slug, a.title,
         coalesce(h.photo_id, a.cover_photo_id),
         p.thumbnail_path,
         h.field, h.body
  from hits h
  cross join terms t
  join owned_albums a on a.id = h.album_id
  left join public.photos p on p.id = coalesce(h.photo_id, a.cover_photo_id)
  where h.body is not null
    and h.body ilike all (t.patterns)
  order by a.created_at desc, h.rank, h.sort_order nulls first, h.field
  limit 200
$$;

-- Supabase grants execute on every new function to anon by default.
revoke all on function public.search_library(text) from public, anon;
grant execute on function public.search_library(text) to authenticated;
