# Opening stock — supplier intake, staged receiving, and approved activation

Opening stock adds a persistent, store-scoped workflow for supplier invoices, model registration, physical-device receiving, manager-only purchase costs, audited corrections, and protected activation/repricing. It is a forward-only migration after Phases 1–6; earlier migrations are not edited or replayed. It is independent of the trade-in workflow.

The core rule is that a physically received device is **staged and non-sellable**. It does not create `inventory_devices`, `store_inventory`, a reservation, a sale candidate, or an acquisition-cost read for employees. Only a manager with pricing-approval authority can activate a staged unit after explicitly confirming a positive approved sale price.

## Live manager inventory

`/manager/inventory` is now an authenticated server component. It reads the same RLS-scoped `listAuthorizedInventory(membership.storeId)` loader as the employee inventory route and shows actual persisted `available`, `reserved`, and `sold` rows with search, status filters, and per-device details. It does not use `useState`, `inventoryPhones`, or any browser-only sample devices as inventory. The manager dashboard uses the same live loader for its inventory metric and inventory watch; its sales, chart, approvals, and activity cards remain explicitly labelled interface previews. Opening-stock receiving stays at `/manager/opening-stock`, so staged units are never mixed into the live sellable register.

## Manager route

`/manager/opening-stock` requires `access_manager_workspace` and `manage_inventory`. Its server actions additionally require `approve_inventory_adjustments` for activation and repricing. The page reads only seven permission-checked views through the caller's cookie-authenticated SSR session.

The UI supports:

1. registering or refreshing a store model catalogue entry;
2. creating a supplier invoice with an optional number/reference and an integer-pesewa declared total;
3. adding invoice lines with integer-pesewa purchase costs and persisted `quantity_invoiced × unit_cost_pesewas` line totals;
4. reviewing every line total, line count, quantity, declared total, calculated total, and difference before explicitly confirming the invoice totals;
5. correcting invoice identity, declared total, quantity, or pre-receipt cost with an append-only before/after ledger and reason;
6. receiving one device or an atomic batch of up to 100 devices with real IMEIs and device-scoped colour, condition, battery health, and eight explicit inspection attestations;
7. reviewing separate invoiced, received, staged, activated, and outstanding quantities;
8. activating staged units into the existing IMEI-level available inventory; and
9. repricing available activated units with an expected-price optimistic lock and an immutable price-change ledger.

## Migration and data model

`supabase/migrations/20261124000000_opening_stock_intake.sql` adds:

- `opening_stock_models` — store registrations of the existing global `device_models` catalogue;
- `supplier_invoices` and `supplier_invoice_lines` — bounded supplier identity, an optional number/reference, an integer-pesewa `declared_total_pesewas`, attributed totals confirmation, GHS currency, quantity, manager-restricted `unit_cost_pesewas`, and a generated `line_total_pesewas = quantity_invoiced × unit_cost_pesewas`;
- `opening_stock_units` — physically received, inspected, staged or activated units with immutable identity and a private purchase-cost snapshot;
- `supplier_invoice_corrections` — append-only attributed before/after corrections;
- `opening_stock_price_changes` — append-only attributed approved price changes; and
- seven `security_invoker`/`security_barrier` views, including `opening_stock_invoice_lines_view` with all five separate quantity columns and permission-masked line totals, and `opening_stock_invoice_reconciliation_view` with line count, quantity, declared total, calculated total, difference, reconciliation state, and confirmation state.

Every new table has enabled and forced RLS. Composite foreign keys bind units, lines, models, inventory, actors, memberships, and stores together. Received-unit identity, inspection, cost, actor, and timestamps become immutable after receiving. Correction and price-change rows reject update/delete through triggers. Units cannot be deleted.

All money is integer GHS pesewas. Dates are bounded to non-future Africa/Accra dates. Supplier names, SKUs, notes, reasons, colours, conditions, battery health, and inspection notes are length-, character-, and control-character validated. The supplier invoice number/reference is optional: a blank value becomes SQL `null` and the partial uniqueness index permits more than one unreferenced invoice, while a nonblank value is length-, character-, and control-character validated. IMEIs must be 15 digits with a valid Luhn check digit; known test/placeholder TACs, repeated TACs, and sequential placeholders are rejected. The inspection JSON must contain exactly the allowed fields and eight passing boolean checks. Batch rows are strictly device-scoped; there is no shared colour, condition, battery health, or inspection fallback.

## Unknown battery health (staged units only)

Many inspection screens report `Battery Life: No Data`, so a physically received handset can
have no measurable battery health. Recording such a device used to require inventing a number.
`supabase/migrations/20261126081209_unknown_battery_health_staged_units.sql` closes that gap
without weakening any safeguard:

- `opening_stock_units.battery_health` is nullable, and `opening_stock_units_battery_valid`
  allows `null` **only** while `status = 'staged'`. An activated row must carry an integer in
  1..100. The constraint is wrapped in `coalesce(...)` because `battery_health between 1 and 100`
  evaluates to `NULL` for a `NULL` value, and a CHECK treats `NULL` as satisfied.
