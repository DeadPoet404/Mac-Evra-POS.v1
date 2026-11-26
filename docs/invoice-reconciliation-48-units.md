# Invoice reconciliation — 44 staged units against 48 invoiced units

Audit date: 2026-11-26. **Read-only.** No migration applied, no unit staged,
no invoice quantity or amount changed, nothing activated, priced or sold.

Invoice: `359c8f2c-17d8-48ba-8a41-59abc0dd3706`, CHINA SUPPLIER, 15 lines,
declared total GHS 146,550, status `open`, confirmed 2026-11-24.

Database totals at time of audit:

| Measure | Value |
| --- | --- |
| Units in `opening_stock_units` | **44** |
| Distinct IMEIs | **44** |
| `status = 'staged'` | 44 |
| `status = 'activated'` | 0 |
| Sum of `quantity_invoiced` on the invoice | **48** |

## 1. Invoice-line table

`Staged IMEIs` lists every unit currently assigned to that line, annotated with
the model **the row actually stores**. That annotation matters on lines 14 and
15 — see §3 and §4.

| Line | Invoice model | GB | Invoiced | Staged | Staged IMEIs (stored model) | Unstaged | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | iPhone XR | 128 | 1 | 1 | `358806091433670` (XR 128GB) | 0 | — |
| 2 | iPhone SE (2nd generation) | 64 | 5 | 5 | `359230405490921`, `356488100223210`, `356476106237235`, `356487109902568`, `356781113561224` (all SE2 64GB) | 0 | — |
| 3 | iPhone 11 | 128 | 3 | 2 | `352973115908719`, `352977112393080` (both 11 128GB) | **1** | No handset with a captured IMEI. `356344100479718` is the separately purchased unit and has no purchase record. `356346100727657` is an iPhone 11 but is filed on line 15 (§4). |
| 4 | iPhone 12 | 128 | 7 | 7 | `350148179039725`, `353061115375227`, `353063110205722`, `353063116530008`, `355305619796133`, `355597756487829`, `357711645300790` | 0 | — |
| 5 | iPhone 12 | 256 | 3 | 3 | `352011862647220`, `353142766535796`, `354032283872880` | 0 | — |
| 6 | iPhone 12 Pro | 256 | 1 | 1 | `356682111671736` | 0 | — |
| 7 | iPhone 13 | 128 | 7 | 7 | `351887639266605`, `352279171784816`, `351062826074903`, `352184991135498`, `355839990795272`, `357106632493833`, `356129173669232` | 0 | — |
| 8 | iPhone 13 | 256 | 3 | 3 | `351062823645416`, `356012713402811`, `352905619055902` | 0 | — |
| 9 | iPhone 13 Pro | 128 | 4 | 3 | `351540482698867`, `357215264665590`, `357174297534176` | **1** | One handset was never photographed — no IMEI exists for it. |
| 10 | iPhone 13 Pro | 256 | 3 | 3 | `354071159671307`, `356133314172833`, `357174291687699` | 0 | — |
| 11 | iPhone 14 | 128 | 4 | 4 | `355374173131772`, `356124717842528`, `357684399007640`, `359529186364928` | 0 | — |
| 12 | iPhone 14 | 256 | 2 | 1 | `355374175939180` | **1** | Second handset never photographed — no IMEI exists for it. |
| 13 | iPhone 14 Pro | 256 | 1 | 0 | *(none)* | **1** | No photo of this model exists at all — no IMEI. |
| 14 | iPhone 14 Plus | 128 | 2 | 2 | `351111564542926`, `351111565339819` (**stored as 128GB**, physically 256GB) | 0 | Quantity complete; the storage attribute is wrong (§3). |
| 15 | iPhone 15 Plus | 256 | 2 | 2 | `351374183841620` (15 Plus 256GB), `356346100727657` (**stored as 15 Plus 256GB, actually an iPhone 11**) | 0 | Quantity complete; one unit is the wrong model (§4). |
| | **Total** | | **48** | **44** | | **4** | |

Sum check: 1+5+2+7+3+1+7+3+3+3+4+1+0+2+2 = **44** staged; 48 − 44 = **4** unstaged.

## 2. The four unstaged units

| # | Line | Model | Why it is unstaged |
| --- | --- | --- | --- |
| 1 | 9 | iPhone 13 Pro 128GB | Never photographed. `receive_opening_stock_devices` requires an IMEI per unit; no IMEI was ever captured, and inventing one is prohibited. |
| 2 | 12 | iPhone 14 256GB | Never photographed — only one of the two units has a photo. |
| 3 | 13 | iPhone 14 Pro 256GB | Never photographed; no image of this model exists in any upload. |
| 4 | 15 | iPhone 15 Plus 256GB | Never photographed; only `351374183841620` was captured for this line. |

None can be staged without a photo or a physical IMEI read of the handset.

## 3. The two iPhone 14 Plus 256GB units — how they appear in the 44

**Short answer: they are already inside the 44, as line 14's two units, but they
are stored against the 128GB model.**

| IMEI | Line | Stored `device_model_id` | Physical storage | Colour |
| --- | --- | --- | --- | --- |
| `351111564542926` | 14 | iPhone 14 Plus **128GB** (`09d147dd…`) | **256GB** | Midnight |
| `351111565339819` | 14 | iPhone 14 Plus **128GB** (`09d147dd…`) | **256GB** | Starlight |

How this arose: `receive_opening_stock_devices` sets `device_model_id` from the
invoice line's `model_catalogue_id`. Line 14 points at the 128GB catalogue entry,
so both rows were written as 128GB at receipt time. The units themselves are
256GB — both screens report ~238GB usable (`11.86 GB / 238.30 GB` and
`9.17 GB / 239.28 GB`).

