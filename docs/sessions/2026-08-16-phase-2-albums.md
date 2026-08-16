# Session: password recovery, test coverage, and Phase 2 albums

**Date:** 2026-08-16
**Keywords:** password reveal, password reset, recovery session, Playwright, CI,
album shells, layout, masonry, grid, slug, RLS.

## What changed

### Authentication recovery

A sign-in failure against production turned out to be an ordinary wrong password: the
account existed and was confirmed, and the only sign-in on record was the automatic one
from signup. The app had no way to see or reset a password, so magic links were the only
route back in.

Password inputs now carry a reveal toggle, and a full reset flow exists. Following a
recovery link puts the app in a recovery state that must reach the set-a-new-password step
before the library opens.

**The durable trap:** a recovery link produces a *real* session. The identity lookup that
starts at page load can resolve after the recovery event and report a signed-in user,
sending the owner straight to the library with the password still unchanged. A ref guards
against it, and a test holds the lookup unresolved to reproduce the ordering.

The reset confirmation reads "If that address has an account…" on purpose.
`resetPasswordForEmail` succeeds for unknown addresses by design, so a definite
confirmation would turn the form into an account-existence oracle.

### Test coverage and CI

`App` held the untested logic and now has its own suite against a mocked Supabase client.
A Playwright suite drives the real client in Chromium with every Supabase request
intercepted in the browser, so it needs no credentials and no network.

The repository had no CI at all. `.github/workflows/ci.yml` now runs typecheck, unit tests,
build, and the end-to-end suite on every push and pull request.

End-to-end runs build and serve the production bundle rather than starting the dev server.
The first CI attempt failed as a bare `Timed out waiting 60000ms from config.webServer`
with no output, because Playwright discards `webServer` stdout by default. The cause was
never reproduced locally; the fragile path was removed instead, and stdout/stderr are now
piped so a repeat failure explains itself.

### Phase 2 — albums and layouts

`albums.layout` ships as `text not null default 'masonry'`, checked against `masonry` and
`grid`. The constraint lists only the layouts this phase renders; later layouts widen it in
the migration for the phase that draws them, so the database never advertises a layout the
app cannot display. `albums_title_not_blank` and `albums_slug_not_blank` were added at the
same time.

The library lists albums and creates them; an album page renames, switches layout, and
deletes behind an explicit confirmation. Placeholder tiles render the album in its chosen
layout, because an empty shell would otherwise look identical either way until uploads
arrive in Phase 3.

## Decisions worth keeping

- **Renaming an album leaves its slug alone.** The slug is the stable half of a future
  share URL, so renaming must not silently break links already handed out.
- **Slugs keep letters from any script.** A strict ASCII filter empties the slug for a
  title written in Hebrew or Japanese; the fallback is `album` only when a title carries no
  letters or numbers at all.
- **Slug collisions are resolved by asking the database.** `(owner_id, slug)` is unique, so
  the insert retries with a numbered suffix. A read-then-write check would still race.
- **The reset screen takes one password field, not a confirm pair.** The reveal toggle
  already lets the value be checked, which is what a confirm field was ever a proxy for.
- **Deleting an album is a two-step confirmation in the page**, not a browser dialog, so it
  is testable and matches the repository invariant about destructive actions.

## Verification

- Migration `20260816173548_add_album_layout` applied to `vsxbedlsnfmsbnlfayae`, recorded in
  the hosted history, and the three constraints confirmed present. Security and performance
  advisors report nothing new.
- 65 unit and component tests, 21 end-to-end tests, typecheck, and production build all pass.
- Sign-in and password reset confirmed by hand against production.

## Magic link: root cause found

The auth logs settle what "untested" meant. The magic link was not skipped; it was refused:

```
13:24:03  POST /recover  200   mail.send  mail_type=recovery -> el.patrick79@gmail.com
13:24:08  POST /otp      429   over_email_send_rate_limit
                               "you can only request this after 53 seconds"
```

The request came five seconds after a reset email, and Supabase's per-address email
throttle rejected it. The application code was never at fault, and mail delivery itself
demonstrably works — the recovery mail sent and was followed to a completed password
change at 13:24:20.

Two consequences:

- `describeAuthError` now translates `over_email_send_rate_limit` (and any 429) into a
  sentence that names the cause and repeats the wait, instead of echoing Supabase's
  "For security purposes, you can only request this after 53 seconds."
- The project uses Supabase's **built-in sender** (`noreply@mail.app.supabase.io`), which
  the documentation calls "for demonstration purposes only" and "not meant for production
  use". Its binding restriction is not the throttle but the recipient allowlist: without
  custom SMTP, Auth refuses to deliver to any address outside the organization's team. The
  owner's mail arrives for that reason alone; a stranger's reset or magic link would never
  be sent, while the app still showed "check your email". Now open question 12b.

## Pre-Phase-3 review

A plan-versus-reality pass before starting uploads found four things.

