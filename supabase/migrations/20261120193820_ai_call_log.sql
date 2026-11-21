-- A log of every paid AI call: what it was for, what it was shown, and what it cost.
--
-- `ai_usage` counts uses per month against an allowance; it cannot say what a
-- use cost. `ai_drafts` keeps a draft's tokens, but only for calls that produced
-- a draft, and with cached and uncached input added together, though they are
-- priced twenty times apart. Pricing a feature needs every call that was paid
-- for — a declined or failed one included — priced the day it ran.
--
-- One row per call, written only by the Edge Function that made it, with the
-- service role. The owner may read their own rows; nothing else.
create table public.ai_calls (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references auth.users (id) on delete cascade,
  -- The product feature, as it would be sold: one value per thing a person asks for,
  -- named as the function's `ai_usage` operation is.
  feature            text not null check (feature in ('album_story', 'album_questions', 'alt')),
  -- Kept when the album goes: the call was paid for either way.
  album_id           uuid,
  -- The draft it produced, when it produced one.
  draft_id           uuid,
  -- 'ok' returned something usable, 'declined' was refused by the model,
  -- 'failed' was an error or an empty answer.
  outcome            text not null check (outcome in ('ok', 'declined', 'failed')),
  -- The model asked for, and the one that answered (they differ after a fallback).
  model              text not null,
  served_model       text,
  -- How many things it was given to work on: photographs, for a story.
  items              integer not null default 0 check (items >= 0),
  input_tokens       integer not null default 0 check (input_tokens >= 0),
  cache_write_tokens integer not null default 0 check (cache_write_tokens >= 0),
  cache_read_tokens  integer not null default 0 check (cache_read_tokens >= 0),
  output_tokens      integer not null default 0 check (output_tokens >= 0),
  -- US dollars at the prices in force when it ran; null when the model's price
  -- was not known, which the panel says rather than counting it as free.
  cost_usd           numeric(12, 6) check (cost_usd is null or cost_usd >= 0),
  price_list         text not null,
  duration_ms        integer check (duration_ms is null or duration_ms >= 0),
  created_at         timestamptz not null default now(),
  constraint ai_calls_album_owner_fkey
    foreign key (album_id, owner_id) references public.albums (id, owner_id)
    on delete set null (album_id),
  constraint ai_calls_draft_owner_fkey
    foreign key (draft_id, owner_id) references public.ai_drafts (id, owner_id)
    on delete set null (draft_id)
);

create index ai_calls_owner_created_idx on public.ai_calls (owner_id, created_at desc);
create index ai_calls_album_owner_idx on public.ai_calls (album_id, owner_id);
create index ai_calls_draft_owner_idx on public.ai_calls (draft_id, owner_id);

alter table public.ai_calls enable row level security;

-- Supabase grants everything on a new public table to anon and authenticated.
revoke all on table public.ai_calls from anon, authenticated;
grant select on table public.ai_calls to authenticated;

create policy ai_calls_owner_select on public.ai_calls
  for select to authenticated using ((select auth.uid()) = owner_id);
