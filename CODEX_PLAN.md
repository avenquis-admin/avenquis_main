# AVENQUIS MAIN — CODING AGENT PLAN

## Goal
Stabilize Avenquis Main/Core first, then verify real API + Neon behavior, then repair frontend functionality, then refactor structure.

## Phase 1 — Baseline
- Git status/branch
- preserve current changes
- verify env files are ignored

## Phase 2 — API/Auth
- fix `apiClient.ts` URL joining
- keep `/api/v1`
- remove hard-coded port 8001
- use `/auth/login`, `/auth/logout`, `/auth/me`

## Phase 3 — Environment
- frontend 3101
- backend 8101
- control 4000
- API base `http://127.0.0.1:8101/api/v1`
- preserve existing Neon `DATABASE_URL`

## Phase 4 — Compile/Test
Frontend:
- typecheck
- build
- lint

Backend:
- typecheck
- build
- test

## Phase 5 — Neon
- inspect migration configuration/history
- compare with actual DB state
- do not run destructive changes
- migrate only when proven safe

## Phase 6 — Runtime
- start backend 8101
- start frontend 3101
- verify health/auth/live data
- confirm no traffic to 8001
- confirm no mock fallback

## Phase 7 — Frontend functional audit
Classify each page LIVE / PARTIAL / STATIC / BROKEN and fix broken behavior without redesign.

## Phase 8 — Structural refactor
Only after stability:
- split monolithic `App.tsx`
- extract incrementally
- preserve current appearance

## Final deliverable
- files changed
- build/test results
- live API results
- page status matrix
- remaining blockers
- next recommended phase
