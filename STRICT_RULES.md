# AVENQUIS --- STRICT_RULES.md

## Authority

These rules are non-negotiable for any AI coding agent working on
Avenquis.

If a task instruction conflicts with these rules, stop and report the
conflict instead of silently bypassing the rule.

The project owner may explicitly authorize an exception. Do not infer
approval.

------------------------------------------------------------------------

## A. Repository Safety

1.  Never delete, overwrite, reset, or discard uncommitted local work
    without explicit approval.
2.  Never run destructive Git operations merely to make the workspace
    clean.
3.  Never use `git reset --hard`, force-push, destructive checkout,
    history rewrite, or branch deletion without explicit approval.
4.  Before coding, verify repository, branch, status, and remote state.
5.  If local and remote histories unexpectedly diverge, stop and report
    before resolving destructively.
6.  Never push to the wrong repository or branch.
7.  Never commit generated secrets, `.env` files containing secrets,
    credentials, tokens, private keys, or database URLs.
8.  Keep commits task-scoped. Do not mix unrelated refactoring into
    feature work.
9.  Do not rewrite working code simply because another style is
    preferred.
10. Do not modify unrelated files unless technically necessary; explain
    any necessary cross-cutting changes.

------------------------------------------------------------------------

## B. Architecture Lock

11. Do not replace the approved Vercel + Render + Neon/PostgreSQL +
    GitHub architecture without explicit approval.
12. Do not split, merge, or rename major services/repositories without
    explicit approval.
13. Do not introduce a new framework, database, ORM, authentication
    system, state-management architecture, or major infrastructure
    dependency without approval.
14. Reuse existing patterns when they are sound.
15. Architecture-level concerns must be proposed first; do not silently
    implement them.

------------------------------------------------------------------------

## C. Main vs Control Priority

16. `avenquis_main` is the current product-development priority.
17. `avenquis_contrl_panel` is feature-frozen for nonessential expansion
    while Main is materially behind, except for critical bugs, security
    fixes, required integrations, and owner-approved work.
18. Do not spend time on cosmetic Control Panel redesign while Main Core
    workflows remain incomplete.
19. Main Core workflow functionality takes precedence over decorative UI
    improvements.

------------------------------------------------------------------------

## D. No Fake Completion

20. A rendered page is not proof of a completed feature.
21. A module using mock/static/fake production data must not be reported
    as `WORKING`.
22. Never fabricate API success, saved state, audit results,
    calculations, notifications, uploads, or database persistence.
23. Never hide a failing backend behind a frontend-only success message.
24. Never mark a task `DONE` when required tests/builds/workflows are
    failing.
25. Report incomplete work as `PARTIAL` or `BLOCKED`.

------------------------------------------------------------------------

## E. Database Safety

26. All schema changes must be implemented through migrations.
27. Never directly alter production schema as a shortcut around
    migrations.
28. Never drop a production table, column, database, or material dataset
    without explicit approval and a recovery plan.
29. Never run destructive data cleanup against production merely to fix
    development/test problems.
30. Preserve referential integrity.
31. Consider backward compatibility for migrations used by deployed
    applications.
32. For risky migrations, require a backup/rollback strategy before
    execution.
33. Never expose database credentials in code, logs, screenshots,
    commits, or reports.

------------------------------------------------------------------------

## F. Multi-Tenant Security

34. Tenant isolation must be enforced on the backend.
35. Never trust a tenant ID supplied by the frontend as authorization.
36. Every tenant-owned read/write operation must be scoped to the
    authenticated tenant.
37. Cross-tenant data access is a critical defect.
38. Never add a temporary cross-tenant bypass for debugging in
    production code.
39. Tests for sensitive tenant-owned resources must include wrong-tenant
    access attempts.

------------------------------------------------------------------------

## G. Authentication and RBAC

40. Never weaken authentication to make development easier.
41. Never use frontend visibility as the only permission control.
42. Privileged actions must be authorized server-side.
43. Never hard-code an admin bypass or universal privileged user in
    production.
44. Never log passwords, tokens, session secrets, or sensitive
    authentication payloads.
45. Role/permission changes must preserve least-privilege behavior.
46. Wrong-role access must be tested for sensitive actions.

------------------------------------------------------------------------

## H. Secrets and Environment Variables

47. Never hard-code secrets.
48. Never print secret values while debugging.
49. Never commit production credentials.
50. Never copy production secrets into documentation or example files.
51. `.env.example` may contain variable names and safe placeholders
    only.
52. When reporting configuration problems, name the
    missing/misconfigured key without exposing its value.

------------------------------------------------------------------------

## I. Audit Integrity

53. Never generate or represent an unsupported audit conclusion as
    verified.
54. Never fabricate audit evidence.
55. Never fabricate reviewer or Partner sign-off.
56. AI may draft work but must not impersonate an authorized human
    approver.
57. Preserve evidence references and audit trail where the workflow
    requires them.
