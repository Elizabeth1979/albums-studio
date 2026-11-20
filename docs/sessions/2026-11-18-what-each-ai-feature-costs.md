# What each AI feature costs

**Date:** 2026-11-18

## Why

The owner wants to decide which AI features to sell as extras, and what to charge for each,
from what they actually cost to run. `ai_usage` counts uses against the monthly allowance
and cannot say what a use cost. `ai_drafts` keeps tokens only for calls that produced a
draft, and adds cached and uncached input together, though on Sonnet 5.5 they are priced
twenty times apart. Neither can price a feature.

## What was built

- `ai_calls`, one row per paid AI call: the product feature (`album_story` and
  `album_questions` today; `alt` is already accepted for the alt text drafts in review), the
  album, how many photographs it was shown, the model asked for and the one that answered,
  input, cache-write, cache-read and output tokens, the cost in US dollars, the price list
  that priced it, and how long it took. Declined and failed calls are logged too, because a
  declined call is paid for. A call that never reached the model (the monthly allowance
  already used) is not.
- Logged through `costLog` in `supabase/functions/_shared/studio.ts`, beside the allowance
  counting every AI function already shares: one line to start it once the request is
  built, one call per way the request can end. A new AI function gets its costs logged by
  doing the same; the browser side needs only an entry in `PAID_FEATURES`.
- The cost is worked out in the Edge Function when the call ends, from
  `supabase/functions/_shared/aiPricing.ts`, and stored. A later price change does not
  rewrite what an earlier story cost; the tokens are kept so a row can be repriced on
  purpose. With server-side fallback, `usage.iterations` is the whole bill (the top level
  covers only the attempt that answered), so each attempt is priced at its own model.
- A model with no price on file is logged with no cost, and the panel says how many such
  calls it left out, rather than counting them as free.
- An "AI costs" button in the header opens a panel, one section per paid feature: uses,
  total, per use, per photograph, this month, and the log. On a wide screen it is a column
  the page narrows to make room for; on a narrow one it opens in place under the header.
  The first version floated over the page and hid Sign out on a laptop, which the
  accessibility sweep found by hanging while it waited to hover over a covered control. The on-device features
  are listed as costing nothing per use, and the planned ones as not built yet. The log
  downloads as a CSV for a spreadsheet.

## Decisions

- **Testing mode is a constant, `AI_COST_PANEL_ENABLED` in `src/lib/aiCosts.ts`.** On now;
  turn it off before launch. The log keeps recording either way. Each person sees only
  their own calls, enforced by RLS, so the switch hides a view rather than guarding data.
- **Grouped by product feature, not by model or endpoint.** A feature is one thing a person
  asks for, as it would be sold. Alt text drafts, captions and search each add one value to
  the `feature` check constraint and one entry to `PAID_FEATURES`.
- **Per photograph as well as per use.** A story's cost grows with the photographs it reads,
  so a price per story only holds for albums of the size it was measured on.

## Known limits

- The panel shows the signed-in person's own calls only; pricing across every tester would
  need an administrator view, which does not exist.
- A refusal before any output may not be billed by Anthropic, depending on its category; the
  log prices the tokens reported, so it can overstate a declined call.
- Prices are Anthropic's first-party list prices of 2026-11-03, copied into code; they have
  to be updated by hand when Anthropic changes them, with `PRICE_LIST` moved on.
