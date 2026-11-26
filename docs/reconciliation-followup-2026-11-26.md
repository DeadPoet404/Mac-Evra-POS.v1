# Reconciliation follow-up — device verdicts and corrections

Follow-up to [iphone-stock-master-reconciliation.md](iphone-stock-master-reconciliation.md).
Audit date: 2026-11-26.

**No database changes were made.** No migration applied, no invoice amount or
supplier record altered, no device staged, activated, priced or sold.

---

## 0. Corrections to the earlier report

Two statements in the previous documents were wrong. They are corrected here
rather than silently edited.

### C1. B3-07 `357174291687699` does **not** carry `activation_lock_cleared: true`

Earlier documents (Batch 3 report exception E4, and item E4 in the master
reconciliation) claimed this handset's inspection attested the lock was
cleared. **That was incorrect.** Verified against the live row:

| IMEI | `activation_lock_cleared` present? | Value |
| --- | --- | --- |
| `357174291687699` | **no** | absent |

Its inspection holds only `imei_confirmed_physical` and
`identity_labels_match` — exactly the two keys its photo supports. Two other
units are in the same position: `354071159671307` and `356133314172833`
(the three iPhone 13 Pro 256GB handsets, all on invoice line 10).

So the database never over-claimed on any of these three. **The problem is the
reverse of what was reported**: the photo for `357174291687699` shows
`Apple ID Lock — On` / `iCloud — On`, and the row correctly *withholds* the
assertion. No correction to the row is needed; the handset simply stays
blocked until it is actually wiped.

**29 of 32** staged units do carry `activation_lock_cleared: true`, and all 29
were photographed showing `Apple ID Lock — Off`. So the attestation is
supported by photo evidence everywhere it appears.

### C2. Sold-phone comparison belongs to receipt time, not now

The master reconciliation's §5 compared invoice quantity against
*sold-adjusted* physical stock, which produced four spurious `Δ = −1` rows.
Sold phones were still received, so the receipt comparison is invoice vs IMEIs
captured. Corrected in §3 below.

---

## 1. `356346100727657` — model and invoice line confirmed

Evidence from `photo_9_2026-11-26_07-37-51.jpg`, re-examined at full resolution:

| Field | Reading |
| --- | --- |
| Model line | **iPhone 11 · 128GB · Black** |
| Product type | `iPhone12,1 (A2223)` |
| Sales model | `MWN72 CH/A` |
| Serial | `DNPZFZJDN741` |
| ECID | `001E68AC0E30802E` |
| iOS | 26.6.2 (23G90) |
| Charge cycles | 1695 |
| Battery health | 75% |
| Apple ID Lock / iCloud | Off / Off |
| Photo timestamp | 11/25/2026, 6:25 PM |

**Verdict:** this is unambiguously an **iPhone 11 / 128GB / Black**. It is *not*
an iPhone 15 Plus. Its correct home is **invoice line 3 — iPhone 11 128GB**
(`87feec07-22cf-4c60-a576-89d37aa5de8a`), where it shares the line with
`352973115908719` and `352977112393080`.

It is currently filed on **line 15 — iPhone 15 Plus 256GB** at GHS 5,800 instead
of GHS 2,050. Both line 3 and line 15 show free capacity today (3/3 and 1/2),
because the two handsets that belong there were never staged — so the wrong
line is not visible as a capacity breach.

The phone body in the photo carries a "128" sticker, consistent with 128GB.

---

## 2. The two photographed-but-unstaged handsets

### 2.1 `357174297534176` — iPhone 13 Pro 128GB Green

`photo_2_2026-11-26_07-37-51.jpg`: iPhone 13 Pro · 128GB · Green,
`iPhone14,2 (A2639)`, sales model `MNDN3 CH/A`, serial `WTSWJPKCQL`,
1750 cycles, battery `No Data`, Apple ID Lock Off, **photo timestamp 11/25/2026
6:18 PM**.

### 2.2 `351374183841620` — iPhone 15 Plus 256GB Green

