-- What the client actually does, run against the real schema as the real roles.
--
-- Every automated test in this repository fakes the database: the unit suite
-- mocks the Supabase client and the end-to-end suite intercepts the network in
-- the browser. Both therefore pass against a schema that would refuse the write.
-- Four production faults have reached or nearly reached the deployed app that
-- way — a column with no grant, a select policy that could not see the row its
-- own statement was creating, a caption readable by signed-out visitors, and a
-- revoke that silently did nothing. This file is the check none of the suites
-- can be.
--
-- Run it against the hosted project (or a Supabase branch) after any migration:
--
--   psql "$DATABASE_URL" -f supabase/checks/client_paths.sql
--
-- Nothing persists. It creates its own throwaway owners rather than touching
-- real data, and the whole thing runs inside a transaction that is deliberately
-- aborted at the end — the summary arrives as the abort message, which is the
-- only way to both report and leave nothing behind. A non-zero failure count in
-- that summary is the result to act on; the "ERROR" line above it is expected.
--
-- Keep it matched to the client. Every column listed below is one that
-- src/lib/albums.ts, src/lib/photos.ts or src/lib/stories.ts sends, and a
-- column added there needs adding here in the same change.

do $$
declare
  alice uuid := gen_random_uuid();
  bob uuid := gen_random_uuid();
  log text := '';
  fails int := 0;
  album_a uuid;
  album_b uuid;
  photo_a uuid;
  story_a uuid;
  token uuid;
  old_token uuid;
  new_token uuid;
  seen text;
  seen_id uuid;
  seen_count int;