58. Review-note clearance must remain attributable.
59. Final sign-off must remain attributable to an authorized human user.
60. Do not silently change historical audit records that should be
    immutable/auditable.

------------------------------------------------------------------------

## J. Financial Integrity

61. Never invent financial figures.
62. Do not use generative AI output as the sole source of material
    financial calculations.
63. Deterministic calculations must be reproducible from stored/source
    inputs.
64. Preserve calculation inputs and relevant period where material.
65. Do not silently round, substitute, or infer missing material
    figures.
66. If required financial input is missing or ambiguous, surface the
    issue instead of guessing.

------------------------------------------------------------------------

## K. Files and Documents

67. Never expose one tenant's documents to another tenant.
68. Document access must follow authorization rules.
69. Do not silently overwrite uploaded evidence when versioning/history
    is required.
70. File deletion affecting audit evidence requires appropriate
    authorization and auditability.
71. Validate file metadata/type/size according to the application's
    security policy.
72. Do not treat a filename as trusted identity or authorization
    information.

------------------------------------------------------------------------

## L. UI Rules

73. Do not redesign functioning screens without a functional reason or
    explicit request.
74. Do not introduce inconsistent visual patterns unnecessarily.
75. Every real async workflow should handle loading, success, empty, and
    error states as applicable.
76. Never suppress meaningful API errors solely to make the interface
    appear clean.
77. Do not use mock data as an invisible fallback in production.
78. Preserve responsive behavior when changing existing screens.

------------------------------------------------------------------------

## M. Testing and Verification

79. Run relevant tests/checks before claiming completion.
80. Run the relevant build before completion when the change can affect
    build output.
81. Auth/RBAC/tenant changes require negative-access verification.
82. Database changes require migration verification.
83. Financial calculation changes require known-input/known-output
    verification.
84. Critical workflow changes require end-to-end verification where
    feasible.
85. A passing build alone does not prove business functionality.
86. If a required test cannot be run, state that explicitly.

------------------------------------------------------------------------

## N. Deployment Rules

87. Do not assume GitHub push equals successful deployment.
88. Check deployment status when a task affects production deployment.
89. Do not change production environment variables casually.
90. Do not delete production environment variables without explicit
    approval.
91. Do not trigger risky production changes before required
    verification.
92. If production deployment fails, inspect the failure; do not
    repeatedly redeploy blindly.
93. Prefer fixing root cause over forcing a deployment.
94. Never reveal Vercel/Render/Neon secret values in task reports.

------------------------------------------------------------------------

## O. Scope Discipline

95. Solve the assigned task; do not opportunistically rebuild the
    product.
96. Do not create duplicate modules because existing code was not
    inspected.
97. Search for existing implementations before creating new ones.
98. Do not add speculative features that were not requested or required
    by the active phase.
99. Do not advance roadmap phases without satisfying current exit
    criteria or receiving explicit approval.
100. If the requested work uncovers a major unrelated defect, report it
     separately unless it blocks the assigned task.

------------------------------------------------------------------------

## P. Stop Conditions

The agent must STOP and report before proceeding when any of the
following occurs:

-   unexpected uncommitted work may be overwritten,
-   merge conflict cannot be safely resolved without choosing between
    competing business logic,
-   local/remote branch state is unexpectedly divergent,
-   production data may be destroyed,
-   a migration could cause material data loss,
-   credentials/secrets appear exposed,
-   cross-tenant data leakage is discovered,
-   an architecture change appears necessary,
-   requirements conflict materially,
-   required authorization is unavailable,
-   an action would require bypassing these strict rules.

Stopping under these conditions is correct behavior, not failure.

------------------------------------------------------------------------

## Q. Required Completion Report

Every implementation task must end with:

1.  **Status:** `DONE`, `PARTIAL`, or `BLOCKED`
2.  **Scope completed**
3.  **Changed files/modules**
4.  **API/database changes**
5.  **Tests/checks performed**
6.  **Build result**
7.  **Security/RBAC/tenant impact**
8.  **Deployment impact**
9.  **Known remaining issues**

Never claim tests were run if they were not run. Never claim deployment
was verified if it was not verified. Never claim data persistence was
verified if it was not verified.

------------------------------------------------------------------------

## Final Rule

When uncertain, protect:

**data → security → audit integrity → working functionality → repository
history → deployment stability → UI polish**

in that order.


## Additional Credential & Secret Security Rules (New)

1. **Never print, echo, log, paste, display, or report any secret value.** This includes API tokens, Bearer tokens, GitHub tokens, Render tokens, Vercel tokens, Neon/Supabase credentials, DATABASE_URL values, JWT secrets, passwords, private keys, session cookies, SMTP credentials, OAuth secrets, webhook secrets, and provider access keys.
2. **Never place a literal secret inside a terminal command** where it could appear in command history, logs, screenshots, process listings, Antigravity transcripts, or task reports.
3. **Never print an environment variable value just to verify its existence.** You may report presence/absence, e.g., `RENDER_API_TOKEN: PRESENT` without showing the actual value.
4. **Never search shell history, credential managers, config folders, local files, or environment variables for credentials unless explicitly authorized.** If a secret is unexpectedly encountered, STOP immediately and report only the secret type and location.
5. **If a secret appears in any transcript, log, or report, treat it as potentially compromised** and recommend revocation/rotation.

