# Opening stock — supplier intake, staged receiving, and approved activation

Opening stock adds a persistent, store-scoped workflow for supplier invoices, model registration, physical-device receiving, manager-only purchase costs, audited corrections, and protected activation/repricing. It is a forward-only migration after Phases 1–6; earlier migrations are not edited or replayed. It is independent of the trade-in workflow.

The core rule is that a physically received device is **staged and non-sellable**. It does not create `inventory_devices`, `store_inventory`, a reservation, a sale candidate, or an acquisition-cost read for employees. Only a manager with pricing-approval authority can activate a staged unit after explicitly confirming a positive approved sale price.

## Manager route

`/manager/opening-stock` requires `access_manager_workspace` and `manage_inventory`. Its server actions additionally require `approve_inventory_adjustments` for activation and repricing. The page reads only six permission-checked views through the caller's cookie-authenticated SSR session.

The UI supports:

1. registering or refreshing a store model catalogue entry;
2. creating a supplier invoice and adding invoice lines with integer-pesewa purchase costs;
3. correcting invoice identity, quantity, or pre-receipt cost with an append-only before/after ledger and reason;
4. receiving one device or a batch of up to 100 devices with real IMEIs and eight explicit inspection attestations;
5. reviewing separate invoiced, received, staged, activated, and outstanding quantities;
6. activating staged units into the existing IMEI-level available inventory; and
7. repricing available activated units with an expected-price optimistic lock and an immutable price-change ledger.

## Migration and data model

`supabase/migrations/20261124000000_opening_stock_intake.sql` adds:

- `opening_stock_models` — store registrations of the existing global `device_models` catalogue;
- `supplier_invoices` and `supplier_invoice_lines` — bounded supplier identity, GHS currency, quantity, and manager-restricted `unit_cost_pesewas`;
- `opening_stock_units` — physically received, inspected, staged or activated units with immutable identity and a private purchase-cost snapshot;
- `supplier_invoice_corrections` — append-only attributed before/after corrections;
- `opening_stock_price_changes` — append-only attributed approved price changes; and
- six `security_invoker`/`security_barrier` views, including `opening_stock_invoice_lines_view` with all five separate quantity columns.

Every new table has enabled and forced RLS. Composite foreign keys bind units, lines, models, inventory, actors, memberships, and stores together. Received-unit identity, inspection, cost, actor, and timestamps become immutable after receiving. Correction and price-change rows reject update/delete through triggers. Units cannot be deleted.

All money is integer GHS pesewas. Dates are bounded to non-future Africa/Accra dates. Supplier names, invoice numbers, SKUs, notes, reasons, colours, conditions, battery health, and inspection notes are length-, character-, and control-character validated. IMEIs must be 15 digits with a valid Luhn check digit; known test/placeholder TACs, repeated TACs, and sequential placeholders are rejected. The inspection JSON must contain exactly the allowed fields and eight passing boolean checks.

## Transaction boundaries

All writes go through `SECURITY DEFINER` RPCs with `set search_path = ''`. The browser never supplies an actor, membership, store, status, timestamp, audit event, or permission value.

- Registration, invoice creation, line addition, and corrections derive the store from a locked trusted invoice/catalogue chain and the actor from `auth.uid()` plus the active membership lock reused from Phase 5.
- Batch receiving validates the complete JSON shape first, locks the invoice and invoice line, rechecks the invoice quantity, locks normalized IMEIs in deterministic order, checks both staged units and existing sellable devices, then inserts every unit atomically. A rejected batch leaves no partial unit, movement, or audit row.
- Activation locks the staged unit, rechecks membership plus `approve_inventory_adjustments`, revalidates the stored IMEI/inspection, locks the IMEI, creates one `inventory_devices` row and one `available` `store_inventory` row with the immutable invoice-line cost, appends one `intake` movement, marks the unit activated, and writes one attributed audit event. All of it commits or rolls back together.
- Repricing locks the activated unit and its inventory row, rejects reserved/sold inventory, requires both the submitted expected price and the listed price to match the current approved price, updates both prices, writes one price-change row, one `adjustment` movement, and one attributed audit event. Concurrent stale submissions serialize on the unit row lock; only one can win.

`pg_advisory_xact_lock(hashtext(imei))` is taken in deterministic order before cross-table IMEI availability checks. Unique constraints on staged IMEIs, physical-device IMEIs, inventory identity, and price/correction ledgers remain final guards against duplicate or replayed operations.

## Access and cost controls

Authenticated users receive `SELECT` only on the new views and on column-limited base tables; they receive no `INSERT`, `UPDATE`, or `DELETE` grant on workflow tables. Anonymous users receive no grants. Anon, authenticated, and service-role privileges are revoked before narrow grants are applied. RPC execution is granted to `authenticated` only; internal private helpers are revoked from `PUBLIC` and selectively granted.

