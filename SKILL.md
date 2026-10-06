# AVENQUIS --- SKILL.md

## 1. Purpose

This file is the permanent operating manual for any AI coding agent
working on Avenquis, including Antigravity.

Avenquis is a multi-tenant professional practice and audit-management
platform. The system has two primary applications:

-   `avenquis_main` --- the firm-facing operational application where
    users manage clients, engagements, teams, tasks, documents, working
    papers, reviews, sign-offs, timesheets, and related workflows.
-   `avenquis_contrl_panel` --- the platform administration application
    used to manage firms, platform users, access, security,
    subscriptions, and platform-level settings.

The coding agent must optimize for a reliable, secure, auditable
production system---not merely attractive screens.

------------------------------------------------------------------------

## 2. Current Architecture

### Main Application

Primary repository: `avenquis_main`

Primary responsibilities: - Firm dashboard - Client CRM - Engagement
management - Team assignment - Tasks - Document Vault - Client document
requests - Working papers - Review notes - Review and sign-off -
People/staff - Students - Timesheets - Office finance - Firm settings

### Control Panel

Primary repository: `avenquis_contrl_panel`

Primary responsibilities: - Platform overview - Firm administration -
Platform users - Access requests - Security - Subscription/platform
controls - Platform settings

### Infrastructure

Current intended deployment architecture:

-   Frontend: Vercel
-   Backend/API: Render
-   Database: PostgreSQL / Neon
-   Source control: GitHub
-   Main backend Render service: `avenquis-core`
-   Control backend/BFF Render service: `avenquis-control-bff`

Do not replace this architecture without explicit approval.

------------------------------------------------------------------------

## 3. Product Priority

The Main application is the primary operational product.

Until Main reaches functional parity with the required Core MVP, Control
Panel development is secondary except for: - critical bugs, - security
issues, - required integration work, - blockers affecting Main.

Do not spend development time on cosmetic Control Panel improvements
while essential Main workflows remain incomplete.

Current Main catch-up priority:

1.  Client CRM
2.  Engagements
3.  Team assignment
4.  Tasks
5.  Document Vault and Client Requests
6.  Working Papers
7.  Review and Sign-off
8.  Dashboard/reporting based on real data

------------------------------------------------------------------------

## 4. Core Business Workflow

The system should ultimately support this end-to-end flow:

Client → Engagement → Team Assignment → Planning → Tasks → Client
Requests → Documents/Evidence → Working Papers → Review Notes → Review
Clearance → Partner/Authorized Sign-off → Engagement Completion → Audit
Trail

A screen is not considered complete merely because it renders.

A module is complete only when its required data persistence, API
behavior, authorization, validation, error handling, and user workflow
work end-to-end.

------------------------------------------------------------------------

## 5. Required Working Method

Before starting any implementation task:

1.  Read this `SKILL.md`.
2.  Read `STRICT_RULES.md`.
3.  Check repository status.
4.  Check current branch.
5.  Fetch remote state.
6.  Confirm local work is not ahead/diverged unexpectedly.
7.  Never destroy uncommitted work.
8.  Sync safely with the latest approved branch.
9.  Identify the exact task scope.
10. Inspect existing implementation before writing new code.

Prefer extending working architecture over replacing it.

Before declaring work complete:

1.  Review changed files.
2.  Run relevant tests.
3.  Run build/type/lint checks available in the repository.
4.  Verify the affected workflow manually or through automated tests.
5.  Check authorization and tenant boundaries where relevant.
6.  Confirm no secrets were introduced.
7.  Confirm no unrelated functionality was broken.
8.  Report remaining limitations truthfully.

------------------------------------------------------------------------

## 6. Status Classification

During audits, classify every module as exactly one of:

-   `WORKING` --- end-to-end functional with real data.
-   `PARTIAL` --- meaningful implementation exists but workflow is
    incomplete.
-   `MOCK` --- UI/function depends materially on mock/static/fake data.
-   `BROKEN` --- implementation exists but currently fails.
-   `MISSING` --- required functionality is not implemented.

Do not label a module `WORKING` based only on UI rendering.

------------------------------------------------------------------------

## 7. Data and API Principles

-   Production workflows must use real persisted data.
-   Do not create duplicate API layers when an appropriate existing
    endpoint can be extended safely.
-   API contracts must be explicit and predictable.
-   Validate inputs server-side.
-   Enforce authorization server-side.
-   Preserve tenant isolation in every tenant-owned query and mutation.
-   Use database transactions where partial completion could corrupt
    business state.
-   Return useful errors without exposing secrets or internal
    implementation details.
-   Avoid hidden fallback to mock data in production.

------------------------------------------------------------------------

## 8. Database Principles

-   PostgreSQL/Neon is the system of record unless explicitly changed.
-   Schema changes must use migrations.
-   Never manually mutate production schema as a substitute for a
    migration.
-   Migrations should be reviewable and, where practical, reversible.
-   Protect referential integrity.
-   Use appropriate unique constraints and indexes.
-   Do not delete or rewrite production data without explicit approval.
-   Backfill plans are required when a schema change affects existing
    records.

------------------------------------------------------------------------

## 9. Multi-Tenancy

Tenant isolation is non-negotiable.

Every tenant-owned resource must be scoped to the authenticated tenant
on the backend.

Never trust: - a frontend tenant selector, - a request body tenant ID, -
a query parameter, - hidden UI state

