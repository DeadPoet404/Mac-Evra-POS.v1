# Phase 7 — persistent trade-in intake, approval, and physical receipt

Phase 7 replaces the local `/trade-in` and `/manager/approvals` demonstrations with a persistent, store-scoped workflow built on the existing Supabase Auth, effective RBAC, inventory, movement, and immutable audit foundations. It does not change Phase 6 sale or payment behavior.

The forward-only migration is `supabase/migrations/20261124010000_phase_07_trade_ins.sql`. Phases 1–6 are not edited or replayed. This migration was not applied to hosted Supabase during implementation.

## Deliberate business boundary

A trade-in request is not a sale, payment, payout, refund, return, or inventory row.

- Employees enter a **non-final proposed offer** in integer Ghana pesewas. No automatic valuation formula exists.
- Manager approval accepts that proposal for the workflow only. It does not pay the customer, settle cash, apply sale credit, change a sale total, reserve a replacement, mark a sale paid, or create inventory.
- Physical receipt is a separate action requiring the existing `manage_inventory` permission in addition to trade-in approval authority.
- No replacement device is required at any stage.
- Phase 6 remains one exact full payment per one-device sale. Trade-in state is never joined to sale totals or payment confirmation.

A future customer payout, deterministic valuation policy, blacklist/ownership provider, trade-in sale credit, or serial-capable sellable inventory model requires a separate reviewed phase.

## Employee workflow

`/trade-in` is protected by `access_employee_workspace` and `process_trade_ins`. It is server-rendered and writes only through server actions that call authenticated database RPCs.

1. **Start or resume** — `create_trade_in_draft` creates one draft per employee/store or returns the existing draft. An advisory transaction lock plus a partial unique index makes concurrent starts safe.
2. **Customer** — persist full name, practical phone, and optional normalized email.
3. **Device identity** — persist brand, model, storage, colour, and exactly one identity type:
   - IMEI: exactly 15 digits and valid under the existing Luhn rule;
   - serial: 4–80 normalized supported characters, with no invented IMEI.
4. **Structured inspection** — persist cosmetic condition plus display, battery, camera, buttons/ports, connectivity, biometric, activation-lock, and other-function results. `unknown`, `not_tested`, and `not_applicable` are explicit values rather than implicit passes. Battery health is optional at request time.
5. **Offer and submit** — persist a positive integer-pesewa proposal and optional supporting notes, lock the request into `pending`, and append `trade_in.submitted`.

Each successful step advances persisted `progress_step`. Reloading or leaving the route does not discard saved work. A URL cannot skip beyond the last persisted step. Employees can read only their own store-scoped requests and cannot directly insert or update table rows.

## Request states

| State | Meaning | Permitted next state |
| --- | --- | --- |
| `draft` | Employee-owned, resumable, not visible in another manager's review queue | `pending` |
| `pending` | Submitted immutable customer/device/inspection/offer snapshot | `approved` or `declined` |
| `approved` | One manager approval recorded; inventory still unchanged | `intaken` after separate physical receipt |
| `declined` | Terminal decision; inventory unchanged | none |
| `intaken` | Terminal physical receipt linked to existing inventory | none |

Request identity/requester fields never change. Once submitted, customer, contact, device, identifier, inspection, proposal, notes, progress, and submission time are immutable. Once decided, decision, note, approver, approved amount, and decision time are immutable. Deletes are rejected.

## Manager review

`/manager/approvals` requires `access_manager_workspace` and `review_approvals` for queue visibility. The database RLS policy restricts the queue to submitted requests in the manager's active store. The page shows persisted customer/contact, device, exact identity, every inspection result, proposal, requester, timestamps, notes, and prior decision/intake attribution.

A decision additionally requires effective `approve_trade_ins` in both the server action and database RPC. Role defaults are not trusted; an explicit denied permission override wins.

`decide_trade_in_request`:

1. validates `approved` or `declined` and a trimmed 10–1,000 character note;
2. locks the request row;
3. resolves the caller from `auth.uid()` and rechecks active profile, store, membership, and effective permission;
4. rejects a requester deciding their own request;
5. requires the current state to be exactly `pending`;
6. records the decision, trusted actor membership/name, approved proposal when applicable, and database timestamp; and
7. appends exactly one `trade_in.approved` or `trade_in.declined` audit event.

The row lock serializes concurrent decisions. A second decision sees the committed non-pending state and fails. The application refreshes the queue and reports that another manager already decided it.

## Separate physical receipt and inventory safety

Approval alone never calls an inventory function and is verified by pgTAP and concurrency tests to leave inventory empty/unchanged.

`intake_approved_trade_in` requires effective `manage_inventory`, locks the request, and accepts only `approved`. Decision authority is not reused as an inventory authority. The intake also requires explicit physical identity and condition attestations plus a meaningful intake note and positive integer-pesewa selling price.

The current inventory and sale foundations require a globally unique Luhn-valid IMEI. Therefore a request is eligible for sellable intake only when:

- its request identity is IMEI, not serial-only;
- cosmetic condition is `excellent`, `good`, or `fair`;
- display, battery, cameras, buttons/ports, connectivity, and activation lock are `pass`;
- biometric and other functionality are `pass` or `not_applicable`; and
- battery health is present.

Serial-only trade-ins are fully supported for persistence and manager approval, but remain outside sellable inventory. The system never fabricates an IMEI. A future serial-only inventory path must extend inventory, sale-item snapshots, IMEI verification, and sale completion together so a non-IMEI row cannot become available while the sales path still requires IMEI.

For an eligible physically received request, one transaction:

