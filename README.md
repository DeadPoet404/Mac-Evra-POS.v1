# Mac Evra POS

Mac Evra POS is an employee-assisted iPhone retail point-of-sale interface for a retail business in Ghana. It uses Next.js App Router, React, TypeScript, Tailwind CSS, shadcn/ui, Lucide icons, and a Supabase PostgreSQL/Auth foundation.

## Current status

The employee sale flow and manager workspace remain demonstration interfaces. Phase 1 provides the Supabase identity/RBAC foundation, and Phase 2 provides persistent physical inventory, append-only history, and atomic reservation RPCs. Both reviewed migrations are merged and applied to the hosted project.

Phase 3 adds real email/password sign-in, sign-out, SSR session validation, protected employee routes, store-scoped manager permission enforcement, and a review-only invitation/acceptance migration. Roles and permissions are always resolved from database records through the authenticated session; the application never trusts client-supplied role values. The Phase 3 migration has **not** been applied remotely, and no hosted Auth settings, users, stores, or memberships were changed.

Shared demonstration devices remain centralised in `src/lib/inventory.ts`. Secure server-only inventory functions remain intentionally disconnected from the UI in this phase. The selected demo device, customer, and payment are still handed between sale pages with `sessionStorage`; this does not reserve or sell inventory. Sales, payments, customers, trade-ins, refunds, receipts, and reports remain demonstration data.

### Employee routes

| Route | Purpose |
| --- | --- |
| `/` | Employee email/password sign-in |
| `/home` | Employee home and workflow navigation |
| `/inventory` | Search and filter IMEI-level demonstration inventory |
| `/trade-in` | Six-step trade-in and replacement-device preview |
| `/new-sale` | Find or scan a demonstration device |
| `/new-sale/payment` | Record an explicitly unverified demo payment |
| `/new-sale/customer-info` | Collect preview customer details |
| `/new-sale/checkout` | Review the preview sale |
| `/new-sale/complete` | Preview completion state |

### Manager routes

| Route | Purpose |
| --- | --- |
| `/manager` | Store overview and attention queue |
| `/manager/sales` | Demonstration transactions and payment status |
| `/manager/inventory` | Demonstration IMEI-level register |
| `/manager/employees` | Preview profiles, roles, and permissions |
| `/manager/approvals` | Preview sensitive-action requests |
| `/manager/reports` | Demonstration reporting |
| `/manager/settings` | Preview store and POS preferences |

## Supabase foundation

The hosted project inspected for this repository is:

- Project: `Mac Evra project`
- Project ref: `vyjqmwgyriebgzajmmax`
- Region: `eu-west-1`
- PostgreSQL: 17

It was an empty, healthy Supabase project when first inspected. The reviewed Phase 1 and Phase 2 migrations were later applied. Hosted Auth settings remain unchanged, with zero users and no custom SMTP; Phase 3 remains review-only.

Backend files:

- `supabase/config.toml` — local Supabase configuration aligned to PostgreSQL 17
- `supabase/migrations/20261123060000_phase_01_foundation.sql` — stores, profiles, RBAC, memberships, invitations, audit foundation, grants, and RLS
- `supabase/migrations/20261123120000_phase_02_inventory.sql` — applied persistent physical inventory, history, reservation lifecycle, atomic RPCs, grants, and RLS
- `supabase/migrations/20261123180000_phase_03_employee_auth.sql` — review-only invitation preparation and acceptance functions; not applied remotely
- `supabase/seed.sql` — one clearly labelled local development store; no users, credentials, inventory, or financial records
- `supabase/tests/001_foundation_rls.test.sql` — pgTAP foundation policy tests
- `supabase/tests/002_inventory_reservations.test.sql` — pgTAP inventory integrity and reservation tests
- `supabase/tests/003_employee_auth.test.sql` — pgTAP invitation, role-assignment, suspension, and anonymous-access tests
- `scripts/test-inventory-concurrency.mjs` — local-only two-client reservation contention test
- `scripts/test-auth-sessions.mjs` — local-only email/password and separate-session access test
- `.github/workflows/validation.yml` — Node 24 application checks and disposable local Supabase database validation
- `src/lib/auth/` — trusted access resolution, route policy, and server-only staff provisioning
- `src/lib/supabase/client.ts` — browser client
- `src/lib/supabase/server.ts` — cookie-aware Server Component/server-action client
- `src/lib/supabase/admin.ts` — server-only Auth Admin client
- `src/lib/inventory-server.ts` — authenticated server-only inventory reads and reservation RPC wrappers
- `src/lib/supabase/proxy.ts` and `src/proxy.ts` — Next.js 16 session refresh and route enforcement

