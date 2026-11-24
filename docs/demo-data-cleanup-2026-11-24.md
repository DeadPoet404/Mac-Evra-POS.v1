# Demo data and placeholder cleanup · 24 Nov 2026

Audit and removal of fabricated business information across the employee and manager
surfaces. Everything below was verified against the schema and RLS grants on `main`.

## Removed

| Surface | Demo element removed |
| --- | --- |
| Manager overview | Eight sample sales, seven-day sample chart, `+12.8%` trend badge, `9` transactions, `GH₵ 5,956` average sale, `16.1%` gross margin, six sample approvals, `Pending approvals` card, three fabricated activity cards, "interface-preview" notice |
| Manager approvals | Six sample requests, approve/decline buttons with local-only state, decision notes, "value under review" total, fabricated high-priority counters |
| Manager reports | Daily/weekly/monthly sample totals, four-week trend, employee/model/payment breakdowns, gross profit and margin, browser-generated CSV built from those samples |
| Manager settings | Sample store identity, manager name and phone, editable fields, POS toggles, payment-method list including Card/Split, "Save changes" that persisted nothing |
| Trade-in | Six-step wizard, invented valuation engine (GH₵ 2,400 base and adjustments), sample device inventory, "Prepare Manager Approval" that wrote nothing |
| Employee home | Search and "current sale" buttons that only printed preview messages |
| Manager shell | Hardcoded approvals badge (`4`), "Preview data" badge, notification bell with a permanent dot, non-functional "Help & support" entry |

Deleted modules: `src/lib/manager-data.ts`, `src/lib/inventory.ts` (sample `inventoryPhones`),
`src/lib/trade-in.ts` (demo valuation), `src/components/employee/device-card.tsx`,
`src/app/home/action-cards.tsx` (unused).

## Replaced with real, RLS-scoped records

- **Manager overview** — confirmed revenue, completed paid sales, waiting payments, open drafts,
  seven-day chart per store day and the five most recent sales all come from `listManagerSales`
  (sales, sale items, payments, customers) and `listAuthorizedInventory`. The chart, the "needs
  attention" list and each card have an explicit empty state.
- **Manager reports** — the period summary, per-day chart, employee/model/payment breakdowns and
  the CSV download are computed from the same persisted sale records, scoped to the caller's store.
  The export is a server route (`/manager/reports/export`) so the file can only contain stored rows.
- **Manager settings** — store name, code, timezone, currency and status are read from the `stores`
  row; the account card shows the signed-in profile, role, membership id and the permissions the
  database actually grants. No editable field remains.

## Deliberately not reported

- **Gross profit and margin** are not shown anywhere. `public.store_inventory.cost_pesewas` is not
  granted to the `authenticated` role (see `20261123120000_phase_02_inventory.sql`), so no margin can
  be computed in the app without exposing acquisition cost. The reports page states this instead of
  estimating a number.
- **Outstanding balances** are not shown: the payment function requires one payment equal to the sale
  total, so a completed sale is always fully settled.

## Not available because the backend does not exist

- **Approvals** — no approval request table, state machine or decision RPC exists on `main`. The page
  explains this and links to the screens that do hold persisted records.
- **Trade-in** — no trade-in records, valuation rules or approval path exist. The route is kept so
  employees are told the truth rather than shown an invented estimate.

## Financial rules enforced in code and tests

`src/lib/reporting.ts` is the single place that turns sale records into figures:

- revenue requires `status = completed` **and** a confirmed `GHS` payment;
- drafts, awaiting-payment, cancelled sales and completions without a confirmed payment never count;
- money stays in integer pesewas (`BigInt`-based formatting), and shares are whole percentages;
- only the three supported payment methods (Mobile Money, Cash, Bank Transfer) can appear.

`tests/reporting.test.mjs` and `tests/demo-data-removal.test.mjs` cover these rules, the empty states,
the CSV export and the permission/store boundaries.
