# Production release 1 — known stock discrepancies

**Status:** open. Nothing on this page has been corrected in the data.
**Source:** `docs/invoice-reconciliation-48-units.md` (committed `edf78c9`).

The 44 staged units are visible in the employee inventory as *Pending inspection*
and in the manager opening-stock workspace. The records below do **not** match
the physical goods or the supplier paperwork. They are left exactly as received
so that the discrepancy is not hidden by a quiet edit. Each one needs a manager
decision before the affected unit is activated.

No IMEI, price, condition, or battery reading has been invented to fill a gap.
Where a value is unknown it stays `NULL`.

---

## D1 — Misfiled iPhone 11

| | |
|---|---|
| IMEI | `356346100727657` |
| Recorded as | iPhone 15 Plus · 256GB · GHS 5,800 |
| Actually | iPhone 11 · 128GB |
| Supplier line | 15 |
| Effect | GHS 3,750 overstatement of stock cost |

The handset is physically an iPhone 11 but is filed against an iPhone 15 Plus
line. The model and capacity on the unit are wrong, and the cost attached to
that invoice line is too high by GHS 3,750. Filing it correctly needs an
existing legitimate receipt path — not a new supplier or cost record.

## D2 — Two iPhone 14 Plus units with the wrong capacity

| IMEI | Recorded as | Actually |
|---|---|---|
| `351111564542926` | iPhone 14 Plus · 128GB | iPhone 14 Plus · 256GB |
| `351111565339819` | iPhone 14 Plus · 128GB | iPhone 14 Plus · 256GB |

Both are the right model but the wrong storage tier. The recorded capacity
understates what the customer would receive, so selling either one as 128GB
would misdescribe the goods. The stored value is unchanged.

## D3 — Four units with no IMEI and no photograph

Supplier invoice lines 9, 12, 13 and 15. These units were received without a
photograph of the device label, so there is no evidence of their IMEI. No IMEI
has been assigned or inferred for them. They cannot be activated until a
physical IMEI is captured from the device.

## D4 — Unit with no purchase record

IMEI `356344100479718` is in stock with no matching supplier invoice line. There
is no acquisition record to reconcile it against.

## D5 — Three unrecorded sales

Three handsets have left the store without a corresponding sale record. Stock
on hand therefore exceeds what the sales ledger implies.

## D6 — Stub supplier invoice

Invoice `a05ff39d…` is a stub. Its lines are not a reliable description of what
was delivered.

## D7 — Temporary import authorization

The null-JWT import bypass (`20261126140100`) was removed in the production
release of 2026-11-26. Verified closed: the reconciliation predicates no longer
reference `auth.uid()` and contain no open `then true` branch.

---

## Not applied

`20261126170000_opening_stock_receipt_correction.sql` is prepared but **not
applied**. It would rewrite the receipt details for D1 and D2, which is exactly
the silent correction this release is required to avoid.

---

## Release verification — 2026-11-26

| Check | Result |
|---|---|
| Build | `npm run build` passed; 21 routes |
| Typecheck / lint | clean |
| Tests | 142 pass, 0 fail |
| Production URL | https://mac-evra-pos-v1.vercel.app |
| Deployment | `dpl_ECcjT512J8tWUTiGMdPZnsfj1pPt`, target production, READY, aliased |
| Staged units in production | 44 units, 44 distinct IMEIs, all `staged` |
| Employee read of pending stock | 44 rows via `pending_stock_view`, scoped to store `66b9697f…` |
| Anonymous read attempt | 0 rows, and `permission denied` without the grant |
| Sellable inventory rows | 0 — nothing staged is reservable or priced |
| Staged units with unknown battery | 31 (left `NULL`, not guessed) |
| Auth gate | `/inventory` unauthenticated redirects to sign-in |

Migrations applied for this release: `employee_pending_stock_view` and
`revert_temporary_import_authorization`. `20261126170000_opening_stock_receipt_correction`
was **not** applied.