What this does and does not affect:

- **Unit count: unaffected.** Line 14 shows 2 invoiced, 2 staged. The 44 total
  and the 48 reconciliation are not distorted by this.
- **Stock by variant: affected.** The database currently reports **2 × iPhone 14
  Plus 128GB** in stock when the truth is **2 × iPhone 14 Plus 256GB**. Any
  variant-level stock or pricing report will be wrong.
- The supplier invoice still says 128GB. That is the description you told me is
  incorrect, and it has not been altered.

Why it cannot simply be fixed: `device_models` already contains an iPhone 14
Plus 256GB (`e91cc4bc…`), but `opening_stock_models` has **no active entry** for
it in this store, and `register_opening_stock_model` fails for a JWT-less caller
on the `created_by_*` NOT NULL columns. More fundamentally, line 14's
`model_catalogue_id` itself references the 128GB variant, so a correct fix
changes **which model the supplier invoice line refers to** — a supplier-record
change, which is out of bounds without your decision.

## 4. Current line assignment of `356346100727657`

| Field | Value |
| --- | --- |
| IMEI | `356346100727657` |
| **Invoice line** | **15** |
| Line model | iPhone 15 Plus 256GB |
| `quantity_invoiced` (line 15) | 2 |
| Units staged on line 15 | 2 |
| Stored `device_model_id` | iPhone 15 Plus **256GB** |
| Stored `unit_cost_pesewas` | **580,000** (GHS 5,800) |
| **Actual handset** | **iPhone 11 / 128GB / Black** — `iPhone12,1 (A2223)`, `MWN72 CH/A`, serial `DNPZFZJDN741` |
| Correct line | 3 (iPhone 11 128GB), unit cost 205,000 |
| Cost overstatement | **GHS 3,750** on this unit |

Line 15 therefore **appears complete at 2/2 but holds only one genuine iPhone 15
Plus**. Conversely, line 3 shows 2/3 when a third iPhone 11 is physically present.
The line-level totals still sum to 44 against 48, so the *aggregate* balances —
the error is in per-line model attribution, not count.

## 5. Corrections to earlier reported totals

Two figures in the execution report need qualifying. Neither changes the 44.

| Earlier claim | Correction |
| --- | --- |
| "Line 15 is full at 2/2 with only one real iPhone 15 Plus" | **Accurate**, and now proven: the second unit is `356346100727657`, an iPhone 11. Keep reading line 15 as **1 × 15 Plus + 1 × mis-filed 11**. |
| "Line 14 reconciles 2/2" | **Accurate for count, wrong for variant.** Both units are 256GB handsets stored as 128GB. Line 14 should read *2 × iPhone 14 Plus 256GB*. |
| "44 staged, 4 outstanding" | **Confirmed.** 44 + 4 = 48. |
| Reported stock of **46 physical** vs 42 implied by IMEIs | Unchanged. 45 captured IMEIs − 3 reported sales = 42; the 4-unit gap is the 4 unidentified handsets. |

## 6. Does the 48-unit reconciliation balance?

**In quantity, yes — exactly:**

```
invoiced 48
  staged 44  (1+5+2+7+3+1+7+3+3+3+4+1+0+2+2)
unstaged  4  (lines 9, 12, 13, 15)
         --
         48   ✓
```

**In model attribution, no — two lines are misrepresented:**

| Line | Reads as | Actually holds | Effect |
| --- | --- | --- | --- |
| 14 | 2 × iPhone 14 Plus **128GB** | 2 × iPhone 14 Plus **256GB** | 128GB stock overstated by 2, 256GB understated by 2 |
| 15 | 2 × iPhone 15 Plus 256GB | 1 × 15 Plus 256GB + 1 × iPhone 11 128GB | 15 Plus overstated by 1, iPhone 11 understated by 1 |
| 3 | 2 × iPhone 11 128GB, 1 outstanding | 3 × iPhone 11 physically present | iPhone 11 understated by 1 |

Net effect if the two mis-filed units were corrected: line 3 → 3/3 (full), line
14 → 2/2 as 256GB, line 15 → 1/2 (one genuine 15 Plus staged, one outstanding,
which is the handset that was never photographed). The 48 total is unchanged
either way — **no invoice quantity would move.**

## 7. Remaining discrepancies

| # | Discrepancy | Blocks |
| --- | --- | --- |
| D1 | `356346100727657` on line 15 instead of line 3 | Needs the prepared, **unapplied** correction migration. Identity columns immutable; deletes refused. |
| D2 | Two 14 Plus units stored as 128GB | Needs a decision on changing line 14's catalogue model reference. Cannot be done within the current grants. |
| D3 | 4 handsets with no IMEI captured (lines 9, 12, 13, 15) | Needs photos or physical IMEI reads. |
| D4 | `356344100479718` (separate iPhone 11) has no purchase record | Needs supplier, date, cost and document reference from you. |
| D5 | 3 reported sales have no record anywhere | Needs sale receipts / Elvis's sales book with IMEIs. |
| D6 | Duplicate invoice stub `a05ff39d…` (0 lines, same declared total) | Cosmetic; flagged for cleanup. |
| D7 | `20261126140100` temporary authorization still live | Needs the agreed forward-only revert. |

## 8. Status

- **48-unit quantity reconciliation: balanced** (44 + 4).
- **Model-level attribution: 2 lines wrong** (14 and 15), 1 line understated (3).
- No database change was made in this audit.
- **Staging is paused** until you decide D1 and D2. The 4 remaining units cannot
  be staged regardless, since none has an IMEI.

**Staged: 44. Unstaged: 4. Activated: 0. Priced: 0. Sold: 0. Migrations applied: 0.**
