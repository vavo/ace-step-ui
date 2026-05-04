# Parallel MVP Plan: Multi-User Slovak Teen Product

## Summary
Keep SQLite for MVP, use email/password plus Google OAuth, daily credits, OpenAI lyric drafting, mobile-first UX, public social loops, weekly leaderboards, and add Stripe subscriptions last.

Run this as a short sequential stabilization phase, then two parallel implementation waves. The important trick: lock API contracts first so backend and frontend can move independently instead of politely blocking each other like it’s 2009.

## Phase 0: Stabilize And Lock Contracts
Do this first, before parallel work.

- Fix current build blockers:
  - Server TypeScript errors.
  - Random-description typing.
  - Invalid UI language fallback.
  - Create form default vocal language overwrite.
- Define shared response shapes for:
  - auth user/session
  - credit balance/ledger
  - lyrics draft
  - simplified generation request
  - leaderboard entries
- Add route stubs returning deterministic placeholder JSON where needed so frontend work can start without waiting for full backend behavior.

## Parallel Wave 1

### Track A: Accounts, Credits, And Generation Backend
Owner writes mainly server/database/auth/generation code.

- Replace first-user auto-login with email/password, Google OAuth, and httpOnly session cookies.
- Add SQLite schema for OAuth identity, sessions, plans, credit balance, credit ledger, XP, levels, and leaderboard event counters.
- Add credits API:
  - `GET /api/credits/balance`
  - `GET /api/credits/ledger`
  - `POST /api/credits/claim-daily`
- Implement default credit economy:
  - Signup: `100`
  - Daily claim: `20`
  - Free balance cap: `120`
  - Streak bonus: `+5/day`, max `+25`
  - Lyrics draft: `2`
  - Audio generation: `20` per variation
- Update generation to reserve credits before ACE-Step starts and refund exactly once on failure/cancel.
- Keep ACE-Step expert params server-side behind presets.

### Track B: Mobile Create UX And OpenAI Lyrics Flow
Owner writes mainly React UI, i18n, API client wrappers.

- Rebuild create screen around one Slovak prompt:
  - “O čom má byť song?”
  - mood/style chips
  - “Vygenerovať text”
  - editable lyrics preview
  - “Vytvoriť song” with visible credit cost
- Add `POST /api/lyrics/draft` client flow using the locked contract.
- Hide advanced controls under `More options`.
- Move model, CFG, LM backend, temperature, LoRA, key/BPM/time signature into admin/dev Expert Mode.
- Make mobile create screen the primary layout.
- Add loading, insufficient credits, OpenAI failure, and generation status states.

## Parallel Wave 2

### Track C: Social, Gamification, And Leaderboards
Can start after basic account identity exists; does not need billing.

- Keep existing likes, comments, follows, profiles, playlists.
- Add first-class feed:
  - `GET /api/feed`
  - public songs by default
  - private toggle before/after publish
- Add weekly leaderboards:
  - top songs by likes/plays
  - top creators by published songs, likes received, follower growth
- Add XP and levels:
  - publish song
  - receive like
  - daily streak
  - first comment/follow milestones
- Add badges:
  - first song
  - first 10 likes
  - weekly top 10
  - 7-day streak
- Add lightweight growth-first safety:
  - report song/user
  - block user
  - basic rate limits for comments and follows

### Track D: Mobile Polish And Product Quality
Can run alongside Track C.

- Status: done. Verified at 390px for Create, Feed, Leaderboard, Library, and Profile.

- [x] Replace desktop-heavy navigation on mobile with bottom nav:
  - Create
  - Feed
  - Leaderboard
  - Library
  - Profile
- [x] Tighten Slovak copy for teenagers: short labels, fewer technical terms.
- [x] Ensure all major flows work at 390px width.
- [x] Add empty states, streak/credit reminders, share prompts, and profile progress UI.
- [x] Split large frontend files into maintainable components while touching the create/social surfaces.

## Final Phase: Stripe Paid Plan
Must be last after free credits and core retention loops work.

- Add Stripe checkout, portal, and webhook routes.
- Add Pro plan:
  - `1000` monthly credits
  - higher free balance cap
  - priority generation flag
  - Pro profile badge
- Make webhook handling idempotent.
- Downgrade canceled subscriptions back to free without deleting existing credits.

## Public Interfaces
- Auth:
  - `GET /api/auth/google/start`
  - `GET /api/auth/google/callback`
  - `GET /api/auth/me`
  - `POST /api/auth/logout`
- Lyrics:
  - `POST /api/lyrics/draft`
- Credits:
  - `GET /api/credits/balance`
  - `GET /api/credits/ledger`
  - `POST /api/credits/claim-daily`
- Generation:
  - `POST /api/generate`
  - `GET /api/generate/status/:jobId`
- Social:
  - `GET /api/feed`
  - `GET /api/leaderboards?period=weekly`
- Billing:
  - `POST /api/billing/checkout`
  - `POST /api/billing/portal`
  - `POST /api/billing/webhook/stripe`

## Test Plan
- Phase 0: frontend and server builds pass.
- Track A: OAuth, sessions, signup credits, daily claim, streak bonus, reserve/refund, insufficient credits.
- Track B: prompt-to-lyrics, lyrics editing, hidden advanced options, mobile create flow, OpenAI failure state.
- Track C: feed, public/private songs, likes/comments/follows, leaderboard ranking, XP events, badge grants.
- Track D: mobile screenshots for create/feed/leaderboard/profile/library at 390px and desktop width.
- Final phase: Stripe checkout, webhook idempotency, Pro upgrade, cancellation downgrade.

## Assumptions
- SQLite MVP means one production server process.
- OpenAI handles lyrics/title/style drafting; ACE-Step handles audio.
- Growth-first means public-by-default sharing with lightweight safety controls.
- Stripe is the billing provider.
- Paid subscriptions are implemented only after free credits, OAuth, create UX, lyrics, social, and leaderboards are working.