begin
  ---------------------------------------------------------------------------
  -- Setup, as a privileged role.
  ---------------------------------------------------------------------------
  insert into auth.users (id, email, aud, role)
  values (alice, 'alice@probe.invalid', 'authenticated', 'authenticated'),
         (bob, 'bob@probe.invalid', 'authenticated', 'authenticated');

  ---------------------------------------------------------------------------
  -- The owner's own path: everything the app does on her behalf.
  ---------------------------------------------------------------------------
  log := log || E'\n\nowner writing her own album';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', alice, 'role', 'authenticated')::text, true);

  -- RETURNING is filtered by the SELECT policy, and PostgREST makes every
  -- insert an INSERT ... RETURNING. A policy that looks the row up through a
  -- STABLE function cannot see the row this statement is creating, which is
  -- exactly how album creation broke once with every test green.
  begin
    insert into public.albums (owner_id, title, slug, layout, description)
    values (alice, 'Probe', 'probe', 'grid', 'written by the probe')
    returning id into album_a;
    log := log || E'\n  ok    insert album, and read it back in the same statement';
  exception when others then
    log := log || E'\n  FAIL  insert album -> ' || sqlerrm; fails := fails + 1;
  end;

  begin
    insert into public.photos (
      album_id, owner_id, storage_path, thumbnail_path, mime,
      width, height, phash, sharpness, sort_order
    ) values (
      album_a, alice, alice || '/a/one.jpg', alice || '/a/one-thumb.jpg', 'image/jpeg',
      2000, 1500, repeat('1', 64)::bit(64), 143.5, 0
    ) returning id into photo_a;
    log := log || E'\n  ok    insert photo with every column storePhoto sends';
  exception when others then
    log := log || E'\n  FAIL  insert photo -> ' || sqlerrm; fails := fails + 1;
  end;

  begin
    update public.photos
    set caption = 'a caption', caption_visibility = 'visible',
        alt = 'alt text', alt_source = 'human', sort_order = 1
    where id = photo_a;
    log := log || E'\n  ok    update photo text and order';
  exception when others then
    log := log || E'\n  FAIL  update photo text -> ' || sqlerrm; fails := fails + 1;
  end;

  begin
    update public.albums
    set title = 'Renamed', layout = 'masonry', description = 'edited',
        cover_photo_id = photo_a
    where id = album_a;
    log := log || E'\n  ok    update album, including its cover';
  exception when others then
    log := log || E'\n  FAIL  update album -> ' || sqlerrm; fails := fails + 1;
  end;

  begin
    insert into public.photo_stories (photo_id, owner_id, body, visibility)
    values (photo_a, alice, 'The long version.', 'hidden')
    returning id into story_a;

    update public.photo_stories
    set body = 'Edited.', visibility = 'visible'
    where id = story_a;

    log := log || E'\n  ok    insert and update a story note';
  exception when others then
    log := log || E'\n  FAIL  story note write -> ' || sqlerrm; fails := fails + 1;
  end;

  ---------------------------------------------------------------------------
  -- Another signed-in account. Row-level security is the only thing standing
  -- between two owners, so it is worth asking rather than assuming.
  ---------------------------------------------------------------------------
  log := log || E'\n\nanother owner, who should see and touch none of it';

  perform set_config('request.jwt.claims',
    json_build_object('sub', bob, 'role', 'authenticated')::text, true);

  seen_id := null;
  select id into seen_id from public.albums where id = album_a;
  if seen_id is null then
    log := log || E'\n  ok    cannot see her album';
  else
    log := log || E'\n  FAIL  can see her album'; fails := fails + 1;
  end if;

  seen_id := null;
  select id into seen_id from public.photos where id = photo_a;
  if seen_id is null then
    log := log || E'\n  ok    cannot see her photo';
  else
    log := log || E'\n  FAIL  can see her photo'; fails := fails + 1;
  end if;

  seen_id := null;
  select id into seen_id from public.photo_stories where id = story_a;
  if seen_id is null then
    log := log || E'\n  ok    cannot see her story note';
  else
    log := log || E'\n  FAIL  can see her story note'; fails := fails + 1;
  end if;

  begin
    insert into public.photos (
      album_id, owner_id, storage_path, thumbnail_path, mime,
      width, height, phash, sharpness, sort_order
    ) values (
      album_a, bob, bob || '/a/x.jpg', bob || '/a/x-thumb.jpg', 'image/jpeg',
      100, 100, repeat('0', 64)::bit(64), 1.0, 0
    );
    log := log || E'\n  FAIL  could add a photo to her album'; fails := fails + 1;
  exception when others then
    log := log || E'\n  ok    cannot add a photo to her album';
  end;

  begin
    insert into public.albums (owner_id, title, slug, layout)
    values (bob, 'Bob', 'bob', 'grid') returning id into album_b;

    -- The composite foreign key over (cover_photo_id, id, owner_id) is what
    -- makes this impossible; a plain reference to photos(id) would allow it.
    update public.albums set cover_photo_id = photo_a where id = album_b;
    log := log || E'\n  FAIL  could use her photo as his cover'; fails := fails + 1;
  exception when others then
    log := log || E'\n  ok    cannot use her photo as his cover';
  end;

  begin
    insert into public.photo_stories (photo_id, owner_id, body, visibility)
    values (photo_a, bob, 'Not his to write.', 'hidden');
    log := log || E'\n  FAIL  could attach a story to her photo'; fails := fails + 1;
  exception when others then
    log := log || E'\n  ok    cannot attach a story to her photo';
  end;

  ---------------------------------------------------------------------------
  -- A signed-out visitor. Hidden text has to be hidden here, not in the page.
  ---------------------------------------------------------------------------
  log := log || E'\n\nsigned-out visitor';

  reset role;
  select t.token into token from private.album_share_tokens t where t.album_id = album_a;
  update public.albums set visibility = 'link' where id = album_a;
  update public.photos set caption_visibility = 'hidden' where id = photo_a;

  set local role anon;
  perform set_config('request.jwt.claims', null, true);

  begin
    select caption into seen from public.photos where id = photo_a;
    log := log || E'\n  FAIL  can read captions through the Data API'; fails := fails + 1;
  exception when insufficient_privilege then
    log := log || E'\n  ok    cannot read captions through the Data API';
  end;

  begin
    select body into seen from public.photo_stories where id = story_a;
    log := log || E'\n  FAIL  can read story notes through the Data API'; fails := fails + 1;
  exception when insufficient_privilege then
    log := log || E'\n  ok    cannot read story notes through the Data API';
  end;

  begin
    select alt into seen from public.photos where id = photo_a;
    log := log || E'\n  ok    can still read alt text, which exists to be read';
  exception when insufficient_privilege then
    log := log || E'\n  FAIL  cannot read alt text'; fails := fails + 1;
  end;

  select caption into seen from public.get_shared_album(token) where photo_id = photo_a;
  if seen is null then
    log := log || E'\n  ok    a hidden caption is withheld from a share link';
  else
    log := log || E'\n  FAIL  a hidden caption reached a share link'; fails := fails + 1;
  end if;

  reset role;
  update public.photos set caption_visibility = 'visible' where id = photo_a;
  set local role anon;

  select caption into seen from public.get_shared_album(token) where photo_id = photo_a;
  if seen = 'a caption' then
    log := log || E'\n  ok    a published caption does reach a share link';
  else
    log := log || E'\n  FAIL  a published caption did not reach a share link'; fails := fails + 1;
  end if;

  -- The album a visitor is shown should be arranged the way its owner arranged
  -- it. This column was missing from the function's result for a while, and the
  -- shared page silently fell back to one column.
  select layout into seen from public.get_shared_album(token) where photo_id = photo_a;
  if seen = 'masonry' then
    log := log || E'\n  ok    the layout the owner chose reaches a share link';
  else
    log := log || format(E'\n  FAIL  layout reached a share link as %L', seen); fails := fails + 1;
  end if;

  ---------------------------------------------------------------------------
  -- Share links. The token is the only credential a visitor has, so the thing
  -- worth checking is that it is actually checked.
  ---------------------------------------------------------------------------
  log := log || E'\n\nshare links';

  begin
    select count(*) into seen_count from public.get_shared_album(gen_random_uuid());
    if seen_count = 0 then
      log := log || E'\n  ok    a random uuid opens nothing';
    else
      -- This was true for months: a column reference beat the parameter of the
      -- same name, so the filter compiled to `t.token = t.token`.
      log := log || E'\n  FAIL  a random uuid opened a shared album'; fails := fails + 1;
    end if;
  exception when others then
    log := log || E'\n  FAIL  get_shared_album -> ' || sqlerrm; fails := fails + 1;
  end;

  select count(*) into seen_count from public.get_shared_album_stories(gen_random_uuid());
  if seen_count = 0 then
    log := log || E'\n  ok    a random uuid reads no story notes';
  else
    log := log || E'\n  FAIL  a random uuid read story notes'; fails := fails + 1;
  end if;

  begin
    perform public.album_share_token(album_a);
    log := log || E'\n  FAIL  a visitor could ask for a share token'; fails := fails + 1;
  exception when insufficient_privilege then
    log := log || E'\n  ok    a visitor cannot ask for a share token';
  end;

  ---------------------------------------------------------------------------
  -- Rotation is the revoke button. A link that outlives being replaced is the
  -- whole feature failing quietly: the owner is told the old one is dead.
  ---------------------------------------------------------------------------
  log := log || E'\n\nrotation, and the ways a link should die';

  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', alice, 'role', 'authenticated')::text, true);

  old_token := public.album_share_token(album_a);

  if public.album_share_token(album_a) = old_token then
    log := log || E'\n  ok    asking twice returns the same token, not a new one';
  else
    log := log || E'\n  FAIL  asking twice minted a different token'; fails := fails + 1;
  end if;

  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', bob, 'role', 'authenticated')::text, true);
    if public.rotate_album_share_token(album_a) is null then
      log := log || E'\n  ok    another owner cannot rotate her token';
    else
      log := log || E'\n  FAIL  another owner rotated her token'; fails := fails + 1;
    end if;
  exception when others then
    log := log || E'\n  ok    another owner cannot rotate her token';
  end;

  perform set_config('request.jwt.claims',
    json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  new_token := public.rotate_album_share_token(album_a);

  if new_token is distinct from old_token then
    log := log || E'\n  ok    rotating mints a different token';
  else
    log := log || E'\n  FAIL  rotating returned the same token'; fails := fails + 1;
  end if;

  set local role anon;
  perform set_config('request.jwt.claims', null, true);

  select count(*) into seen_count from public.get_shared_album(old_token);
  if seen_count = 0 then
    log := log || E'\n  ok    the replaced link opens nothing';
  else
    log := log || E'\n  FAIL  the replaced link still opens the album'; fails := fails + 1;
  end if;

  select count(*) into seen_count from public.get_shared_album_stories(old_token);
  if seen_count = 0 then
    log := log || E'\n  ok    the replaced link reads no story notes either';
  else
    log := log || E'\n  FAIL  the replaced link still reads story notes'; fails := fails + 1;
  end if;

  select count(*) into seen_count from public.get_shared_album(new_token);
  if seen_count = 1 then
    log := log || E'\n  ok    the new link works';
  else
    log := log || E'\n  FAIL  the new link does not work'; fails := fails + 1;
  end if;

  -- Turning sharing off has to revoke as thoroughly as rotating does, or the
  -- switch labelled "nobody else can open it" is decoration.
  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  update public.albums set visibility = 'private' where id = album_a;

  set local role anon;
  perform set_config('request.jwt.claims', null, true);

  select count(*) into seen_count from public.get_shared_album(new_token);
  if seen_count = 0 then
    log := log || E'\n  ok    a live token opens nothing once the album is private again';
  else
    log := log || E'\n  FAIL  a private album still opened with a live token'; fails := fails + 1;
  end if;

  select count(*) into seen_count from public.get_shared_album_stories(new_token);
  if seen_count = 0 then
    log := log || E'\n  ok    and reads no story notes either';
  else
    log := log || E'\n  FAIL  a private album still gave up story notes'; fails := fails + 1;
  end if;

  ---------------------------------------------------------------------------
  -- Deletes, which are the owner's alone.
  ---------------------------------------------------------------------------
  log := log || E'\n\nowner removing her own things';

  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', alice, 'role', 'authenticated')::text, true);

  begin
    delete from public.photo_stories where id = story_a;
    delete from public.albums where id = album_a;
    log := log || E'\n  ok    delete a story note and an album';
  exception when others then
    log := log || E'\n  FAIL  delete -> ' || sqlerrm; fails := fails + 1;
  end;

  reset role;

  raise exception E'client paths: % failed\n%\n\n(the transaction is rolled back on purpose; nothing above was kept)',
    fails, log;
end $$;
