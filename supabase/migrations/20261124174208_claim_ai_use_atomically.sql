-- Take an AI use from the month's allowance before the model is called, atomically.
--
-- The AI functions read the month's count, compared it with the allowance, called
-- the model, and only then counted the use. Requests sent together all read the
-- same count, all passed, and all reached the model: five story drafts a month
-- became as many as one person could send at once, each one paid for. With
-- signup open, that is the platform's AI bill in a stranger's hands.
--
-- `claim_ai_use` adds one only while the count is below the limit, in a single
-- statement, so the row lock decides who gets the last use. No row back means the
-- allowance is spent. `release_ai_use` gives one back when the call never got a
-- reply, which is what was never counted before either: nothing was billed.
--
-- `record_ai_use` stays until every deployed function has stopped calling it;
-- drop it in a later migration.

create function public.claim_ai_use(p_owner uuid, p_operation text, p_limit integer)
returns integer
language sql
volatile
security invoker
set search_path to ''
as $function$
  insert into public.ai_usage (owner_id, period, operation, count, byok)
  select p_owner, date_trunc('month', now())::date, p_operation, 1, false
  where p_limit > 0
  on conflict (owner_id, period, operation, byok)
  do update set count = public.ai_usage.count + 1
  where public.ai_usage.count < p_limit
  returning count;
$function$;

create function public.release_ai_use(p_owner uuid, p_operation text)
returns void
language sql
volatile
security invoker
set search_path to ''
as $function$
  update public.ai_usage
  set count = count - 1
  where owner_id = p_owner
    and period = date_trunc('month', now())::date
    and operation = p_operation
    and byok = false
    and count > 0;
$function$;

-- Supabase grants execute on every new function to anon by default.
revoke all on function public.claim_ai_use(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.release_ai_use(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_ai_use(uuid, text, integer) to service_role;
grant execute on function public.release_ai_use(uuid, text) to service_role;