1. verifies the IMEI does not already exist in `inventory_devices`;
2. reuses or creates the model/storage record;
3. creates the physical device from the approved inspection snapshot;
4. creates an `available` `store_inventory` row using the existing lifecycle;
5. sets `acquisition_source = 'trade_in'` and a unique composite-FK-backed `trade_in_request_id`;
6. stores the approved proposal as `cost_pesewas` and the manager-entered selling price as `price_pesewas`;
7. appends one attributed `intake` inventory movement containing the trade-in provenance;
8. moves the request to `intaken` with trusted actor/time and inventory/device links; and
9. appends `trade_in.physically_intaken` and `inventory.trade_in_intake` audit events.

Any failure rolls back model/device/inventory/movement/request/audit changes together. Duplicate intake is rejected by the locked state and unique request provenance. Existing reservation and payment rules are unchanged.

## Acquisition cost and read access

`store_inventory.cost_pesewas` retains the Phase 2 column-level restriction. Adding acquisition provenance does not grant that column to normal authenticated employees. Employee inventory reads continue to select only the existing safe fields. The intake RPC writes cost using trusted approved request state; the browser does not supply an acquisition cost.

Trade-in request owners can see their own proposal and decision status. That workflow visibility does not grant access to acquisition cost columns on any inventory row.

## Database security

`trade_in_requests` uses:

- store-scoped composite foreign keys for requester, decision actor, intake actor, and final inventory link;
- globally unique active IMEI/serial partial indexes to prevent one physical identity from being processed twice concurrently;
- enabled and forced RLS;
- authenticated `SELECT` only, with no direct authenticated insert/update/delete grant;
- owner-only draft/request visibility for employees;
- submitted-only same-store visibility for `review_approvals`;
- fixed-empty-`search_path` `SECURITY DEFINER` RPCs;
- least-privilege explicit function execution grants;
- row/advisory locks for draft creation, decisions, and intake; and
- immutable lifecycle/audit triggers and constraints.

Every RPC derives store relationships, actor user, actor membership, effective permissions, display-name attribution, and timestamps from trusted database/Auth context. Browser-supplied actor, membership, store, status, and timestamp values are not accepted.

## Validation

`supabase/tests/007_trade_ins.test.sql` covers:

- schema, integer-pesewa fields, forced RLS, and provenance uniqueness;
- direct-write denial, one resumable employee draft, and persisted progress;
- phone/email normalization, exact IMEI Luhn validation, and supported serial normalization;
- explicit unknown/not-tested inspection values;
- owner-only and cross-store visibility;
- effective permission denial and self-approval rejection;
- meaningful notes, pending-only decisions, duplicate decisions, and trusted attribution;
- approval/decline leaving inventory untouched;
- separate physical attestations and eligibility;
- successful atomic intake, existing lifecycle state, restricted cost, movement/audit provenance, and duplicate-intake rejection;
- serial-only no-IMEI behavior and rollback/no-partial-inventory paths; and
- submitted/decision immutability.

`tests/trade-in-policy.test.mjs` covers application-side normalization, exact pesewa conversion, absence of automatic valuation, guided/resume behavior, fail-closed inventory eligibility, queue search, and meaningful notes.

`scripts/test-trade-in-concurrency.mjs` creates separate authenticated employee and manager sessions against local Supabase, submits one request, and races approval against decline. Exactly one decision succeeds, exactly one fails as non-pending, one attributed decision audit exists, and inventory remains untouched.

Run all gates against disposable local Supabase:

```bash
npm ci
npm run supabase:start
npm run db:reset
npm run db:lint
npm run db:test
npm run db:test:inventory-concurrency
npm run db:test:sales-concurrency
npm run db:test:payment-concurrency
npm run db:test:trade-in-concurrency
npm run db:test:auth-concurrency
npm run db:test:auth-sessions
npm test
npm run lint
npm run typecheck
npm run build
git diff --check
npm run supabase:stop -- --no-backup
```

All concurrency scripts reject non-local Supabase URLs.

## Operations checklist

Before approving a hosted deployment:

1. Review the migration and confirm Phases 1–6 are unchanged.
2. Reset a disposable fresh local database from every migration and run all pgTAP/application/concurrency gates.
3. Sign in as an employee, save each trade-in step, reload between steps, and verify the same draft resumes.
4. Submit IMEI and serial requests and verify no replacement device is requested.
5. Sign in as a review-only manager and confirm queue visibility without decision controls/authority.
6. Confirm a requester-manager cannot self-decide and another authorized manager can decide once with a meaningful note.
7. Confirm approval and decline create no inventory, sale, payment, reservation, payout, or revenue change.
8. For an eligible approved IMEI device, physically match the identifier and condition, complete separate intake, and verify one available stock row, one intake movement, trade-in provenance, and attributed audit events.
9. Verify a serial-only, unknown/not-tested, issue, duplicate-IMEI, unconfirmed, and replayed intake creates no partial inventory.
10. Verify normal employees still cannot query `cost_pesewas`.
11. Verify the existing `/new-sale` payment/customer/completion journey and manager employee-management workflow remain intact.

## Hosted deployment boundary

Do not apply Phase 7 during review. After merge and explicit production approval, use the normal forward-only workflow:

```bash
npx supabase login
npx supabase link --project-ref vyjqmwgyriebgzajmmax
npx supabase migration list --linked
npx supabase db push --dry-run
npx supabase db push
```

Never use `db reset --linked`, manually replay migration statements, expose credentials, or mark this migration applied without executing it. After deployment, repeat the operations checklist with controlled non-production fixtures before enabling real intake.