`photo_20_2026-11-26_07-37-51.jpg`: iPhone 15 Plus · 256GB · Green,
`iPhone15,5 (A3096)`, sales model `MTXK3 CH/A`, serial `PG32LPX4V2`,
941 cycles, battery 88%, Apple ID Lock Off, photo dated 11/25/2026.

### 2.3 Verdict on both

| Question | Answer |
| --- | --- |
| Physically remaining stock? | **Yes — evidence supports it.** Each was photographed in hand on 2026-11-25, *after* the receipt day |
| Sold? | **No evidence of sale.** `sales` has one `draft` row totalling 0; `sale_items` has 0 rows |
| Currently staged? | No — absent from `opening_stock_units` |
| Line capacity available? | Yes — line 9 has 2/4 free, line 15 has 1/2 free |

**Caveat, stated plainly:** the photos prove the handsets existed on
2026-11-25, not that they are on the shelf on 2026-11-26. Nothing in the system
records a disposal or a sale. Confirming they are *physically present today*
requires a physical check or Elvis's report.

---

## 3. Elvis's three reported sales

**No sale is recorded in the system.** `sales` = 1 row, `status = 'draft'`,
`total_pesewas = 0`. `sale_items` = 0 rows. `inventory_devices` = 0.
`store_inventory` = 0. `inventory_movements` = 0. `opening_stock_units` has no
`sold` status — its domain is `staged | activated` only.

Candidate handsets per reported sale (derived from model + storage matching the
invoice lines — **not** evidence of which unit left):

| Reported sale | Line | Candidate IMEIs | Match status |
| --- | --- | --- | --- |
| 1 × iPhone 14 256GB | 12 | `355374175939180` (staged) | **PENDING — no sale record** |
| 1 × iPhone 13 Pro 128GB | 9 | `351540482698867`, `357215264665590` (both staged) | **PENDING — 2 candidates, no sale record** |
| 1 × iPhone 15 Plus 256GB | 15 | `356346100727657` (actually an iPhone 11, mis-filed) | **PENDING — and the only staged 15 Plus is not a 15 Plus** |

**All three matches are left pending.** The IMEI of each sold handset cannot be
established from any source available here. Note the third row: line 15's single
staged unit is the mis-filed iPhone 11, so if a real iPhone 15 Plus was sold it
would have to be `351374183841620` — which is not staged at all. That is a
coherent story but it is **inference, not evidence**, so it is not recorded as a
match.

To close these: the sale receipts / Elvis's sales book, giving IMEI per sale.

---

## 4. The four handsets with no IMEI captured

Receipt-time reconciliation (§5) shows exactly four lines short by one unit each.
Each needs a photo or a physical read of the handset:

| # | Line | Model / storage | Source needed |
| --- | --- | --- | --- |
| 1 | 12 | iPhone 14 256GB | a photo of the second unit — only `355374175939180` was photographed |
| 2 | 13 | iPhone 14 Pro 256GB | a photo of the unit — none exists for this model at all |
| 3 | 15 | iPhone 15 Plus 256GB | a photo of the second unit — only `351374183841620` was photographed, and it is unstaged |
| 4 | — | iPhone 11 128GB (separate purchase) | the purchase document plus a photo of the unit |

No IMEI has been invented, inferred or back-filled for any of these.

---

## 5. The separately purchased iPhone 11

| Question | Finding |
| --- | --- |
| Model | **iPhone 11 / 128GB / Black**, `iPhone12,1 (A2223)`, `MWN72 CH/A` |
| IMEI | `356344100479718` (15 digits, Luhn + strict validator pass) |
| Serial | `C6KZC3HVN741` |
| Cycles / battery | 2413 / 74% |
| Photo evidence | `photo_11_2026-11-26_07-37-51.jpg`, dated 11/25/2026 6:27 PM |
| **Purchase cost** | **NOT ESTABLISHED** — no document supplied |
| **Supplier** | **NOT ESTABLISHED** — no document supplied |
| Purchase record in system | **None.** No second supplier invoice exists; the only other row (`a05ff39d…`) is a duplicate stub with 0 lines and the same declared total as the real invoice |

