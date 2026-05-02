# Plan Commit Landmine Audit

Date: 2026-05-03

Audited implementation range: `3496ae2..f3c727a`

Scope: the plan-related commits for social feed, gamification, session auth, credits, mobile retention surfaces, create-flow polish, and follow-up fixes. Stripe and billing are intentionally out of scope for this pass.

## Fixed In This Pass

- `29c08fa fix: record signup credit grants`
  - New users now get a `signup_grant` credit ledger row when their account is created.
  - This keeps wallet history aligned with the database default starting balance.
  - Existing accounts created before this fix are not auto-backfilled because their balances may already have changed.

- `f3c727a fix: return fallback generation limits`
  - `/api/generate/limits` now returns safe fallback limits instead of a 500 when the runtime limit probe is unavailable.
  - This keeps anonymous startup and create-flow diagnostics quieter while still exposing the backend error for debugging.

## Remaining Landmines

- Auth still supports long-lived bearer tokens stored in `localStorage`.
  - Cookie sessions are present and checked first, but the frontend still stores `acestep_token` and sends bearer auth for compatibility.
  - Before production, this should be narrowed to httpOnly cookie sessions with a deliberate migration path for local/dev users.

- The original plan docs are local-only.
  - `.gitignore` excludes `docs/devplan.md` and `docs/multi-user-mvp-plan.md`.
  - Status updates inside those files will not land in git unless the project moves plan status into a tracked doc.

- Frontend bundle size is still above Vite's warning threshold.
  - The current app build passes, but the main JS chunk remains large.
  - Track D improved mobile UX, not code splitting. Route-level splitting is still a production polish item.

- Anonymous startup still has auth/session-restore noise in browser smoke output.
  - Earlier mobile smoke runs showed expected unauthenticated `/api/auth/me` 401/session-restore noise.
  - The user-facing UI is usable, but diagnostics are louder than they need to be.

- Rate limiting is process-local memory.
  - `server/src/services/rateLimit.ts` is acceptable for a single-process SQLite MVP.
  - It will not provide durable or shared enforcement across restarts, clustered servers, or multiple instances.

- Credit streak dates use UTC day keys.
  - This is deterministic, but it may not match a Europe/Bratislava product day.
  - Decide now whether streaks reset by UTC or by the user's local timezone; changing it later can create awkward streak complaints.

- Signup grant history is fixed only for newly created accounts.
  - Users created before `29c08fa` can still lack a `signup_grant` ledger row.
  - If that matters for launch data quality, add an explicit one-time backfill that only targets accounts whose ledger proves the grant is missing and whose balance history can be safely reconciled.

## Verification

- Server build: passed.
- Full app build: passed.
- Diff whitespace checks: passed.
- Known build warning: Vite still reports a large JS chunk.
