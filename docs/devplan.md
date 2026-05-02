# Execution Plan: Multi-User MVP Kickoff

## Plan File
Create `docs/multi-user-mvp-plan.md` and save the full parallel MVP plan there.

The file should include:
- product goal and Slovak teen target group
- phased implementation order
- parallel tracks
- API contracts
- credit economy
- OpenAI lyrics flow
- test plan
- assumptions

## Commit Cadence
Commit after each clean, buildable slice:

1. `docs: add multi-user mvp plan`
2. `fix: stabilize current server build blockers`
3. `refactor: prepare auth and user model for multi-user accounts`
4. `feat: add credit schema and ledger service`
5. `feat: reserve and refund credits for generation`
6. `feat: add openai lyrics draft endpoint`
7. `refactor: simplify create flow and hide expert controls`
8. `feat: add mobile-first create UX`
9. `feat: add feed and weekly leaderboard contracts`
10. `feat: add xp badges and leaderboard events`
11. `feat: add stripe subscription flow`

## First Implementation Slice
Start with docs plus landmine fixes.

- Add `docs/multi-user-mvp-plan.md`.
- Fix server TypeScript failures:
  - `server/src/routes/generate.ts` random-description response typing.
  - Existing route typing/build issues blocking `npm run build`.
- Fix known behavior landmines:
  - invalid UI language should reject or ignore, not persist `sk`.
  - default vocal language should not overwrite active create-form edits.
- Run:
  - root frontend build
  - server build
  - `git diff --check`
- Commit after this slice.

## Next Slice
Prepare multi-user foundation without adding Google OAuth yet.

- Add schema columns/tables for:
  - auth provider identity
  - user plan
  - credits balance
  - credit ledger
  - XP / level
  - badges
  - leaderboard events
- Keep SQLite.
- Keep existing username login only temporarily behind dev/local fallback.
- Do not touch Stripe in this slice.
- Add small service helpers for user payloads, credits, and ledger writes.
- Commit once schema and tests/build pass.

## Assumptions
- Implementation starts in the current repo at `/Users/vavo/.codex/worktrees/2a7b/ace-step-ui`.
- No branch or PR unless explicitly requested.
- Commit often means every independently verified slice gets its own commit.
- Paid subscriptions remain the last MVP feature.
