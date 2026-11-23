# Phase 6 — manual payment recording and sale completion

Phase 6 adds one manually confirmed, full payment and genuine sale completion to the one-device employee journey. It does not integrate with a payment provider. An optional transaction reference is metadata only and is never treated as proof that funds arrived.

## Employee journey

The persisted route order is exactly:

1. `/new-sale` — verify one IMEI and reserve the available physical device.
2. `/new-sale/payment` — display the database total, choose exactly one payment method, and attest that the full amount was actually received.
3. `/new-sale/customer-info` — record customer details only after payment was successfully persisted.
4. `/new-sale/complete` — show success only when an authorised query returns both the completed sale and its confirmed payment.

The supported payment methods are exactly `mobile_money`, `cash`, and `bank_transfer`. There are no carts, split tenders, partial payments, multiple payment rows, gateways, automatic-provider claims, refunds, reversals, or receipt printing.

Backward navigation does not discard progress. Routes reload sale, item, reservation, payment, and customer state from Supabase. A direct visit to the completion URL does not show success for a draft, awaiting-payment sale, cancelled sale, missing sale, inaccessible sale, or a completed row without its matching confirmed payment.

## Migration and data model

Forward-only migration `20261123235900_phase_06_manual_payments.sql`:

- extends `sales.status` with `completed` and adds `sales.completed_at`;
- adds `sale_payments`, with one row per sale, the sale/store relationship, positive integer-pesewa amount, fixed `GHS` currency, one supported method, optional bounded reference, confirmer user/membership/name snapshots, employee receipt attestation, and confirmation time;
- enables and forces payment RLS;
- grants authenticated callers payment `select` only and exposes writes only through narrowly granted RPCs;
- makes payment rows append-only with a mutation-rejection trigger;
- adds the fixed-search-path security-definer `confirm_sale_payment` transaction;
- adds `create_completed_sale_customer` for the post-payment customer step.

Phases 1–5 are not edited or replayed.

## Atomic confirmation boundary

`confirm_sale_payment` derives the caller from `auth.uid()` and the active store membership/permissions already established by the application. It accepts no browser-supplied store, employee, membership, status, price, or permission value.

Within one PostgreSQL transaction it:

1. requires explicit full-payment receipt attestation and a supported method;
2. locks the sale and rejects missing, cancelled, already completed, duplicate, foreign, or non-owned sales;
3. recalculates totals from immutable active sale-item price snapshots;
4. requires the submitted integer-pesewa amount to equal the authoritative positive sale total exactly;
5. requires and locks exactly one active sale item;
6. locks and validates its matching store inventory and reservation rows;
7. rejects non-reserved inventory and inactive, expired, foreign, inconsistent, or differently owned reservations;
8. inserts the immutable payment;
9. fulfils the reservation;
10. changes inventory from `reserved` to `sold`;
11. appends one `sold` inventory movement;
12. marks the sale `completed`; and
13. appends attributed payment, inventory, and sale-completion audit events.

The sale row lock serializes concurrent confirmations. The one-payment unique constraint is a second database guard against duplicate or replayed confirmation. Any failure rolls back payment, sale, reservation, inventory, movement, and audit changes together.

## Access and reporting

Employees can read their own payment-backed sales. Managers with `access_manager_workspace` can read store payment records, subject to store RLS. A transaction reference is displayed as employee-entered metadata, not provider verification.

The existing manager sales interface changes only where required: it recognises completed sales, displays persisted manual payment attribution, and counts only records with both `completed` sale state and a confirmed payment as revenue. Draft and awaiting-payment totals are excluded.

## Validation

Application tests cover the exact route order, persisted resume states, status labels, and completion guards. `006_manual_payments.test.sql` covers:

- all three supported methods;
- exact amount and authoritative totals;
- zero, negative, under-, and overpayment rejection;
- unsupported methods and missing attestation;
- immutable one-per-sale payments;
- owner, manager, and cross-store access behavior;
- cancellation and expired-reservation rejection;
- reservation fulfilment, sold inventory, sold movement, completed sale, post-payment customer association, and audit events.

`test-payment-concurrency.mjs` uses two authenticated sessions for one employee and races two confirmations against one sale. Exactly one must succeed; the other must receive a duplicate error, with one payment, one sold movement, one completed sale, one fulfilled reservation, and sold inventory.

Run against a disposable local Supabase stack only:

```bash
npm ci
npm run supabase:start
npm run db:reset
npm run db:lint
npm run db:test
npm run db:test:inventory-concurrency
npm run db:test:sales-concurrency
npm run db:test:payment-concurrency
npm run db:test:auth-concurrency
npm run db:test:auth-sessions
npm test
npm run lint
npm run typecheck
npm run build
npm run supabase:stop -- --no-backup
```

The concurrency scripts reject non-local Supabase URLs.

## Manual review checklist

1. Reset a disposable local Supabase stack and sign in as an employee with `create_sales` and `reserve_inventory`.
2. Start a sale, enter one available IMEI, and confirm its trusted amount.
3. Use each payment method on separate sales. Verify the payment form cannot continue without the receipt attestation.
4. Confirm an optional reference is labelled metadata and never presented as provider verification.
5. After payment, reload and navigate backward. Confirm persisted progress resumes at customer details without creating another payment.
6. Record customer details and verify the completion page displays only the persisted completed sale/payment.
7. Open draft, awaiting-payment, cancelled, malformed, inaccessible, and completed-without-payment completion URLs and verify none shows success.
8. Verify the manager sales register counts only completed paid sales as revenue.
9. Verify database rows show one payment, fulfilled reservation, sold inventory, one sold movement, and attributed audit events.

## Hosted deployment boundary

Phase 6 was not applied to hosted Supabase during implementation. After review and merge, the owner may inspect linked migration history and use the normal forward-only workflow:

```bash
npx supabase login
npx supabase link --project-ref vyjqmwgyriebgzajmmax
npx supabase migration list --linked
npx supabase db push --dry-run
npx supabase db push
```

Never use `db reset --linked`, replay migration statements manually, or mark this migration applied without executing it.

## Deliberate exclusions

Phase 6 does not add payment-provider integrations, automatic Mobile Money or bank verification, partial/split payment, multiple tenders, refunds, reversals, chargebacks, receipt printing, reconciliation, trade-in settlement, or financial exports. Those require separate reviewed transaction models and permissions.