- `inventory_devices.battery_health` stays `NOT NULL`, so sellable inventory can never hold an
  unknown reading and employees never see one before a sale.
- `receive_opening_stock_devices` accepts an absent, `null`, blank, or JSON-`null`
  `battery_health` and stores SQL `null`. A *supplied* value that is not a whole percentage is
  still rejected, so a typo cannot be silently stored as "unknown". Every other receiving rule
  is unchanged: real Luhn IMEI, device-scoped colour/condition, all eight passing inspection
  attestations, confirmed invoice totals, active model catalogue, quantity ceiling, deterministic
  IMEI locks and cross-table duplicate checks.
- `activate_opening_stock_unit` refuses a unit whose battery health is still unknown
  (`'record the measured battery health before activation'`) in addition to every existing
  activation guard, including the pricing-approval permission.
- `record_opening_stock_unit_battery_health(unit_id, battery_health)` is the only way to fill the
  gap. It requires `manage_inventory` + `access_manager_workspace` (not pricing approval), locks the
  unit, accepts only a staged unit whose value is currently unknown, accepts only 1..100, and
  writes one attributed audit event. It cannot revise a recorded reading, cannot touch an activated
  unit, and cannot activate anything.
- `private.validate_opening_stock_unit_update` still freezes every physical fact after receiving.
  Battery health joins that list: once measured it is immutable, and on an activated unit it is
  immutable without exception. The single permitted transition is `staged + unknown -> measured`.

In the manager workspace an unmeasured device shows `Not measured` in the Battery column, its price
cell is replaced by a **Record battery** control, and the receiving row explains that a blank field
means "unavailable". Nothing is auto-filled: a blank reading stays `null` and is never coerced to
`0` or `100`.

`tests/unknown-battery-health.test.mjs` and `supabase/tests/010_unknown_battery_health.test.sql`
cover the parser, the staging path, the inspection attestations that are *not* waived, the
pre-activation block, the one-way measurement RPC, and the database-level guards on both tables.

## Transaction boundaries

All writes go through `SECURITY DEFINER` RPCs with `set search_path = ''`. The browser never supplies an actor, membership, store, status, timestamp, audit event, or permission value.

- Registration, invoice creation, line addition, totals confirmation, and corrections derive the store from a locked trusted invoice/catalogue chain and the actor from `auth.uid()` plus the active membership lock reused from Phase 5.
- `confirm_supplier_invoice` locks the invoice, rechecks cost visibility and submitted expected values, recomputes line count, quantity, and the sum of generated line totals, requires exact equality with the declared total, and records an attributed timestamp plus audit event. Adding or correcting a line, or correcting the invoice, clears that confirmation so a later change requires a fresh review.
- Batch receiving validates the complete JSON shape first, including one colour, condition, battery health, and complete inspection document per numbered device, locks the invoice and invoice line, rechecks the invoice quantity, locks normalized IMEIs in deterministic order, checks both staged units and existing sellable devices, then inserts every unit atomically. A rejected batch leaves no partial unit, movement, or audit row.
- Activation locks the staged unit, rechecks membership plus `approve_inventory_adjustments`, revalidates the stored IMEI/inspection, locks the IMEI, creates one `inventory_devices` row and one `available` `store_inventory` row with the immutable invoice-line cost, appends one `intake` movement, marks the unit activated, and writes one attributed audit event. All of it commits or rolls back together.
- Repricing locks the activated unit and its inventory row, rejects reserved/sold inventory, requires both the submitted expected price and the listed price to match the current approved price, updates both prices, writes one price-change row, one `adjustment` movement, and one attributed audit event. Concurrent stale submissions serialize on the unit row lock; only one can win.

`pg_advisory_xact_lock(hashtext(imei))` is taken in deterministic order before cross-table IMEI availability checks. Unique constraints on staged IMEIs, physical-device IMEIs, inventory identity, and price/correction ledgers remain final guards against duplicate or replayed operations.

## Access and cost controls

Authenticated users receive `SELECT` only on the new views and on column-limited base tables; they receive no `INSERT`, `UPDATE`, or `DELETE` grant on workflow tables. Anonymous users receive no grants. Anon, authenticated, and service-role privileges are revoked before narrow grants are applied. RPC execution is granted to `authenticated` only; internal private helpers are revoked from `PUBLIC` and selectively granted.

Purchase cost is never granted directly to authenticated users. `private.opening_stock_cost_visible(store_id)` requires an active same-store membership, `access_manager_workspace`, and `manage_inventory`. Private, permission-checked helpers return the unit cost, generated line total, declared total, calculated invoice total, and reconciliation result only inside `security_invoker` views and return `null` or `false` otherwise. Correction history, whose before/after JSON may contain cost, is visible only through the same cost permission. The existing `store_inventory.cost_pesewas` grant remains excluded. Activation writes that cost into sellable inventory through a trusted definer transaction without exposing a raw cost column to browsers.