Purchase cost is never granted directly to authenticated users. `private.opening_stock_cost_visible(store_id)` requires an active same-store membership, `access_manager_workspace`, and `manage_inventory`. Private, permission-checked cost helpers return the cost only inside `security_invoker` views and return `null` otherwise. Correction history, whose before/after JSON may contain cost, is visible only through the same cost permission. The existing `store_inventory.cost_pesewas` grant remains excluded. Activation writes that cost into sellable inventory through a trusted definer transaction without exposing a raw cost column to browsers.

Manager-workspace-only rows remain store scoped. A cross-store manager, a member whose `manage_inventory` override is denied, an employee without manager access, and an anonymous caller cannot read cost or perform protected writes. Explicit permission overrides continue to take precedence over role defaults.

## Validation

`tests/opening-stock-policy.test.mjs` covers route permissions, real-IMEI validation, batch parsing, inspection attestations, integer-pesewa parsing, bounded invoice/correction/activation/repricing inputs, cost permission, and quantity summaries.

`supabase/tests/007_opening_stock_intake.test.sql` covers:

- schema, forced RLS, cost-column grant denial, IMEI and inspection validators;
- registration/invoice/line setup and all five quantity columns;
- staged isolation from `store_inventory` and reservations;
- atomic invalid, duplicate, and over-quantity batch rejection;
- audited corrections, no-op rejection, short-reason rejection, quantity-below-received rejection, and cost immutability after receipt;
- manager-only cost masking, employee/anonymous/cross-store/override denial;
- activation with pricing approval, replay denial, duplicate IMEI denial, intake movement, inventory cost/price, and audit attribution;
- repricing with optimistic lock, reserved-inventory protection, adjustment movement, immutable cost, price-change ledger, and audit attribution; and
- append-only ledgers and non-deletable units.

`scripts/test-opening-stock-concurrency.mjs` uses two authenticated local manager sessions to race one duplicate IMEI receipt, one concurrent activation, and two repricing submissions. It asserts one winner per race and the persisted unit, inventory, movement, ledger, price, cost, and audit counts. The script refuses non-local Supabase URLs.

CI rebuilds a disposable database from migrations, lints it, runs all pgTAP suites, and then runs inventory, sale, payment, opening-stock, auth, and session integration scripts. Run the equivalent checks locally only against a disposable local stack:

```bash
npm ci
npm run supabase:start
npm run db:reset
npm run db:lint
npm run db:test
npm run db:test:inventory-concurrency
npm run db:test:sales-concurrency
npm run db:test:payment-concurrency
npm run db:test:opening-stock-concurrency
npm run db:test:auth-concurrency
npm run db:test:auth-sessions
npm test
npm run lint
npm run typecheck
npm run build
npm run supabase:stop -- --no-backup
```

## Manual review checklist

1. Reset a disposable local database and sign in as a manager with `manage_inventory`.
2. Register a model, create an invoice, and add two lines. Confirm purchase cost is visible only to a membership with both manager workspace and inventory permissions.
3. Try an invalid Luhn digit, a known placeholder, a missing inspection checkbox, a duplicate batch IMEI, and a batch above the outstanding quantity. Confirm every failure is atomic.
4. Receive one device and a batch. Confirm the units are staged and cannot be found in employee inventory or reserved.
5. Correct an unreceived line, then receive a device and confirm its cost is immutable. Confirm correction history includes before/after state, actor, and reason.
6. Remove `approve_inventory_adjustments` from one manager and confirm activation and repricing are denied while receiving still works.
7. Activate a staged unit with explicit price confirmation. Confirm one physical device, one available inventory row, exact approved price, exact immutable cost, one intake movement, and one audit event.
8. Reserve the activated unit, confirm repricing is denied, release it, and race two repricing submissions. Confirm one price change, one adjustment movement, one audit event, unchanged cost, and the winning price in both records.
9. Inspect a normal employee and an anonymous session. Confirm no protected table writes, no raw purchase-cost reads, and no cross-store records.

## Deployment boundary

This migration was prepared for review and was **not** applied to hosted Supabase. No production data, Supabase Auth configuration, Vercel project/configuration, or hosted migration state was changed. After review, the owner may inspect linked migration history and follow the normal forward-only workflow. Never use `db reset --linked`, replay statements manually, or mark this migration applied without executing it.

## Deliberate exclusions

Opening stock does not add supplier payments/accounts payable, purchase orders, goods-return notes, barcode scanner hardware integration, automated IMEI/device-registry verification, supplier reconciliation, warranty terms, repairs, trade-in valuation/settlement, returns, refunds, receipts, partial receiving of one physical unit, or editing/deleting received units. Those require separate reviewed transaction models and permissions.