See `docs/supabase-foundation.md`, `docs/inventory-phase-2.md`, and `docs/employee-auth-phase-3.md` for the security and operational boundaries of each phase.

## Local setup

### Requirements

- Node.js 24 or newer
- npm
- Docker Desktop or another Docker-compatible daemon

### Install and configure

```bash
npm ci
cp .env.example .env.local
npm run supabase:start
npx supabase status
```

`src/app/globals.css` imports `tw-animate-css` by its package name. This is the portable Tailwind CSS 4 form because the package exposes its stylesheet through its `style` export. If that import cannot be resolved, use Node.js 24 or newer and rerun `npm ci`; do not replace it with a relative path into `node_modules`.

Copy the local API URL and local publishable key reported by `supabase status` into `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
APP_URL=http://localhost:3000
STAFF_INVITATION_EMAIL_ENABLED=false
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only and is not needed by the browser or normal authenticated SSR client. Never prefix it with `NEXT_PUBLIC_`, expose it in client components, or commit its value. Keep invitation delivery disabled until SMTP and exact redirect URLs are configured.

Apply migrations and the safe local seed, then run the database tests:

```bash
npm run db:reset
npm run db:lint
npm run db:test
```

Start Next.js:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). To expose the development server on all interfaces:

```bash
npm run dev -- --hostname 0.0.0.0
```

Stop the local Supabase stack when finished:

```bash
npm run supabase:stop
```

## Hosted migration workflow

Do not run `db reset` against a hosted project. After a migration is reviewed and remote application is explicitly approved:

```bash
npx supabase login
npx supabase link --project-ref vyjqmwgyriebgzajmmax
npx supabase db push
```

The login flow must be completed directly through the Supabase CLI/browser. Do not share access tokens, database passwords, API keys, or service-role credentials in chat or GitHub.

## Authentication status

Email/password sign-in and sign-out are implemented. Next.js Proxy validates Auth tokens, protected server layouts enforce effective store permissions, and suspended profiles or memberships fail closed. The application has no public registration endpoint or UI.

Hosted onboarding is still blocked: email confirmation is required, no custom SMTP is configured, the site URL remains localhost, the redirect allow-list is empty, public signup remains enabled at provider level, and there is no production store or first administrator. No hosted Auth setting was changed in Phase 3. See `docs/employee-auth-phase-3.md` for the reviewed sequence required before enabling invitation delivery.

## Quality checks

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm run db:lint
npm run db:test
npm run db:test:inventory-concurrency
npm run db:test:auth-sessions
```

The database commands require the local Supabase Docker stack. The concurrency test refuses non-local Supabase URLs and creates disposable local Auth/inventory fixtures; reset the local database afterwards. The app uses a system font stack, so production builds do not depend on downloading a Google font.

## Security boundaries

- The browser receives only the Supabase URL and publishable key.
- Email/password credentials are submitted to a server action and authentication errors do not disclose account existence.
- Proxy and protected server layouts deny anonymous routes and resolve permissions from trusted database records.
- RLS and table privileges deny anonymous application-table access.
- Employees can read their own profile and membership plus their active store.
- Managers receive store-scoped employee-access and audit visibility through permissions.
- Direct client writes to memberships, invitations, role assignments, overrides, stores, and audit events are denied.
- A member may update only their own `display_name` and `phone` columns.
- Permission overrides take precedence over role defaults.
- Audit events and inventory movements are append-only and reject update/delete operations.
- Physical-device IMEIs are globally unique and must pass 15-digit Luhn validation.
- Inventory reservation, release, and expiry are transactional RPCs that recheck membership and permissions.
- Normal employees cannot read acquisition cost or write inventory tables directly.
- Service-role Auth Admin access is isolated in a `server-only` module and is never used by browser code.
- Staff invitation preparation and acceptance derive actor identity from the authenticated session and never accept caller-supplied actor IDs.
- Persistent inventory remains disconnected from the demonstration workflows; no sale, payment, or financial state is authoritative yet.

## Important production blockers

Later phases must add persistent customers, authenticated UI integration, trusted inventory intake/adjustment commands, transactional sales, trusted split-payment confirmation, trade-in inspection/valuation/approval, receipts, refunds, returns, reporting, provider reconciliation, monitoring, backups, and end-to-end tests.

Employee-entered payment references, UI inspection results, and preview approval decisions remain unverified demonstration data until those trusted workflows are implemented.
