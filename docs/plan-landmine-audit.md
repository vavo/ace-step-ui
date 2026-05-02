# Plan Commit Landmine Audit

Date: 2026-05-03

Audited implementation range: `3496ae2..f19e9fc`

Scope: the plan-related commits for social feed, gamification, session auth, credits, mobile retention surfaces, create-flow polish, and follow-up fixes. Stripe and billing are intentionally out of scope for this pass.

## Fixed In This Pass

- `29c08fa fix: record signup credit grants`
  - New users now get a `signup_grant` credit ledger row when their account is created.
  - This keeps wallet history aligned with the database default starting balance.
  - Existing accounts created before this fix are not auto-backfilled because their balances may already have changed.

- `f3c727a fix: return fallback generation limits`
  - `/api/generate/limits` now returns safe fallback limits instead of a 500 when the runtime limit probe is unavailable.
  - This keeps anonymous startup and create-flow diagnostics quieter while still exposing the backend error for debugging.

- `9fa7851 fix: restore sessions without persisted tokens`
  - Frontend startup now uses quiet cookie-session restore via `/api/auth/session`.
  - Legacy `acestep_token` and `acestep_user` localStorage entries are removed on load/logout.
  - Session restore no longer logs expected anonymous startup as a warning path.

- `c3b1c52 perf: split frontend route bundles`
  - Non-default views and video generation load lazily.
  - Vendor, React, and icon code are split into separate chunks.
  - The Vite large chunk warning is gone in the verified build.

- `3553e54 fix: harden credits and rate limits`
  - Rate limits now persist in SQLite instead of process memory.
  - Daily credit streak date keys use `PRODUCT_TIME_ZONE`, defaulting to `Europe/Bratislava`.
  - Untouched legacy users with a 100-credit balance and no ledger rows get a conservative signup grant ledger backfill.

- `26c5c88 docs: track implementation plan status`
  - `docs/devplan.md` and `docs/multi-user-mvp-plan.md` are now tracked instead of ignored.

- `f19e9fc fix: disable bearer auth in production`
  - Cookie sessions are still checked first everywhere.
  - Bearer auth fallback is now development-only, so production is not accepting long-lived JWT fallback auth.

## Remaining Landmines

- Stripe remains intentionally out of scope for this pass.

- Bearer tokens still exist as a local/dev compatibility path.
  - Production no longer accepts bearer fallback after cookie-session lookup fails.
  - A later cleanup can remove token plumbing from the React API wrappers, but that is now cleanup, not a production auth landmine.

## Verification

- Server build: passed.
- Full app build: passed.
- Diff whitespace checks: passed.
- Vite large chunk warning: fixed.
