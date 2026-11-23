# Mac Evra POS

Mac Evra POS is an employee-assisted iPhone retail point-of-sale interface for a retail business in Ghana. It uses Next.js App Router, React, TypeScript, Tailwind CSS, shadcn/ui, Lucide icons, and a Supabase PostgreSQL/Auth foundation.

## Current status

The employee sale flow and manager workspace remain a frontend demonstration. Phase 1 provides Supabase configuration, SSR clients, session-cookie refresh, foundational identity/RBAC tables, explicit Row Level Security policies, a safe development store seed, and pgTAP policy tests.

The Phase 1 migration has been applied to the hosted project. Phase 2 now prepares persistent inventory, append-only inventory history, and atomic reservation RPCs for review; the Phase 2 migration has **not** been applied remotely. Sales, payments, customers, trade-ins, refunds, receipts, and reports remain demonstration data and are outside Phase 2.

Shared demonstration devices remain centralised in `src/lib/inventory.ts` so the unsigned frontend stays functional. Secure server-only inventory functions are ready in `src/lib/inventory-server.ts`, but the UI is intentionally not connected until an approved employee sign-in flow exists. The selected demo device, customer, and payment are still handed between sale pages with `sessionStorage`; this does not reserve or sell inventory.

### Employee routes

| Route | Purpose |
| --- | --- |
| `/` | Sign-in preview |
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

It was an empty, healthy Supabase project when first inspected: no application tables, Auth users, Storage buckets, Edge Functions, or user-created migrations existed. The reviewed Phase 1 migration was later applied; hosted Auth settings remain unchanged, and Phase 2 remains review-only.

Backend files:

- `supabase/config.toml` — local Supabase configuration aligned to PostgreSQL 17
- `supabase/migrations/20261123060000_phase_01_foundation.sql` — stores, profiles, RBAC, memberships, invitations, audit foundation, grants, and RLS
- `supabase/migrations/20261123120000_phase_02_inventory.sql` — persistent physical inventory, history, reservation lifecycle, atomic RPCs, grants, and RLS; review-only and not applied remotely
- `supabase/seed.sql` — one clearly labelled local development store; no users, credentials, inventory, or financial records
- `supabase/tests/001_foundation_rls.test.sql` — pgTAP foundation policy tests
- `supabase/tests/002_inventory_reservations.test.sql` — pgTAP inventory integrity, isolation, permission, reservation, expiry, release, and history tests
- `scripts/test-inventory-concurrency.mjs` — local-only two-client reservation contention test
- `src/lib/supabase/client.ts` — browser client
- `src/lib/supabase/server.ts` — cookie-aware Server Component/server-action client
- `src/lib/inventory-server.ts` — authenticated server-only inventory reads and reservation RPC wrappers
- `src/lib/supabase/proxy.ts` and `src/proxy.ts` — Next.js 16 session refresh

See `docs/supabase-foundation.md` for Phase 1 and `docs/inventory-phase-2.md` for the Phase 2 schema, lifecycle, security, and integration boundary.

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
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only and is not needed by the browser or normal authenticated SSR client. Never prefix it with `NEXT_PUBLIC_`, expose it in client components, or commit its value.

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

The hosted project currently has email Auth enabled and phone Auth disabled. Google and Apple providers are disabled, while the existing sign-in design presents Google and Apple buttons. Phase 1 therefore does not invent a password or magic-link screen and does not connect those buttons to a disabled provider.

The session proxy and SSR clients are ready, but protected-route redirects are intentionally deferred until an approved sign-in provider is configured. Before production onboarding:

1. Disable public signup and retain invite-only staff onboarding.
2. Select and configure an authentication method that fits the existing sign-in interface.
3. Configure reviewed site and redirect URLs for each environment.
4. Apply manager/administrator MFA requirements.
5. Add trusted invitation and membership-management server operations.

No hosted Auth setting was changed in Phase 1.

## Quality checks

```bash
npm run lint
npm run typecheck
npm run build
npm run db:lint
npm run db:test
npm run db:test:inventory-concurrency
```

The database commands require the local Supabase Docker stack. The concurrency test refuses non-local Supabase URLs and creates disposable local Auth/inventory fixtures; reset the local database afterwards. The app uses a system font stack, so production builds do not depend on downloading a Google font.

## Security boundaries

- The browser receives only the Supabase URL and publishable key.
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
- Service-role access is reserved for trusted server operations and is never used by browser code.
- Persistent inventory is prepared but not connected to the unsigned demonstration UI; no sale, payment, or financial state is authoritative yet.

## Important production blockers

Later phases must add persistent customers, authenticated UI integration, trusted inventory intake/adjustment commands, transactional sales, trusted split-payment confirmation, trade-in inspection/valuation/approval, receipts, refunds, returns, reporting, provider reconciliation, monitoring, backups, and end-to-end tests.

Employee-entered payment references, UI inspection results, and preview approval decisions remain unverified demonstration data until those trusted workflows are implemented.