Manager-workspace-only rows remain store scoped. A cross-store manager, a member whose `manage_inventory` override is denied, an employee without manager access, and an anonymous caller cannot read cost or perform protected writes. Explicit permission overrides continue to take precedence over role defaults.

## Validation

`tests/opening-stock-policy.test.mjs` covers route permissions, real-IMEI validation, device-scoped batch parsing, inspection attestations, integer-pesewa parsing, bounded invoice/confirmation/correction/activation/repricing inputs, cost permission, and quantity summaries.

`tests/opening-stock-review-findings.test.mjs` is a four-finding regression suite. It asserts that manager inventory is a live server component with available/reserved/sold summaries and no `inventoryPhones` in manager TSX files; that declared totals reconcile from generated line totals with no hardcoded reviewed-invoice constants; that supplier references can be omitted or blank; and that batch devices keep distinct per-IMEI details and inspections while the action uses the atomic batch RPC.

`supabase/tests/007_opening_stock_intake.test.sql` covers:

- schema, forced RLS, raw declared-total/line-total grant denial, optional invoice references, IMEI and inspection validators;
- registration/invoice/line setup, generated line totals, all five quantity columns, and a data-entered 15-line, 48-unit, GHS 146,550 reconciliation fixture;
- the declared total, calculated total, difference, explicit confirmation, replay denial, confirmation reset, and permission-masked reconciliation view;
- staged isolation from `store_inventory` and reservations;
- atomic invalid, duplicate, missing device-inspection, and over-quantity batch rejection;
- distinct persisted colour, condition, battery health, and inspection attestation per batch IMEI;
- audited corrections, no-op rejection, short-reason rejection, quantity-below-received rejection, and cost immutability after receipt;
- manager-only cost masking, employee/anonymous/cross-store/override denial;
- activation with pricing approval, replay denial, duplicate IMEI denial, intake movement, inventory cost/price, and audit attribution;
- repricing with optimistic lock, reserved-inventory protection, adjustment movement, immutable cost, price-change ledger, and audit attribution; and
- append-only ledgers and non-deletable units.

`scripts/test-opening-stock-concurrency.mjs` creates an invoice with no supplier reference, verifies its declared/calculated reconciliation view, confirms totals, receives a device-specific atomic batch, and then uses two authenticated local manager sessions to race one duplicate IMEI receipt, one concurrent activation, and two repricing submissions. It asserts one winner per race and the persisted unit, inventory, movement, ledger, price, cost, and audit counts, as well as distinct per-device batch fields. The script refuses non-local Supabase URLs.

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

1. Reset a disposable local database and sign in as a manager with `manage_inventory`. Open `/manager/inventory` and confirm empty or persisted real available/reserved/sold rows, not sample devices.
2. Register a model and create an invoice without a number/reference. Enter the reviewed OSEI-scale data: 15 lines and 48 units summing to GHS 146,550. Confirm the declared total is persisted as 14,655,000 pesewas and the application contains no hardcoded copy of those figures.
3. Review every calculated line total and the calculated invoice total alongside the declared total and difference. Confirm only after explicitly confirming that the totals match; add a line or make an audited correction and confirm the confirmation resets.
4. Confirm purchase cost, line totals, declared totals, and calculated totals are visible only to a membership with both manager workspace and inventory permissions.
5. Try an invalid Luhn digit, a known placeholder, a missing inspection checkbox, a duplicate batch IMEI, a shared top-level device field, and a batch above the outstanding quantity. Confirm every failure is atomic.
6. Receive one device and a multi-device batch with different colours, conditions, battery health values, and inspection notes. Confirm each persisted IMEI keeps its own values and the units are staged, not in employee inventory or reservations.
7. Correct an unreceived line, then receive a device and confirm its cost is immutable. Confirm correction history includes before/after state, actor, and reason.
8. Remove `approve_inventory_adjustments` from one manager and confirm activation and repricing are denied while receiving still works.
9. Activate a staged unit with explicit price confirmation. Confirm one physical device, one available inventory row, exact approved price, exact immutable cost, one intake movement, and one audit event.
10. Reserve the activated unit, confirm repricing is denied, release it, and race two repricing submissions. Confirm one price change, one adjustment movement, one audit event, unchanged cost, and the winning price in both records.
11. Inspect a normal employee and an anonymous session. Confirm no protected table writes, no raw purchase-cost/total reads, and no cross-store records.

## Deployment boundary

This migration was prepared for review and was **not** applied to hosted Supabase. No production data, Supabase Auth configuration, Vercel project/configuration, or hosted migration state was changed. After review, the owner may inspect linked migration history and follow the normal forward-only workflow. Never use `db reset --linked`, replay statements manually, or mark this migration applied without executing it.

## Deliberate exclusions

Opening stock includes declared invoice-total reconciliation from entered line data. It does not add supplier payments/accounts payable, external supplier-statement or provider reconciliation, purchase orders, goods-return notes, barcode scanner hardware integration, automated IMEI/device-registry verification, warranty terms, repairs, trade-in valuation/settlement, returns, refunds, receipts, partial receiving of one physical unit, or editing/deleting received units. Those require separate reviewed transaction models and permissions.
