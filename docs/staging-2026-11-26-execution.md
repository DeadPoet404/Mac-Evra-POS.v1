# Staging execution — 2026-11-26

Authorized execution following
[reconciliation-followup-2026-11-26.md](reconciliation-followup-2026-11-26.md).

**Applied to production:** 12 units staged via
`receive_opening_stock_devices`. No migration was applied. Nothing was
activated, priced or sold; no sale was created; no invoice total or supplier
record was changed.

## Result

| Measure | Before | After |
| --- | --- | --- |
| Units in `opening_stock_units` | 32 | **44** |
| Distinct IMEIs | 32 | **44** |
| Activated | 0 | 0 |
| Priced | 0 | 0 |
| Condition graded | 0 | 0 |
| Rows carrying `activation_lock_cleared` | 29 | **40** |

44 rows, 44 distinct IMEIs — **every staged IMEI appears exactly once.**

## 1. Staged (12 units)

All carry `status = 'staged'`, `condition = NULL`, `approved_price_pesewas = NULL`,
and only the photo-evidenced inspection keys. Battery health is the measured
value or `NULL` — never a guess.

| IMEI | Model | GB | Colour | Battery | Line | Lock attested |
| --- | --- | --- | --- | --- | --- | --- |
| `358806091433670` | iPhone XR | 128 | Red | 87% | 1 | yes |
| `359230405490921` | iPhone SE2 | 64 | white | 88% | 2 | yes |
| `356488100223210` | iPhone SE2 | 64 | Black | NULL | 2 | yes |
| `356476106237235` | iPhone SE2 | 64 | Red | NULL | 2 | yes |
| `356781113561224` | iPhone SE2 | 64 | white | NULL | 2 | yes |
| `356487109902568` | iPhone SE2 | 64 | Black | NULL | 2 | **NO — unknown** |
| `352973115908719` | iPhone 11 | 128 | Black | 82% | 3 | yes |
| `352977112393080` | iPhone 11 | 128 | Black | NULL | 3 | yes |
| `356682111671736` | iPhone 12 Pro | 256 | Silver | 62% | 6 | yes |
| `357174297534176` | iPhone 13 Pro | 128 | Green | NULL | 9 | yes |
| `356129173669232` | iPhone 13 | 128 | Midnight | NULL | 7 | yes |
| `351374183841620` | iPhone 15 Plus | 256 | Green | 88% | 15 | yes |

### B4-09 `356487109902568`

Staged as instructed, with **`activation_lock_cleared` deliberately absent** and
`iCloud` unrecorded. Its inspection document is exactly:

```json
{"imei_confirmed_physical": true, "identity_labels_match": true}
```

The handset therefore cannot reach activation until the lock is actually cleared
and queried. The `activation_lock_cleared` flag was **not** set to false either —
it is simply unproven and absent, which is the honest representation.

## 2. Not staged

| IMEI | Reason |
| --- | --- |
| `356344100479718` | **No legitimate receipt path.** No second supplier invoice exists; the only other invoice row is a duplicate stub with 0 lines. Creating one would mean inventing supplier, date and cost. Left unstaged. |

## 3. Corrections — attempted, blocked, migration prepared

### 3.1 `356346100727657` — iPhone 11 filed on the iPhone 15 Plus line

Attempted directly:

```sql
update public.opening_stock_units
set invoice_line_id = <line 3>, device_model_id = <iPhone 11 128GB>, unit_cost_pesewas = 205000
where imei = '356346100727657';
```

**Refused by the database:** `23514 received opening-stock identity is
immutable`. `private.validate_opening_stock_unit_update` freezes
`invoice_line_id`, `device_model_id` and `unit_cost_pesewas`, and
`private.prevent_opening_stock_unit_delete` refuses every delete outright — so
there is no void-and-re-receive path either.

It remains staged as **iPhone 15 Plus 256GB on line 15 at GHS 5,800** instead of
line 3 at GHS 2,050. Because line 15 now holds `351374183841620` plus this unit,
the line reads a full 2/2 with only one real iPhone 15 Plus.

**Migration prepared, not applied:**
`supabase/migrations/20261126170000_opening_stock_receipt_correction.sql`

It adds `public.correct_opening_stock_unit_receipt(p_unit_id, p_invoice_line_id,
p_reason)`, which:

- only realigns `invoice_line_id`, `device_model_id` and `unit_cost_pesewas`;
- requires the destination line to be on the **same invoice**, so totals cannot move;
- requires the destination line to have remaining capacity;
- requires the unit to still be `staged` and the caller to hold `access_manager_workspace`;
- never touches `imei`, `colour`, `battery_health`, `inspection`, `condition` or receipt attribution;
- refuses to change inspection evidence at all;
- writes an append-only `opening_stock.receipt_corrected` audit event with before/after identity;
- grants execute to `authenticated` only.