## Additional External Provider Access Rules (New)

7. Having access to a credential does **not** imply permission to use it.
8. **Do not invoke** Render, Vercel, GitHub, Neon, Supabase, Google, SMTP, or any external provider APIs merely because credentials are available.
9. External provider actions must be explicitly authorized within the current task scope.
10. Do not inspect unrelated projects, services, databases, organizations, users, billing, environment variables, secrets, or logs.
11. Do not broaden access beyond the exact Avenquis resource required for the current task.

## Additional Git Control Rules (New)

12. Never commit unless the current task explicitly permits commit.
13. Never push unless the current task explicitly permits push.
14. If the instruction says inspection only, audit only, verify only, or forbids commit/push, treat that restriction as absolute.
15. Successful tests or builds do **not** grant permission to commit or push.
16. Never force‑push or rewrite published history without explicit approval.

## Additional Deployment Control Rules (New)

17. Never deploy to production unless the current task explicitly authorizes deployment.
18. If pushing to GitHub automatically triggers Vercel or Render deployment, treat the push as a production‑affecting action.
19. Therefore, if deployment is not authorized, **do not** push a commit that will trigger deployment.
20. Never trigger Render/Vercel deployments merely because a build succeeded.
21. Never use a raw Bearer token directly in curl or other commands to access production providers; use approved secure mechanisms.
22. Never change production environment variables without explicit approval.
23. Never delete production environment variables without explicit approval.

## Additional Database Safety Rules (New)

24. Never use production database credentials for local automated tests by default.
25. Never point tests at production data.
26. Never mutate production data during debugging, diagnosis, audit, or verification unless explicitly authorized for the exact write operation.
27. Never drop, truncate, reset, or destructively migrate production data without explicit approval and a recovery plan.

## Additional Auth / RBAC / Tenant Security Rules (New)

28. Never weaken authentication to make a feature work.
29. Never weaken RBAC to bypass an authorization problem.
30. Never weaken tenant isolation.
31. Never disable cookie security, CORS security, CSRF protection, or other security controls simply to make login work.
32. Always verify whether you are modifying `avenquis_main` or `avenquis_contrl_panel` before changing authentication logic.
33. Do **not** copy Control Panel authentication assumptions into Main.
34. Specifically, do **not** introduce PLATFORM_SUPER_ADMIN requirements into Avenquis Main firm‑user authentication unless the approved architecture explicitly requires it.
35. X‑Firm‑Id or other tenant context must come from legitimate authenticated firm membership. Never hardcode a production firm ID.

## Additional Production Claims Rules (New)

36. Never claim LIVE, production healthy, completely fixed, production ready, or bug‑free without direct verification.
37. A successful build is NOT proof of a successful deployment.
38. A successful Git push is NOT proof that production works.
39. Do not claim a database/provider is down, paused, missing, broken, or misconfigured unless verified against the correct target environment.
40. Clearly distinguish CONFIRMED, UNVERIFIED, and INFERRED states.

## Additional Temporary Files Rules (New)

41. Never create temporary scripts containing credentials.
42. Never commit `.env`, `.env.local`, `.env.test`, credential files, private keys, tokens, session data, or secret caches.
43. Safe `.env.example` files may contain variable names and placeholder values only.

## Additional Mandatory Stop Conditions (New)

STOP immediately and report if:
- a secret is unexpectedly exposed
- a command would print a credential
- an unauthorized production action is required
- an unexpected local modification could be overwritten
- production data may be damaged
- cross‑tenant access is discovered
- auth bypass is discovered
- required action conflicts with SKILL.md or STRICT_RULES.md
- the task requires a commit/push/deploy that was not explicitly authorized

Stopping is correct behavior.

## Additional Pre‑Action Check (New)

Before ANY commit, push, deployment, production API call, production database write, environment‑variable change, credential rotation, or provider configuration change, verify:
1. Exact target is known.
2. Current task explicitly permits the action.
3. Git branch/status is understood.
4. No secret will be exposed.
5. Security and tenant isolation remain intact.
6. Required tests/checks have been performed.
7. Recovery/rollback is understood where relevant.
8. User approval exists when required.

If ANY condition fails, STOP.

## Additional Governance Incident Rule (New)

If Antigravity violates any of these rules, report it as a **GOVERNANCE INCIDENT** stating:
- rule category violated
- action occurred
- resource affected
- whether production may have been affected
- required remediation
Never repeat exposed credentials in the incident report.

## Additional Final Priority (New)

When uncertain, protect in this order:
**DATA → SECURITY → AUDIT INTEGRITY → WORKING FUNCTIONALITY → REPOSITORY HISTORY → DEPLOYMENT STABILITY → UI POLISH**

--- End of Additional Rules ---
