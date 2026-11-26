# Master IMEI and stock reconciliation — all iPhone batches

Audit date: 2026-11-26. Store `66b9697f-b64f-4d2e-9b06-5b39111ef947`.
Supplier invoice `359c8f2c-17d8-48ba-8a41-59abc0dd3706` (CHINA SUPPLIER,
invoice no. on document, dated 2026-11-20, declared total GHS 146,550, status `open`).

**This is an audit record only.** No devices were staged, activated, priced or
sold during this audit, no migration was applied, and no invoice line, amount
or supplier record was modified.

## Sources used

| Source | Covers |
| --- | --- |
| 45 distinct uploaded inspection photos (33 + 12) | every handset in Batches 1–4 |
| `opening_stock_units` (32 rows, live) | Batches 1–3 staging |
| `opening_stock_models` (15), `device_models` | catalogue |
| `supplier_invoice_lines` (15 lines, 48 units) | the purchase |
| `inventory_devices`, `store_inventory`, `inventory_movements` | all empty (0 rows) |
| `sales` (1 row), `sale_items` (0 rows) | see [Sold phones](#sold-phones) |
| `docs/inspection-2026-11-25-iphone-batch.md`, `docs/batch-3-2026-11-26-reconciliation.md` | Batch 1/2 and Batch 3 records |

**Elvis's stock report is not present** in this repository or the database. Every
supplier-comparison figure below is against the invoice only; see
[Unavailable sources](#unavailable-sources).

## Headline numbers

| Measure | Count |
| --- | --- |
| Phones on the supplier invoice | 48 |
| Separately purchased iPhone 11 | 1 |
| **Total phones received** | **49** |
| Unique IMEIs captured from photos | **45** |
| **Handsets with no IMEI captured** | **4** |
| Unique IMEIs actually staged in the database | 32 |
| Captured IMEIs not yet staged | 13 |
| Recorded as sold (sales tables) | 0 |
| Reported sold (per your accounting facts) | 3 |
| Physical stock held, after reported sales | **46** |

## 1. Consolidated IMEI register (45 handsets)

Validated with the project's strict validator and the Luhn check. `NULL` battery
means the screen read `No Data` — it is unknown and has deliberately not been
guessed. Invoice line `—` means the handset is not on the invoice.

| # | IMEI | Model | GB | Colour | Batch | Battery | Invoice line | Notes |
|---|---|---|---|---|---|---|---|---|
| 1 | 351887639266605 | iPhone 13 | 128 | Green | B1 | NULL | 7 | — |
| 2 | 352279171784816 | iPhone 13 | 128 | Pink | B1 | NULL | 7 | — |
| 3 | 351062823645416 | iPhone 13 | 256 | Starlight | B1 | 100% | 8 | — |
| 4 | 356012713402811 | iPhone 13 | 256 | Pink | B1 | NULL | 8 | — |
| 5 | 353061115375227 | iPhone 12 | 128 | White | B1 | NULL | 4 | — |
| 6 | 357711645300790 | iPhone 12 | 128 | Blue | B1 | NULL | 4 | — |
| 7 | 352011862647220 | iPhone 12 | 256 | Green | B1 | NULL | 5 | — |
| 8 | 354032283872880 | iPhone 12 | 256 | Black | B1 | NULL | 5 | — |
| 9 | 355374173131772 | iPhone 14 | 128 | Blue | B1 | NULL | 11 | — |
| 10 | 357215264665590 | iPhone 13 Pro | 128 | Sierra Blue | B1 | NULL | 9 | — |
| 11 | 355839990795272 | iPhone 13 | 128 | Blue | B2 | NULL | 7 | — |
| 12 | 352905619055902 | iPhone 13 | 256 | Starlight | B2 | NULL | 8 | — |
| 13 | 355597756487829 | iPhone 12 | 128 | Black | B2 | NULL | 4 | — |
| 14 | 353142766535796 | iPhone 12 | 256 | white | B2 | NULL | 5 | — |
| 15 | 356124717842528 | iPhone 14 | 128 | Midnight | B2 | NULL | 11 | — |
| 16 | 351540482698867 | iPhone 13 Pro | 128 | Graphite | B2 | NULL | 9 | — |
| 17 | 357106632493833 | iPhone 13 | 128 | Starlight | B2 | 85% | 7 | — |
| 18 | 355305619796133 | iPhone 12 | 128 | Purple | B2 | 81% | 4 | — |
| 19 | 357684399007640 | iPhone 14 | 128 | Purple | B3 | NULL | 11 | — |
| 20 | 359529186364928 | iPhone 14 | 128 | Midnight | B3 | NULL | 11 | — |
| 21 | 354071159671307 | iPhone 13 Pro | 256 | Gold | B3 | 95% | 10 | — |
| 22 | 351062826074903 | iPhone 13 | 128 | Midnight | B3 | NULL | 7 | — |
| 23 | 353063110205722 | iPhone 12 | 128 | Blue | B3 | 75% | 4 | — |
| 24 | 355374175939180 | iPhone 14 | 256 | Midnight | B3 | NULL | 12 | — |
| 25 | 357174291687699 | iPhone 13 Pro | 256 | Sierra Blue | B3 | NULL | 10 | Apple ID Lock ON in photo; do not treat as cleared |
| 26 | 352184991135498 | iPhone 13 | 128 | Starlight | B3 | 88% | 7 | — |
| 27 | 353063116530008 | iPhone 12 | 128 | Red | B3 | NULL | 4 | — |
| 28 | 356133314172833 | iPhone 13 Pro | 256 | Graphite | B3 | 78% | 10 | — |
| 29 | 350148179039725 | iPhone 12 | 128 | Green | B3 | NULL | 4 | — |
| 30 | 351111565339819 | iPhone 14 Plus | 256 | Starlight | B3 | NULL | 14 | actual 256GB; invoice line 14 says 128GB |
| 31 | 351111564542926 | iPhone 14 Plus | 256 | Midnight | B3 | NULL | 14 | actual 256GB; invoice line 14 says 128GB |
| 32 | 356346100727657 | iPhone 11 | 128 | Black | B3 | 75% | 3 | staged on line 15 (15 Plus) — mis-filed |
| 33 | 357174297534176 | iPhone 13 Pro | 128 | Green | B3 | NULL | 9 | NOT STAGED — line 9 has an empty slot |
| 34 | 352973115908719 | iPhone 11 | 128 | Black | B4 | 82% | 3 | — |
| 35 | 356344100479718 | iPhone 11 | 128 | Black | B4 | 74% | — | separately purchased, not on invoice |
| 36 | 352977112393080 | iPhone 11 | 128 | Black | B4 | NULL | 3 | — |
| 37 | 356682111671736 | iPhone 12 Pro | 256 | Silver | B4 | 62% | 6 | — |
| 38 | 358806091433670 | iPhone XR | 128 | Red | B4 | 87% | 1 | — |
| 39 | 359230405490921 | iPhone SE (2nd generation) | 64 | white | B4 | 88% | 2 | — |
| 40 | 356488100223210 | iPhone SE (2nd generation) | 64 | Black | B4 | NULL | 2 | — |
| 41 | 356476106237235 | iPhone SE (2nd generation) | 64 | Red | B4 | NULL | 2 | — |
| 42 | 356487109902568 | iPhone SE (2nd generation) | 64 | Black | B4 | NULL | 2 | Apple ID Lock unresolved (Online Query) |
| 43 | 356781113561224 | iPhone SE (2nd generation) | 64 | white | B4 | NULL | 2 | — |
| 44 | 351374183841620 | iPhone 15 Plus | 256 | Green | B4 | 88% | 15 | NOT STAGED |
| 45 | 356129173669232 | iPhone 13 | 128 | Midnight | B4 | NULL | 7 | — |

## 2. IMEI validation

All **45** captured IMEIs are 15 digits, pass the Luhn checksum, pass the strict
validator (non-degenerate TAC, not a reserved test IMEI, not a monotonic run) and
are unique across every batch. **0 invalid, 0 duplicate** — there is no IMEI in
the register that appears twice in any table.

Re-shoots are not duplicates: `352011862647220` (12/256 Green) was photographed
in both Batch 1 and Batch 3, and 17 Batch 1/2 handsets were re-photographed in
the Batch 3 upload. Each is present **once** in the register and once in the
database.

## 3. Duplicate detection

| Source | Result |
| --- | --- |
| Within the 45 captured IMEIs | no duplicates |
| Against `opening_stock_units` (32 rows) | all 32 match a captured IMEI; no orphans |
| Against `inventory_devices` (0 rows) | nothing to collide with |
| Against `sale_items.imei` (0 rows) | nothing to collide with |
| Distinct IMEI count in `opening_stock_units` | 32 of 32 rows — no duplicate rows |

## 4. Handsets with no IMEI captured (4 — cannot be identified)

These are known only as invoice quantity. **Their IMEIs are not invented or
inferred anywhere in this report.**

| Invoice line | Model | Storage | Missing IMEIs |
| --- | --- | --- | --- |
| 12 | iPhone 14 | 256GB | 1 |
| 13 | iPhone 14 Pro | 256GB | 1 |
| 15 | iPhone 15 Plus | 256GB | 1 |
| — (separate purchase) | iPhone 11 | 128GB | 1 |
| **Total** | | | **4** |

## 5. Reconciliation by model and storage

`IMEIs` counts distinct captured handsets on that invoice line (the separately
purchased iPhone 11 is excluded from line 3). `Physical` is `IMEIs − Sold`.

| Line | Model | GB | Expected (invoice) | IMEIs identified | Sold | Remaining physical | Δ |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | iPhone XR | 128 | 1 | 1 | 0 | 1 | — |
| 2 | iPhone SE (2nd generation) | 64 | 5 | 5 | 0 | 5 | — |
| 3 | iPhone 11 | 128 | 3 | 3 | 0 | 3 | — |
| 4 | iPhone 12 | 128 | 7 | 7 | 0 | 7 | — |
| 5 | iPhone 12 | 256 | 3 | 3 | 0 | 3 | — |
| 6 | iPhone 12 Pro | 256 | 1 | 1 | 0 | 1 | — |
| 7 | iPhone 13 | 128 | 7 | 7 | 0 | 7 | — |
| 8 | iPhone 13 | 256 | 3 | 3 | 0 | 3 | — |
| 9 | iPhone 13 Pro | 128 | 4 | 3 | 1 | 2 | −1 |
| 10 | iPhone 13 Pro | 256 | 3 | 3 | 0 | 3 | — |
| 11 | iPhone 14 | 128 | 4 | 4 | 0 | 4 | — |
| 12 | iPhone 14 | 256 | 2 | 1 | 1 | 0 | −1 |
| 13 | iPhone 14 Pro | 256 | 1 | 0 | 0 | 0 | −1 |
| 14 | iPhone 14 Plus | **256** | 2 | 2 | 0 | 2 | — |
| 15 | iPhone 15 Plus | 256 | 2 | 1 | 1 | 0 | −1 |
| | **Invoice total** | | **48** | **44** | **3** | **41** | −4 |
| — | iPhone 11 (separate purchase) | 128 | 1 | 1 | 0 | 1 | — |
| | **Grand total** | | **49** | **45** | **3** | **46** | −4 |

The four `Δ = −1` rows are **exactly** the four handsets whose IMEIs were never
captured (§4). Every model line whose handsets were all photographed reconciles
to zero. **Remaining physical stock of 41 + 1 = 46 matches the expected 46.**

## 6. Sold phones

**No sale is recorded in the system.** `sales` holds a single row in `draft`
status with `total_pesewas = 0`, `sale_items` has 0 rows, `inventory_devices`
and `store_inventory` have 0 rows, and `inventory_movements` has 0 rows.
`opening_stock_units` has no `sold` status at all — its status domain is
`staged | activated`, so a sale cannot be represented there either.

Therefore:

| Reported sold | IMEI recorded? |
| --- | --- |
| 1 × iPhone 14 256GB | **No** |
| 1 × iPhone 13 Pro 128GB | **No** |
| 1 × iPhone 15 Plus 256GB | **No** |

**0 of 3 sold phones have IMEIs recorded in the database.** The three models and
storages you listed match three invoice lines exactly, so the quantities
reconcile — but which physical handset went out, and its IMEI, is not recorded
anywhere. This should be captured before those units can be reconciled
individually.

## 7. Flagged discrepancies

### 7.1 iPhone 11 invoice quantity

The invoice line 3 covers **3 × iPhone 11 128GB**, but **4** were received: three
from Batch 4 (`352973115908719`, `352977112393080`) plus one separately purchased
unit (`356344100479718`), and additionally Batch 3's `356346100727657` also
proves to be an iPhone 11 128GB.

Tracking the separate purchase separately, the four iPhone 11 handsets split as
**3 invoice + 1 separately purchased**, which is consistent — the discrepancy is
not that a 4th unit is unaccounted for, it is that:

1. `356344100479718` has **no purchase record of its own** in the database. There
   is no second supplier invoice for it — the only other invoice row
   (`a05ff39d…`) is a duplicate stub with 0 lines. It needs its own purchase
   record before it is staged, exactly as you instructed.
2. `356346100727657` is currently **staged against invoice line 15
   (iPhone 15 Plus 256GB)** instead of line 3, booking it at GHS 5,800 rather
   than GHS 2,050 — an overstatement of **GHS 3,750**. This is carried over from
   the Batch 3 report as exception E1.

### 7.2 iPhone 14 Plus storage description

Invoice line 14 is described as **iPhone 14 Plus 128GB**. Both physical handsets
read **128GB** on the 3uTools model line but report **238.30 GB** of total hard
disk capacity with 11.86 GB used, i.e. they are **256GB** devices. As you stated,
the invoice description is incorrect.

Consequence: `opening_stock_units` rows for `351111565339819` and
`351111564542926` are filed against a **128GB** catalogue model while the units
are 256GB. Quantities still reconcile (2 invoiced, 2 photographed, 2 held), so
only the storage attribute is wrong. No invoice amount or supplier record was
changed; correcting the catalogue mapping needs your approval and, because
`device_model_id` is immutable on a staged row, would also need a void and
re-receive.

## 8. Other issues carried forward

| Ref | Issue | Status |
| --- | --- | --- |
| E1 | `356346100727657` staged on the iPhone 15 Plus line | open — needs void + re-receive |
| E2 | `357174297534176` (13 Pro 128GB Green) valid but **not staged**; line 9 has an empty slot | open |
| E4 | `357174291687699` photographed with **Apple ID Lock ON**, yet its inspection carries `activation_lock_cleared: true` | open — attestation unproven |
| new | `356487109902568` (SE2) shows Apple ID Lock **unresolved** (`Online Query`) | recorded as unknown, not "cleared" |
| new | `351374183841620` (15 Plus 256GB Green) valid but **not staged** | open |
| new | `356344100479718` (11 128GB) has no purchase record | open, per §7.1 |
| — | Duplicate invoice stub `a05ff39d…` (0 lines, same declared total as the real invoice) | harmless, flagged for cleanup |

## 9. Unavailable sources

- **Elvis's stock report** was requested for comparison but is not in the repo,
  the database, or the uploaded material. The supplier comparison in §5 is
  against the invoice only.
- **Sold-device records** exist only as your accounting note of 3 phones; the
  system has no sale, no sale item and no IMEI for any of them (§6).

## 10. What this audit did not do

Nothing was staged, activated, priced or sold; no migration was applied; no
invoice line, amount or supplier record was edited; no IMEI was invented or
inferred. The four handsets in §4 remain unidentified and are reported as such
rather than back-filled.

**Staged in database: 32. Captured but unstaged: 13. Activated: 0. Priced: 0.
Recorded as sold: 0.**