as sufficient authorization.

Cross-tenant data exposure is a critical security defect.

------------------------------------------------------------------------

## 10. RBAC and Authentication

Authentication determines who the user is.

Authorization determines what the user may do.

Rules: - RBAC must be enforced on the backend. - UI hiding alone is
never authorization. - Privileged actions require explicit permission
checks. - Do not weaken auth for development convenience. - Never
hard-code privileged users or bypasses into production logic. -
Session/token handling must follow the existing approved architecture.

------------------------------------------------------------------------

## 11. Audit and Professional Workflow Principles

Avenquis may assist audit professionals, but software automation must
remain traceable.

For audit-related functionality: - Evidence must be linkable to the work
performed. - Working papers should retain preparer/reviewer
information. - Review notes and clearance should be auditable. -
Sign-off must identify the authorized human user. - AI must never
impersonate a Partner, reviewer, or authorized approver. - AI-generated
analysis must remain reviewable by humans. - Unsupported conclusions
must not be presented as verified audit conclusions.

------------------------------------------------------------------------

## 12. Financial Calculation Principles

Financial and audit calculations must be deterministic and reproducible
where possible.

AI may explain, classify, suggest, or draft, but should not invent
financial figures.

Material calculations should preserve: - inputs, - method/formula, -
output, - source/reference, - relevant period, - responsible/reviewing
user where applicable.

------------------------------------------------------------------------

## 13. AI Audit Agent Direction

The future AI Audit Agent should operate under:

Accounts/Documents → Understand engagement → Identify missing
information → Analyze TB/GL → Identify risks → Suggest procedures →
Perform allowed deterministic tests → Draft working papers → Raise
exceptions → Human review → Authorized approval

Core principle:

**AI prepares; humans review; authorized humans approve.**

Do not build autonomous approval or unsupported assurance functionality.

------------------------------------------------------------------------

## 14. UI/UX Principles

Functionality currently takes priority over unnecessary redesign.

When modifying UI: - preserve existing visual language unless change is
required, - maintain responsive behavior, - include loading, empty,
error, and success states, - do not display fake success, - do not
silently swallow API failures, - avoid duplicate components when
reusable components already exist, - preserve accessibility
fundamentals.

A visually polished screen with fake data is not complete.

------------------------------------------------------------------------

## 15. Testing Expectations

Testing should be proportional to risk.

At minimum, changes should consider: - happy path, - validation
failures, - unauthorized access, - wrong-role access, - wrong-tenant
access, - missing records, - API/network failure, - persistence after
refresh/re-login, - regression of adjacent workflows.

High-risk changes involving auth, RBAC, tenancy, migrations, financial
calculations, document access, or sign-off require stronger
verification.

------------------------------------------------------------------------

## 16. Git Workflow

Before work: - inspect `git status`, - inspect branch, - fetch remote, -
protect local changes.

During work: - keep changes task-scoped, - avoid unrelated refactors, -
do not mix large formatting changes with functional changes.

Before commit/push: - review diff, - run relevant checks, - ensure no
secret files are staged, - use a meaningful commit message, - confirm
the intended repository and branch.

Never force-push, hard-reset shared work, rewrite published history, or
delete branches without explicit approval.

------------------------------------------------------------------------

## 17. Deployment Awareness

GitHub, Vercel, Render, and Neon are separate operational boundaries.

Do not assume a successful Git push means production is healthy.

After deployment-related work, verify as applicable: - build result, -
deployment state, - environment configuration, - backend health, -
frontend/backend connectivity, - runtime errors, - database
connectivity, - affected user workflow.

Never expose environment variable values or secrets in reports.

------------------------------------------------------------------------

## 18. Definition of Done

A task is `DONE` only when all applicable conditions are satisfied:

-   requested behavior is implemented,
-   real data is used where required,
-   persistence works,
-   validation works,
-   authorization works,
-   tenant isolation is preserved,
-   tests/checks pass,
-   build passes,
-   no known critical regression exists,
-   no secrets were committed,
-   deployment impact is understood,
-   limitations are reported.

If any required condition fails, report the task as `PARTIAL` or
`BLOCKED`, not `DONE`.

------------------------------------------------------------------------

## 19. Phase Discipline

Avenquis development is phase-driven.

Do not begin a later phase merely because its work is interesting or
easy.

Current strategic order:

Phase 1 --- Baseline Lock & Main Catch-up Audit\
Phase 2 --- Core Data Foundation\
Phase 3 --- Engagement Operating Workflow\
Phase 4 --- Document Vault & Client Requests\
Phase 5 --- Working Papers, Review & Sign-off\
Phase 6 --- Audit Engine\
Phase 7 --- Personal AI Audit Agent\
Phase 8 --- Bangladesh Professional Intelligence\
Phase 9 --- Office Operations\
Phase 10 --- Production Hardening & Launch

Exit criteria for the active phase must be satisfied before
intentionally advancing to the next phase unless the owner explicitly
approves an exception.

------------------------------------------------------------------------

## 20. Reporting Standard

At the end of a task, report concisely:

-   Scope completed
-   Files/modules changed
-   Database/API changes
-   Tests/build performed and results
-   Security/tenant/RBAC impact
-   Deployment impact
-   Remaining issues
-   Final status: `DONE`, `PARTIAL`, or `BLOCKED`

Never claim success without verification.