**`docs/project-structure.md` was stale.** It claimed to reflect the live schema while
omitting `albums.layout`, and still marked album editing as planned. Its own footer asks for
an update whenever a planned component becomes real; nothing had updated it. Refreshed, with
a routing table added.

**Two contrast failures**, `#81786d` at 4.27:1 against 4.5:1 required, on album card metadata
and form hints. Accessibility is a stated product requirement, so this was a defect rather
than a preference.

**`albums.description` was fetched on every query and never rendered.** Phase 2's gate says
create/*edit*/delete, and description is part of an album shell. Now editable on the album
page; a cleared description is stored as `null` rather than an empty string, so "no
description" is one state rather than two that look identical.

**Phase 1's `profiles` row was never actually verified.** It exists, with `display_name`
carried from signup metadata. Noted because the checkpoint had been treated as met without
anyone checking.

### Routing, decided ahead of uploads

Albums now live at `/albums/:slug`. This was scheduled for Phase 6 sharing, but Phase 3
uploads run long enough that losing the album on a reload is a real cost, and retrofitting
routing under an upload queue is worse than adding it first.

History-API routing, deliberately not hash routing: Supabase delivers recovery and
magic-link tokens in the URL hash, and a hash router would consume them. `vercel.json` now
rewrites every path to `index.html`, without which a reload on `/albums/anything` would 404
in production.

The slug's stability pays off here — a rename leaves the address working, and there is a
test that renames and reloads to prove it.

### Accessibility is now enforced

axe-core runs inside the Playwright suite over ten screens at WCAG 2.0/2.1 A and AA. It
found five contrast violations on its first run, none of which were the two found by hand:
inactive auth tabs at 4.10:1, the trust-row numerals at 4.02:1, and trust-row body copy at
4.16:1. Manual checking had missed all three, which is the argument for the tool.

## Phase 2 shipped broken, and why nothing caught it

`albums.layout` was added by `20260816173548` without the column privileges that make it
writable. Client writes on this project are granted per column, so both

```
insert into albums (..., layout)   -- permission denied for column layout
update albums set layout = ...     -- permission denied for column layout
```

were refused in production from the moment Phase 2 merged. Album creation did not work.

**Every test passed anyway.** The unit suite mocks `supabase.from`; the end-to-end suite
intercepts Supabase over the network and answers from an in-memory table. Neither reaches a
real grant, so the whole suite is green against a schema that refuses the write. The bug was
found by reading the grant list in `20260815162714` while planning Phase 3, not by any check.

`AGENTS.md` already required verifying grants after a schema change. That step was skipped in
favour of running the advisors, which do not check column privileges. The rule is now
sharpened to say grants belong in the same migration as the column, and the shape of the
blind spot is written down next to it.

Fixed by `20260816185714_grant_album_layout_column`. All seventeen columns the client writes
across `albums` and `photos` were then checked against
`information_schema.column_privileges`; every one is now granted.

## The second reason album creation failed

Fixing the missing `layout` grant exposed the real one. Creating an album then failed with
`new row violates row-level security policy for table "albums"`, and the INSERT check was
not at fault:

```sql
insert into albums (...) values (...);                   -- succeeds
insert into albums (...) values (...) returning id, ...; -- refused
```

PostgREST asks for the created row back, so every insert is an `INSERT ... RETURNING`, and
`RETURNING` is filtered by the **SELECT** policy rather than the insert check.

`albums_select` delegated to `private.can_view_album_id(id)`, which is `STABLE` and
re-queries `public.albums`. A `STABLE` function reads the snapshot from the start of the
statement, so the row being inserted by that very statement is invisible to it. The policy
concluded the owner could not see their own new row, and Postgres rejected the insert.

The helper exists to avoid recursion when a policy on `albums` needs to consult `albums`.
That reasoning holds for the public and link-shared cases, which look up rows that already
exist. It never applied to the owner case, which only needs the row's own `owner_id`:

```sql
using (owner_id = (select auth.uid()) or private.can_view_album_id(id))
```

No lookup, so nothing depends on the row being visible yet. `photos_select` got the same
treatment for symmetry; it was not affected, because a photo's album always exists first.

**Two bugs, one symptom, neither catchable by the suite.** The missing grant and the
snapshot-blind policy both live entirely in the database, and every test replaces the
database with a stub that accepts whatever it is sent. Verified afterwards by running the
real statements — insert, update, and a Phase 3 photo insert — under
`set local role authenticated` with the owner's JWT claims.

## Still open

- **Magic-link delivery has still never succeeded end to end.** The single real attempt was
  rate-limited. Retrying more than a minute after any other auth email should work.
- **Leaked-password protection is disabled** on the Supabase project. The security advisor
  flags it; enabling it checks new passwords against HaveIBeenPwned. It is a dashboard
  setting with no migration and no MCP tool behind it, so it cannot be changed from a
  session — Authentication → Sign In / Providers → Password, in the project dashboard.
- **Album navigation has no URL.** Opening an album is component state, so an album cannot
  be linked or reloaded into. Phase 6 sharing will force this decision.