The invoice's GHS 2,050 for an iPhone 11 128GB is a plausible price for an
identical unit, but using it would be inventing a cost. **It is left blank.**
To stage this handset it needs its own purchase record: supplier, date, cost,
and document reference — from you, not from me.

---

## 6. iPhone 14 Plus 256GB storage correction — preserved

The correction is recorded as a **documentation annotation only**. The supplier
invoice is untouched: line 14 still reads *iPhone 14 Plus 128GB*, quantity 2,
GHS 4,100/unit, and its amount was not edited.

| Handset | Photo model line | Total disk capacity shown | Actual storage | Filed against |
| --- | --- | --- | --- | --- |
| `351111565339819` | iPhone 14 Plus · 128GB · Starlight | 238.30 GB | **256GB** | catalogue 128GB `09d147dd…` |
| `351111564542926` | iPhone 14 Plus · 128GB · Midnight | 238.30 GB | **256GB** | catalogue 128GB `09d147dd…` |

Evidence: both screens report `11.86 GB / 238.30 GB` and `9.17 GB / 239.28 GB`
respectively — a 128GB device cannot report ~238GB of capacity. The 3uTools
model line is mislabelled.

**Staging blocker:** `opening_stock_models` has **no iPhone 14 Plus 256GB
entry** — only 128GB (`09d147dd…`). A 256GB catalogue model would have to be
registered before these could be staged correctly, and because
`device_model_id` is immutable on a staged row, the existing rows would need
voiding and re-receiving.

---

## 7. B4-09 `356487109902568` — Activation Lock remains unresolved

Recorded as **unknown**, not cleared, and not touched.

`photo_15_2026-11-26_07-37-51.jpg` shows `Apple ID Lock — ◌ Online Query` with
the refresh spinner still turning, and `iCloud — ◌ Details` likewise unresolved.
The handset is **not staged**, so no attestation has been written for it. It must
not be marked `activation_lock_cleared: true` until the lock is queried
successfully and shows Off.

---

## 8. Receipt-time reconciliation (corrected)

Comparing invoice quantity with IMEIs captured — sold phones are excluded here
because they were still received.

| Line | Model | GB | Invoice | IMEIs captured | Δ |
| --- | --- | --- | --- | --- | --- |
| 1 | iPhone XR | 128 | 1 | 1 | — |
| 2 | iPhone SE (2nd gen) | 64 | 5 | 5 | — |
| 3 | iPhone 11 | 128 | 3 | 3 | — |
| 4 | iPhone 12 | 128 | 7 | 7 | — |
| 5 | iPhone 12 | 256 | 3 | 3 | — |
| 6 | iPhone 12 Pro | 256 | 1 | 1 | — |
| 7 | iPhone 13 | 128 | 7 | 7 | — |
| 8 | iPhone 13 | 256 | 3 | 3 | — |
| 9 | iPhone 13 Pro | 128 | 4 | 3 | **−1** |
| 10 | iPhone 13 Pro | 256 | 3 | 3 | — |
| 11 | iPhone 14 | 128 | 4 | 4 | — |
| 12 | iPhone 14 | 256 | 2 | 1 | **−1** |
| 13 | iPhone 14 Pro | 256 | 1 | 0 | **−1** |
| 14 | iPhone 14 Plus | 256 (invoice says 128) | 2 | 2 | — |
| 15 | iPhone 15 Plus | 256 | 2 | 1 | **−1** |
| | **Invoice total** | | **48** | **44** | **−4** |
| — | iPhone 11 (separate purchase) | 128 | 1 | 1 | — |
| | **Grand total** | | **49** | **45** | **−4** |

The four shortfalls are exactly the four handsets in §4. Every other line
reconciles exactly.

## 9. Current stock position

