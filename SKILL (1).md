# AVENQUIS CODING AGENT SKILL

## Mission
Work safely on:
`D:\Avenquis new frontend\avenquis_main-git`

Goal: stabilize Avenquis Main/Core locally, verify real API + Neon DB behavior, then fix frontend functionality without redesigning the existing UI.

## Non-negotiable rules
1. Do not redesign the UI unless explicitly asked.
2. Do not delete pages, routes, migrations, tables, or working features without explicit approval.
3. Do not commit or push unless explicitly instructed.
4. Never print, expose, overwrite, or commit secrets from `.env`.
5. Never replace the real Neon `DATABASE_URL` with a placeholder.
6. Never run destructive SQL, DROP/TRUNCATE/reset/delete-branch operations without explicit approval.
7. Do not invent API endpoints. Inspect backend route mounts and route files first.
8. Prefer minimal targeted fixes over broad rewrites.
9. Preserve all existing user changes.
10. Do not silently switch to mock mode when API mode is expected.

## Local ports
- Main/Core frontend: `http://localhost:3101`
- Main/Core backend: `http://127.0.0.1:8101`
- Control frontend: `http://localhost:4000`
- Frontend API base: `http://127.0.0.1:8101/api/v1`

## Known backend auth contract
Backend mounts auth at `/api/v1/auth`.

Routes:
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`

Frontend should therefore call:
- `/auth/login`
- `/auth/logout`
- `/auth/me`

## Environment
Frontend `.env.local`:
```env
VITE_API_BASE_URL=http://127.0.0.1:8101/api/v1
VITE_DATA_MODE=api
```

Backend `backend/.env` minimum:
```env
NODE_ENV=development
PORT=8101
DATABASE_URL=<existing Neon connection string>
CORS_ORIGIN_FRONTEND=http://localhost:3101
CORS_ORIGIN_CONTROL_PANEL=http://localhost:4000
JWT_SECRET=<local secret>
CONTROL_SERVICE_TOKEN=<local secret>
```

Preserve the existing Neon URL. Do not show its password in reports.

## Execution order

### Phase 1 — Safety
- Run `git status -sb`.
- Record current branch.
- Inspect current diffs.
- Do not reset/revert unrelated work.

### Phase 2 — API client
Inspect `src/services/apiClient.ts`.
Fix URL joining so `/api/v1` is preserved.

Expected:
- `/people` -> `http://127.0.0.1:8101/api/v1/people`
- `/auth/login` -> `http://127.0.0.1:8101/api/v1/auth/login`

### Phase 3 — Auth
Inspect `src/services/authService.ts`.
Remove any hard-coded `localhost:8001`.
Use:
- `/auth/login`
- `/auth/logout`
- `/auth/me`

### Phase 4 — Env readiness
- Verify `.env.local`.
- Verify backend `.env`.
- Do not expose secrets.
- Confirm API mode, not mock mode.

### Phase 5 — Frontend verification
From repo root:
- `npm run typecheck`
- `npm run build`
- `npm run lint`

### Phase 6 — Backend verification
From `backend`:
- `npm run typecheck`
- `npm run build`
- `npm run test`

Available backend scripts also include:
- `npm run db:generate`
- `npm run db:migrate`
- `npm run db:seed`
- `npm run test:integration`
- `npm run test:x8`

Do not run DB-changing commands until migration state is inspected.

### Phase 7 — Neon migration safety
Before any migration:
- inspect `backend/drizzle.config.ts`
- inspect migration files + journal
- inspect current Neon schema state
- determine whether migrations are already applied

Do not generate a migration unless schema changes are actually required.
Do not seed over unknown existing data.

### Phase 8 — Local runtime
Backend:
`npm run dev`

Frontend:
`npm run dev -- --port 3101`

Verify:
- frontend loads
- backend responds
- auth endpoints are reachable
- requests go to port 8101
- no request goes to port 8001
- no accidental mock fallback

### Phase 9 — Page audit
Classify every page as:
- LIVE
- PARTIAL
- STATIC
- BROKEN

Pages:
Dashboard; People & Staff; Students / Articleship; Client CRM; Engagements & Teams; Tasks & Deadlines; Timesheets; Document Vault; Working Papers; Review & Sign-offs; Client Requests; Office Finance; Settings.

Fix functionality first. Do not redesign.

### Phase 10 — Refactor
Only after API/auth/build/runtime are stable:
- split large `src/App.tsx`
- extract pages/components incrementally
- preserve exact visual output
- run typecheck/build after each extraction
- no big-bang rewrite

## Git discipline
Before work:
`git status -sb`

After each phase:
`git diff --check`
`git diff --stat`

Never use without explicit approval:
- `git reset --hard`
- force push
- branch deletion
- `git clean`
- amend user commits

## Reporting format
At the end of every phase report:

### Phase
<name>

### Files changed
- ...

### What changed
- ...

### Verification
- command: PASS/FAIL

### Remaining blockers
- None / exact blocker

### Need from user
- Nothing / exact item required

Do not say only “done” or “mostly done”.

## Stop conditions
Stop and ask before continuing if:
- Neon migration state is ambiguous
- a destructive DB action appears necessary
- a secret is missing
- API contract cannot be proven from code
- a change would alter the approved UI
- unrelated user changes could be overwritten
- production-like data could be affected


## Mandatory phase approval gate
After completing ANY phase:
1. Stop immediately.
2. Report that phase only.
3. Ask the user for explicit permission to continue.
4. Do NOT start the next phase until the user replies with clear approval such as `Next`, `Continue`, `Proceed`, or equivalent.
5. Never batch multiple phases into one run unless the user explicitly asks.

Example:
`Phase 1 completed. Waiting for your approval before Phase 2.`

This approval gate applies to every phase, starting with Phase 1.

## Immediate assignment
Do this exact sequence:
1. Safety/status check
2. Finish `apiClient.ts` URL-join fix
3. Finish `authService.ts` route fix
4. Verify `.env.local`
5. Verify backend `.env` without exposing secrets
6. Frontend typecheck/build/lint
7. Backend typecheck/build/test
8. Inspect Neon migration state
9. Start backend
10. Start frontend
11. Live smoke test
12. Report
13. Page-by-page functional audit
14. Refactor only after stability

Do not ask the user for the Neon URL if it already exists in `backend/.env`.
