-- Phase 2 gives each album a presentation choice. Masonry is the default for
-- most albums; grid stays predictable for large batches.
--
-- The check constraint deliberately lists only the two layouts this phase
-- ships. 'story', 'slideshow', 'map', and 'blog' arrive with the phases that
-- implement them, each widening this constraint in its own forward-only
-- migration, so the database never claims to support a layout the app cannot
-- render.
alter table public.albums
  add column layout text not null default 'masonry'
    check (layout in ('masonry', 'grid'));

-- An album shell is created from nothing but a title, so a blank one is a bug
-- rather than a state worth storing. The slug is derived from the title and
-- carries the same requirement.
alter table public.albums
  add constraint albums_title_not_blank check (length(btrim(title)) > 0),
  add constraint albums_slug_not_blank check (length(btrim(slug)) > 0);