| Measure | Count |
| --- | --- |
| Physically held after the 3 reported sales (49 − 3) | **46** |
| IMEIs captured | 45 |
| Reported sold | 3 |
| Expected physical stock implied by captured IMEIs (45 − 3) | **42** |
| **Gap** | **4** |

The 4-unit gap is the same four unidentified handsets — they are expected to be
in stock but carry no IMEI. This is a documentation gap, not necessarily a
physical one.

---

## 10. Records ready for staging (awaiting your approval)

Nothing here has been staged. Each row states exactly what would be written.

| # | IMEI | Model | GB | Colour | Battery | Target line | Blocking issue |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | `357174297534176` | iPhone 13 Pro | 128 | Green | **NULL** | 9 | **none — ready** |
| S2 | `352973115908719` | iPhone 11 | 128 | Black | 82% | 3 | **none — ready** |
| S3 | `352977112393080` | iPhone 11 | 128 | Black | **NULL** | 3 | **none — ready** |
| S4 | `356682111671736` | iPhone 12 Pro | 256 | Silver | 62% | 6 | **none — ready** |
| S5 | `358806091433670` | iPhone XR | 128 | Red | 87% | 1 | **none — ready** |
| S6 | `359230405490921` | iPhone SE2 | 64 | white | 88% | 2 | **none — ready** |
| S7 | `356488100223210` | iPhone SE2 | 64 | Black | **NULL** | 2 | **none — ready** |
| S8 | `356476106237235` | iPhone SE2 | 64 | Red | **NULL** | 2 | **none — ready** |
| S9 | `356781113561224` | iPhone SE2 | 64 | white | **NULL** | 2 | **none — ready** |
| S10 | `356129173669232` | iPhone 13 | 128 | Midnight | **NULL** | 7 | **none — ready** |
| S11 | `351374183841620` | iPhone 15 Plus | 256 | Green | 88% | 15 | **none — ready** |
| S12 | `356487109902568` | iPhone SE2 | 64 | Black | **NULL** | 2 | **blocked** — Activation Lock unresolved |

**11 of 12 are ready.** S12 must wait: its lock state was never queried, so a
`staged` row would have to omit `activation_lock_cleared`, which is permitted,
but staging it now would risk accepting a locked handset. Recommend querying
the lock first.

Every staged row would carry `condition = NULL`, `approved_price_pesewas = NULL`,
`status = 'staged'`, and only the three photo-supported inspection keys
(`imei_confirmed_physical`, `identity_labels_match`, and
`activation_lock_cleared` **only where the photo shows Off**).

### Not ready — needs a decision first

| IMEI | Issue | What it needs |
| --- | --- | --- |
| `356346100727657` | staged on the wrong line (15, should be 3) | void + re-receive onto line 3 — changes staging data |
| `356344100479718` | no purchase record | supplier, date, cost, document reference |
| `351111565339819` | 256GB filed on a 128GB catalogue model | register a 14 Plus 256GB model, then void + re-receive |
| `351111564542926` | same as above | same as above |

### Catalogue prerequisite

`opening_stock_models` currently has 15 entries and **no iPhone 14 Plus 256GB**.
Registering one is a catalogue change, not a migration, but it alters reference
data — so it is listed for approval rather than done.

## 11. Open items summary

| Ref | Item | State |
| --- | --- | --- |
| C1 | `357174291687699` lock attestation | **resolved — no defect;** earlier report was wrong |
| — | `356346100727657` wrong invoice line | confirmed mis-filed; fix needs approval |
| — | `357174297534176`, `351374183841620` | confirmed present on 2026-11-25, unstaged, ready |
| — | 3 sold phones | **all pending** — no sale record, no IMEI anywhere |
| — | 4 missing IMEIs | awaiting photos / purchase document |
| — | separate iPhone 11 cost & supplier | **not established** — awaiting purchase document |
| — | 14 Plus 256GB catalogue entry | missing; blocks correct staging of 2 units |
| — | B4-09 lock | unresolved; must stay unmarked |

**Staged: 32. Activated: 0. Priced: 0. Sold: 0. Migrations applied: 0.**