The immutability trigger stays in force for every other caller; it is relaxed
only for the transaction-local marker the function sets for one statement.

### 3.2 The two iPhone 14 Plus 256GB units — blocked differently

`351111565339819` and `351111564542926` are 256GB handsets filed against the
**128GB** catalogue entry (`09d147dd…`).

Investigated in this order:

1. **`device_models` already has an iPhone 14 Plus 256GB** row (`e91cc4bc…`), so
   no device-model creation is needed.
2. **`opening_stock_models` has no active entry for it** in this store — only the
   128GB line-14 entry.
3. `public.register_opening_stock_model(...)` **failed**:
   `23502 null value in column "created_by_…"`. The temporary null-JWT relaxation
   covers `receive_opening_stock_devices` and invoice reads, but **not** model
   registration, so a JWT-less caller cannot satisfy the NOT NULL attribution
   columns. No relaxation was added — that would be a new authorization change.

**The migration prepared above does not fix this case**, and it should not: line
14's `model_catalogue_id` itself points at the 128GB variant. Correcting these
two units means changing **which catalogue model the supplier invoice line
refers to**, which is supplier-record territory and is explicitly out of bounds.
This needs your decision, and it is a decision about the invoice's model
reference, not about the handsets.

## 4. Per-line position after staging

| Line | Model | GB | Invoiced | Staged | Outstanding |
| --- | --- | --- | --- | --- | --- |
| 1 | iPhone XR | 128 | 1 | 1 | 0 |
| 2 | iPhone SE2 | 64 | 5 | 5 | 0 |
| 3 | iPhone 11 | 128 | 3 | 2 | **1** |
| 4 | iPhone 12 | 128 | 7 | 7 | 0 |
| 5 | iPhone 12 | 256 | 3 | 3 | 0 |
| 6 | iPhone 12 Pro | 256 | 1 | 1 | 0 |
| 7 | iPhone 13 | 128 | 7 | 7 | 0 |
| 8 | iPhone 13 | 256 | 3 | 3 | 0 |
| 9 | iPhone 13 Pro | 128 | 4 | 3 | **1** |
| 10 | iPhone 13 Pro | 256 | 3 | 3 | 0 |
| 11 | iPhone 14 | 128 | 4 | 4 | 0 |
| 12 | iPhone 14 | 256 | 2 | 1 | **1** |
| 13 | iPhone 14 Pro | 256 | 1 | 0 | **1** |
| 14 | iPhone 14 Plus | 128 → actual 256 | 2 | 2 | 0 |
| 15 | iPhone 15 Plus | 256 | 2 | 2 | 0 |
| | **Total** | | **48** | **44** | **4** |

The 4 outstanding slots are exactly the 4 handsets whose IMEIs were never
captured. Line 3's single outstanding slot is where the separately purchased
iPhone 11 would go if it ever gets a purchase record. Line 15's "full" 2/2
includes the mis-filed iPhone 11.

## 5. Outstanding devices

| Item | Detail |
| --- | --- |
| 4 unidentified handsets | 1× iPhone 14 256GB (line 12), 1× iPhone 14 Pro 256GB (line 13), 1× iPhone 15 Plus 256GB (line 15), 1× iPhone 11 128GB (separate purchase) |
| Source needed | a photo of each handset, or the purchase document for the separate iPhone 11 |
| Reported sold | 3 phones — still **no sale record and no IMEI** anywhere in the system |
| Separately purchased iPhone 11 | `356344100479718` — needs supplier, date, cost, document reference |

## 6. State of the temporary authorization

`20261126140100_temporary_import_authorization` is **still live** and was relied
on for this staging. It must still be reverted in a forward-only follow-up when
you approve, as previously agreed.

## 7. Verification

- `opening_stock_units`: 44 rows, 44 distinct IMEIs — no duplicates.
- No IMEI appears in both `opening_stock_units` and `inventory_devices` (the
  latter holds 0 rows).
- `select count(*) where inspection ? 'activation_lock_cleared'` = 40, i.e. the
  12 newly staged units minus B4-09 plus the previous 29.
- `npm test`: **142 pass, 0 fail** (includes the updated migration-history pin).
- `lint` / `typecheck` could not run — `node_modules` is not installed in this
  environment. No TypeScript was changed in this step.

**Staged: 44. Held: 1 (+2 needing a decision). Outstanding: 4. Activated: 0.
Priced: 0. Sold: 0. Migrations applied: 0.**
