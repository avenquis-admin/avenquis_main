# AVENQUIS Backend Core Expansion — 17 September 2026

## Added / extended

- People profiles API
- Attendance API
- Performance review API
- Payroll / allowance basic API
- Calendar aggregate API (native calendar events + task due dates)
- Reports summary API
- Core dashboard summary API
- Basic Client Portal access and document-request workflow
- AI assist endpoint foundation using the existing mock PET provider; responses are explicitly draft/human-review-required
- Authenticated change-password flow
- Password reset token request/reset flow (development returns token until email delivery is implemented)
- Client archive / restore
- Engagement archive / restore
- Development seed users for Manager, Staff and Articled Student
- Expanded RBAC permissions for V1 business roles
- Corrected firm settings write permission to use `firm:admin`

## New endpoints

### Auth
- POST /api/v1/auth/change-password
- POST /api/v1/auth/request-password-reset
- POST /api/v1/auth/reset-password

### People
- GET /api/v1/people
- GET /api/v1/people/:id
- POST /api/v1/people
- PATCH /api/v1/people/:id

### Attendance
- GET /api/v1/attendance
- POST /api/v1/attendance
- PATCH /api/v1/attendance/:id

### Performance
- GET /api/v1/performance
- POST /api/v1/performance
- PATCH /api/v1/performance/:id

### Payroll / allowance
- GET /api/v1/payroll
- POST /api/v1/payroll
- PATCH /api/v1/payroll/:id

### Calendar / Reports / Dashboard
- GET /api/v1/calendar
- POST /api/v1/calendar
- GET /api/v1/reports/summary
- GET /api/v1/dashboard/summary

### Client Portal basic
- GET /api/v1/client-portal/access
- POST /api/v1/client-portal/access
- PATCH /api/v1/client-portal/access/:id
- GET /api/v1/client-portal/document-requests
- POST /api/v1/client-portal/document-requests
- PATCH /api/v1/client-portal/document-requests/:id

### AI foundation
- POST /api/v1/ai/assist

### Archive / Restore
- POST /api/v1/clients/:id/archive
- POST /api/v1/clients/:id/restore
- POST /api/v1/engagements/:id/archive
- POST /api/v1/engagements/:id/restore

## Database migration

New migration: `src/db/migrations/0008_core_app_expansion.sql`

Run:

```bash
npm run db:migrate
npm run db:seed
```

## DEV test credentials

Password for all seeded development accounts: `password123`

- Platform admin / firm-1 manager: admin@avenquis.com
- Firm-1 owner: user1@firm1.com
- Firm-1 manager: manager1@firm1.com
- Firm-1 staff: staff1@firm1.com
- Firm-1 articled student: student1@firm1.com
- Firm-2 partner: user2@firm2.com

## Verification status

Changed TypeScript source files pass parser/syntax validation.
A full project typecheck/build could not be completed in the execution environment because `npm ci` timed out and left `node_modules/@types` incomplete. Run `npm ci && npm run typecheck && npm test && npm run build` in the normal local/CI environment before deployment.

## Not production-complete yet

- Email delivery for password reset is not implemented. In development only, the reset token is returned in the response.
- Gemini/OpenAI PET providers are not implemented in this backend build. `/ai/assist` currently works only with the existing `mock` PET provider.
- Finance and Admin/HR dedicated firm roles remain V2 by current product decision.
- Client Portal is a basic access/request workflow, not the complete production portal.
- Payroll is a record API, not a statutory payroll/tax calculation engine.
