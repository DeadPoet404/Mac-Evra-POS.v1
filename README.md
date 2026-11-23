# Mac Evra POS

Mac Evra POS is an employee-assisted iPhone retail point-of-sale interface for a retail business in Ghana. It uses Next.js App Router, React, TypeScript, Tailwind CSS, shadcn/ui, Lucide icons, and a Supabase PostgreSQL/Auth foundation.

## Current status

Phases 1–6 provide the Supabase identity/RBAC foundation, persistent physical inventory and reservations, authenticated employee access, secure invitations and employee management, persistent customers, reservation-backed one-device sale drafts with trusted integer-pesewa totals, and one immutable manually confirmed full payment per completed sale.

Phase 7 replaces both trade-in previews with a persistent store-scoped workflow. Employees resume their own saved customer, device identity, structured inspection, and non-final integer-pesewa offer; managers review real submitted requests and can record one attributed approval or decline only with effective `approve_trade_ins`. Self-approval, cross-store access, direct writes, short notes, replayed decisions, and concurrent duplicate decisions fail closed.

Approval never changes inventory. A separate `manage_inventory`-checked physical-receipt transaction accepts only an approved, sellable, valid-IMEI request with explicit identity and condition attestations. It creates the existing device/store-inventory rows, records trade-in acquisition provenance, appends intake movement/audit history, and stores acquisition cost behind the existing restricted inventory column. Serial-only requests remain supported through approval but cannot be put into the current IMEI-only sellable inventory by inventing an IMEI.

The employee sale route remains exactly IMEI → Payment → Customer details → Sale complete. Trade-ins do not alter sale totals, apply credit, record customer payment/payout, or change Phase 6 payment behavior. The Phase 7 migration is prepared for review and has **not** been applied to hosted Supabase.

### Employee routes

| Route | Purpose |
| --- | --- |
| `/` | Employee email/password sign-in |
| `/home` | Employee home and workflow navigation |
| `/inventory` | Search real RLS-scoped IMEI-level inventory |
| `/trade-in` | Persist and resume customer, device identity, structured inspection, and non-final proposed offer for manager review |
| `/new-sale` | Verify one IMEI and persist its reservation-backed sale |
| `/new-sale/payment` | Show the trusted total and manually confirm one full payment |
| `/new-sale/customer-info` | Capture customer details after successful payment recording |
| `/new-sale/complete` | Show success only from persisted completed sale and payment state |
| `/new-sale/checkout` | Legacy redirect to the payment step |

### Manager routes

| Route | Purpose |
| --- | --- |
| `/manager` | Store overview and attention queue |
| `/manager/sales` | Real store-scoped sale drafts, items, customers, totals, and employee attribution |
| `/manager/inventory` | Demonstration IMEI-level register |
| `/manager/employees` | Preview profiles, roles, and permissions |
| `/manager/approvals` | Real store-scoped trade-in queue, permission-checked decisions, and separate physical intake |
| `/manager/reports` | Demonstration reporting |
| `/manager/settings` | Preview store and POS preferences |

## Supabase foundation

The hosted project inspected for this repository is:

- Project: `Mac Evra project`
- Project ref: `vyjqmwgyriebgzajmmax`
- Region: `eu-west-1`
- PostgreSQL: 17

It was an empty, healthy Supabase project when first inspected. Later read-only verification found Phases 1–3 recorded, custom SMTP configured, and an intentional first-administrator bootstrap. Phase 4–7 hosted migration state must be checked with `supabase migration list --linked` before any owner-approved push; this implementation did not change hosted state.

Backend files:

- `supabase/config.toml` — local Supabase configuration aligned to PostgreSQL 17
- `supabase/migrations/20261123060000_phase_01_foundation.sql` — stores, profiles, RBAC, memberships, invitations, audit foundation, grants, and RLS
- `supabase/migrations/20261123120000_phase_02_inventory.sql` — applied persistent physical inventory, history, reservation lifecycle, atomic RPCs, grants, and RLS
- `supabase/migrations/20261123180000_phase_03_employee_auth.sql` — invitation preparation and acceptance functions
- `supabase/migrations/20261123200000_phase_04_employee_management.sql` — audited store membership management
- `supabase/migrations/20261123220000_phase_05_sales_customers.sql` — persistent customers, sale drafts, item snapshots, secure RPCs, grants, and RLS
- `supabase/migrations/20261123235900_phase_06_manual_payments.sql` — immutable manual payments, atomic completion, grants, and forced RLS
- `supabase/migrations/20261124010000_phase_07_trade_ins.sql` — review-only persistent trade-in lifecycle, structured inspection, manager decisions, safe physical intake, provenance, grants, and forced RLS; not applied remotely
- `supabase/seed.sql` — one clearly labelled local development store; no users, credentials, inventory, customers, sales, or financial records
- `supabase/tests/001_foundation_rls.test.sql` — pgTAP foundation policy tests
- `supabase/tests/002_inventory_reservations.test.sql` — pgTAP inventory integrity and reservation tests
- `supabase/tests/003_employee_auth.test.sql` — pgTAP invitation, role-assignment, suspension, and anonymous-access tests
- `supabase/tests/004_employee_management.test.sql` — pgTAP employee access-management tests
- `supabase/tests/005_sales_customers.test.sql` — pgTAP customer, sale, reservation, isolation, total, discount, cancellation, and audit tests
- `supabase/tests/006_manual_payments.test.sql` — pgTAP manual payment, completion, isolation, fulfilment, immutability, and audit tests
- `supabase/tests/007_trade_ins.test.sql` — pgTAP trade-in RLS, workflow, permissions, identity, decision, physical intake, rollback, provenance, immutability, and audit tests
- `scripts/test-inventory-concurrency.mjs` — local-only two-client reservation contention test
- `scripts/test-sales-concurrency.mjs` — local-only competing sale-draft reservation/item test
- `scripts/test-payment-concurrency.mjs` — local-only duplicate payment-confirmation race test
- `scripts/test-trade-in-concurrency.mjs` — local-only competing manager decision race test
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

See `docs/supabase-foundation.md`, `docs/inventory-phase-2.md`, `docs/employee-auth-phase-3.md`, `docs/sales-phase-5.md`, `docs/manual-payments-phase-6.md`, and `docs/trade-ins-phase-7.md` for security, transaction, deployment, and operational boundaries.

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
npm run db:test:payment-concurrency
npm run db:test:trade-in-concurrency
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
- Sale completion requires one exact, positive integer-pesewa payment, a supported method, explicit employee receipt attestation, an active owned reservation, and the atomic payment/fulfilment/sold/audit transaction.
- Manual payment rows are one-per-sale, forced-RLS protected, append-only, and readable only by the sale employee or an authorised same-store manager.
- A payment reference remains optional employee-entered metadata and is never represented as provider verification.
- The completion route queries persisted sale and payment state and rejects draft, awaiting-payment, cancelled, missing, inaccessible, and payment-less records as success.
- Trade-in drafts and submitted snapshots are store-scoped, forced-RLS protected, and writable only through fixed-search-path authenticated RPCs.
- Employees can read and resume only their own draft/request; reviewers cannot see other employees' drafts and cannot decide without effective `approve_trade_ins`.
- Trade-in submission, approval, decline, and physical intake derive store, actor, membership, permissions, and timestamps from trusted context and append attributed immutable audit events.
- Row locks serialize manager decisions and physical intake; self-approval, duplicate decisions, duplicate intake, and cross-store identifiers are rejected.
- Approval and decline leave inventory untouched. Physical intake separately requires effective `manage_inventory`, exact identity/condition attestations, an eligible valid IMEI inspection, and one atomic provenance/movement/audit transaction.
- Normal employees still cannot read `store_inventory.cost_pesewas`; the approved offer is copied into that restricted column only during successful physical intake.
- Trade-ins never update sales, payments, reservations, customer payouts, or revenue.

## Important production blockers

Later phases must add general trusted inventory adjustment commands, receipts, refunds, returns, provider reconciliation, trade-in payout/settlement policy, broader reporting, monitoring, backups, and end-to-end browser tests. Serial-only devices cannot enter the current IMEI-required sellable inventory unless a separate reviewed inventory-identity extension is delivered; no IMEI may be fabricated.

Manual payment references and employee inspection results are not automatic third-party verification. Any provider-backed payment, deterministic valuation, customer payout, sale-credit, or blacklist/ownership service requires a separate reviewed integration and transaction model.
