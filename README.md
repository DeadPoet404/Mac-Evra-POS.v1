# Mac Evra POS

Mac Evra POS is an employee-assisted iPhone retail point-of-sale interface for a retail business in Ghana. It uses Next.js App Router, React, TypeScript, Tailwind CSS, shadcn/ui, Lucide icons, and a Supabase PostgreSQL/Auth foundation.

## Current status

Phases 1–4 provide the Supabase identity/RBAC foundation, persistent physical inventory and reservations, authenticated employee access, secure invitations, and audited employee management.

Phase 5 adds persistent store-scoped customers, employee-owned sale drafts, immutable IMEI-level sale-item snapshots, trusted integer-pesewa totals, reservation-backed draft editing/cancellation, and a real manager sale register. The browser never supplies authoritative prices, totals, stores, actors, or permissions. The Phase 5 migration is prepared for review and has **not** been applied to hosted Supabase.

Payments remain deliberately unimplemented. A Phase 5 sale can only be `draft`, `awaiting_payment`, or `cancelled`; it cannot be paid or completed, and checkout never marks inventory sold. Trade-ins, refunds, receipts, payment reconciliation, and aggregate reporting remain later-phase or demonstration functionality.

### Employee routes

| Route | Purpose |
| --- | --- |
| `/` | Employee email/password sign-in |
| `/home` | Employee home and workflow navigation |
| `/inventory` | Search real RLS-scoped IMEI-level inventory |
| `/trade-in` | Six-step trade-in and replacement-device preview |
| `/new-sale` | Create, save, resume, edit, expire, and cancel persistent sale drafts |
| `/new-sale/customer-info` | Search, select, create, or clear a persistent customer |
| `/new-sale/checkout` | Review trusted totals and submit only to awaiting payment |
| `/new-sale/payment` | Explicit Phase 6 boundary; accepts no payment input |
| `/new-sale/complete` | Awaiting-payment status with no paid/completed claim |

### Manager routes

| Route | Purpose |
| --- | --- |
| `/manager` | Store overview and attention queue |
| `/manager/sales` | Real store-scoped sale drafts, items, customers, totals, and employee attribution |
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

It was an empty, healthy Supabase project when first inspected. Later read-only verification found Phases 1–3 recorded, custom SMTP configured, and an intentional first-administrator bootstrap. Phase 4 and Phase 5 hosted migration state must be checked with `supabase migration list --linked` before any owner-approved push; this implementation did not change hosted state.

Backend files:

- `supabase/config.toml` — local Supabase configuration aligned to PostgreSQL 17
- `supabase/migrations/20261123060000_phase_01_foundation.sql` — stores, profiles, RBAC, memberships, invitations, audit foundation, grants, and RLS
- `supabase/migrations/20261123120000_phase_02_inventory.sql` — applied persistent physical inventory, history, reservation lifecycle, atomic RPCs, grants, and RLS
- `supabase/migrations/20261123180000_phase_03_employee_auth.sql` — invitation preparation and acceptance functions
- `supabase/migrations/20261123200000_phase_04_employee_management.sql` — audited store membership management
- `supabase/migrations/20261123220000_phase_05_sales_customers.sql` — review-only persistent customers, sale drafts, item snapshots, secure RPCs, grants, and RLS; not applied remotely
- `supabase/seed.sql` — one clearly labelled local development store; no users, credentials, inventory, customers, sales, or financial records
- `supabase/tests/001_foundation_rls.test.sql` — pgTAP foundation policy tests
- `supabase/tests/002_inventory_reservations.test.sql` — pgTAP inventory integrity and reservation tests
- `supabase/tests/003_employee_auth.test.sql` — pgTAP invitation, role-assignment, suspension, and anonymous-access tests
- `supabase/tests/004_employee_management.test.sql` — pgTAP employee access-management tests
- `supabase/tests/005_sales_customers.test.sql` — pgTAP customer, sale, reservation, isolation, total, discount, cancellation, and audit tests
- `scripts/test-inventory-concurrency.mjs` — local-only two-client reservation contention test
- `scripts/test-sales-concurrency.mjs` — local-only competing sale-draft reservation/item test
- `scripts/test-auth-concurrency.mjs` — deterministic local invitation-acceptance versus profile-suspension lock test
- `scripts/test-auth-sessions.mjs` — local-only email/password, actual captured invitation email, SSR confirmation, password setup, existing-account, and separate-session access test
- `supabase/templates/` — direct invite and magic-link templates that preserve the complete invitation-specific confirmation parameters
- `.github/workflows/validation.yml` — Node 24 application checks and disposable local Supabase database validation
- `src/lib/auth/` — trusted access resolution, route policy, and server-only staff provisioning
- `src/lib/supabase/client.ts` — browser client
- `src/lib/supabase/server.ts` — cookie-aware Server Component/server-action client
- `src/lib/supabase/admin.ts` — server-only Auth Admin client
- `src/lib/inventory-server.ts` — authenticated server-only inventory reads and reservation RPC wrappers
- `src/lib/supabase/proxy.ts` and `src/proxy.ts` — Next.js 16 session refresh and route enforcement

See `docs/supabase-foundation.md`, `docs/inventory-phase-2.md`, `docs/employee-auth-phase-3.md`, and `docs/sales-phase-5.md` for security, transaction, deployment, and operational boundaries.

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

The latest read-only hosted verification found a valid first administrator and custom SMTP, but the site URL and redirect allow-list remained localhost-only and public signup remained enabled. Those Auth production-readiness issues are separate from Phase 5 and were not changed here. See `docs/employee-auth-phase-3.md` for the invitation and Auth boundaries.

## Quality checks

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm run db:lint
npm run db:test
npm run db:test:inventory-concurrency
npm run db:test:sales-concurrency
npm run db:test:auth-concurrency
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
- Password sign-in never consumes invitations; email confirmation accepts one invitation ID using a random database-hashed token and a verified Auth email.
- Profile and store rows remain locked through invitation acceptance so suspension or deactivation cannot race membership creation.
- Repeated invitation preparation rotates the acceptance token, and each preparation and provider delivery result has a separate audit event.
- Persistent sale drafts use trusted inventory prices and reservations; no payment, paid/completed sale, receipt, revenue, or sold-inventory state is introduced by Phase 5.

## Important production blockers

Later phases must add persistent customers, authenticated UI integration, trusted inventory intake/adjustment commands, transactional sales, trusted split-payment confirmation, trade-in inspection/valuation/approval, receipts, refunds, returns, reporting, provider reconciliation, monitoring, backups, and end-to-end tests.

Employee-entered payment references, UI inspection results, and preview approval decisions remain unverified demonstration data until those trusted workflows are implemented.
