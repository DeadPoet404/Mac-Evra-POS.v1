# Phase 5 — persistent customers and sales

> Historical phase boundary: Phase 6 now supersedes the employee route order and adds manual payment-backed completion. See `docs/manual-payments-phase-6.md` for current behavior. This document preserves the Phase 5 design that Phase 6 extends without rewriting.

Phase 5 replaced the employee sale preview and manager sample transaction register with store-scoped Supabase records. It did **not** implement payment collection, payment verification, receipt issuance, inventory fulfilment, or a paid/completed sale state.

## Data model

Migration `20261123220000_phase_05_sales_customers.sql` adds:

- `customers` — minimal store-scoped contact records with practical duplicate prevention through canonical phone matching;
- `sales` — employee-owned drafts with `draft`, `awaiting_payment`, and `cancelled` states only;
- `sale_items` — immutable device/model/IMEI/description and integer-pesewa price snapshots linked to the inventory reservation used by the draft.

All monetary values are integer Ghana pesewas. `sales.total_pesewas` and `sale_items.line_total_pesewas` are generated columns. Browser code cannot write trusted prices, totals, actors, stores, or lifecycle states.

A customer is optional. A null `customer_id` represents a walk-in customer and avoids collecting unnecessary personal information.

## Transaction boundaries

Authenticated operations use fixed-`search_path` security-definer RPCs:

- `create_sale_draft`
- `add_sale_item`
- `remove_sale_item`
- `set_sale_item_discount`
- `set_sale_customer`
- `create_sale_customer`
- `submit_sale_for_payment`
- `cancel_sale_draft`
- `expire_sale_drafts`

`add_sale_item` reuses `reserve_inventory_device`; it does not duplicate the reservation transition. `remove_sale_item` and cancellation reuse `release_inventory_reservation`. The existing unique active-reservation index and row locking serialize competing employees.

Submitting checkout only changes a validated draft to `awaiting_payment`. It requires every active item to retain an active, unexpired reservation owned by the sale employee. It does not create a payment, mark a sale paid, fulfil a reservation, create a sold movement, or set inventory to `sold`.

## Access control

- Customers, sales, and sale items have enabled and forced RLS.
- Employees with effective `create_sales` access may read customers in their own store and only their own sale drafts.
- Managers with `access_manager_workspace` may read sale records and customer details in their own store.
- Authenticated users receive select privileges only; every write is through a permission-checked RPC.
- Discounts greater than zero require effective `approve_discounts` permission.
- Sale-item snapshot identity, device, IMEI, description, and unit price cannot be updated. Sale items cannot be deleted.
- Audit events record customer creation/association, draft creation, item changes, discounts, awaiting-payment submission, cancellation, plus the existing reservation creation/release events.

## Application flow

- `/inventory` lists real RLS-scoped inventory.
- `/new-sale` creates, lists, resumes, edits, expires, and cancels persistent drafts.
- `/new-sale/customer-info` searches, selects, creates, or clears a sale customer.
- `/new-sale/checkout` displays database totals and validates reservations before the awaiting-payment transition.
- `/new-sale/payment` is an explicit Phase 6 boundary and accepts no payment input.
- `/new-sale/complete` clearly reports that the sale is awaiting verified payment and that no device may be handed over.
- `/manager/sales` lists and filters real store sale records without presenting pipeline totals as revenue.

## Validation

Application tests cover customer input/search, integer-pesewa conversion, manager search, and unpaid status labels. `005_sales_customers.test.sql` covers customer creation and isolation, trusted totals, item creation, duplicate-device prevention, invalid/cross-store inventory, direct-write denial, authorised discounts, checkout, cancellation, immutable snapshots, and audit events. `test-sales-concurrency.mjs` races two authenticated drafts for one physical device and requires exactly one successful item addition.

Run against a disposable local Supabase stack only:

```bash
npm ci
npm run supabase:start
npm run db:reset
npm run db:lint
npm run db:test
npm run db:test:inventory-concurrency
npm run db:test:sales-concurrency
npm run db:test:auth-concurrency
npm run db:test:auth-sessions
npm test
npm run lint
npm run typecheck
npm run build
npm run supabase:stop -- --no-backup
```

The concurrency scripts reject non-local Supabase URLs.

## Manual owner testing

1. Reset a disposable local Supabase stack and create/sign in an employee with `create_sales` and `reserve_inventory`.
2. Add at least two real local inventory devices.
3. Open `/new-sale`, create a draft, search or scan an IMEI, and add devices.
4. Reload the browser and resume the draft from the unfinished-sales list.
5. Remove an item and confirm its inventory returns to `available`.
6. Search for an existing customer, create a Ghana-phone customer, repeat the phone in another draft, and confirm the existing customer is selected rather than duplicated.
7. Continue as walk-in and verify no customer is required.
8. Review checkout and confirm amounts match database inventory prices.
9. Set the sale to awaiting payment and verify inventory remains `reserved`, never `sold`.
10. Confirm the status page says no payment is verified and no device should be handed over.
11. Open `/manager/sales` and test search, status/date filters, customer details, item snapshots, totals, and employee attribution.
12. Cancel a draft or awaiting-payment sale and confirm active reservations are released and audit events remain append-only.

## Hosted deployment — owner action after merge and review

Phase 5 was not applied to hosted Supabase during implementation. After the pull request is reviewed and merged, the owner should use an authenticated local Supabase CLI session and inspect pending history before pushing:

```bash
npx supabase login
npx supabase link --project-ref vyjqmwgyriebgzajmmax
npx supabase migration list --linked
npx supabase db push --dry-run
npx supabase db push
```

Never use `db reset --linked`. The push must include Phase 4 first if the hosted ledger shows Phase 4 is still pending. Do not manually replay individual Phase 5 statements or mark the migration applied without executing it.

## Known limitations

- No payment or tender records exist.
- No cash, Mobile Money, card, or bank-transfer verification exists.
- No sale can be paid or completed in Phase 5.
- No inventory reservation is fulfilled and no device is marked sold.
- Draft/reservation expiry is invoked through authenticated cleanup and existing reservation operations; there is no hosted scheduler in this phase.
- Reporting beyond the real manager sale register remains a later phase.
