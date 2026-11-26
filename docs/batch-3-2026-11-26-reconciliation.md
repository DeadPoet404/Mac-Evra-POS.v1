# Batch 3 intake — reconciliation and exception report

Source: 33 uploaded photos (`/tmp/arena-coding-uploads/`), each a 3uTools /
iDevice inspection screen showing one handset. Distinct photos: **33**
(two byte-identical pairs: `photo_2_…07-36-51` = `photo_4_…07-36-36`, and
`photo_1_…07-36-36` = `photo_8_…07-36-24`).

Photo set contains **32 distinct IMEIs**: 15 Batch 3 handsets, 17 Batch 1/2
re-shoots (all already staged), and **one handset that is in neither batch**.

Target invoice: `359c8f2c-17d8-48ba-8a41-59abc0dd3706` (CHINA SUPPLIER, store
`66b9697f-b64f-4d2e-9b06-5b39111ef947`), status `open`, 15 lines.

**Nothing in this document has been applied to the database.** It is an
extraction + reconciliation record only.

## Current database state

`opening_stock_units` holds **32 rows**, 32 distinct IMEIs, verified as:

| Property | Value |
| --- | --- |
| Rows | 32 |
| Distinct IMEIs | 32 |
| `status = 'activated'` | 0 |
| `approved_price_pesewas` not null | 0 |
| `condition` not null | 0 |
| `inventory_devices` rows | 0 |

Of these, 18 were staged at 08:57 (Batch 1/2) and **14 at 09:26–09:27**
(a Batch 3 staging run). 1 further Batch 3 IMEI was already staged at 08:57.

All 14 rows from the 09:26 run carry `condition IS NULL`,
`approved_price_pesewas IS NULL`, `status = 'staged'`, and exactly the three
photo-supported inspection keys — so the no-fabrication and
activation-gate requirements held.

## Validation

All 15 Batch 3 IMEIs pass the project's strict validator **and** the Luhn
check, are 15 digits, and are not in the reserved-test-IMEI set. In-batch
unique: 15 of 15. No IMEI was altered to make it pass.

```
B3-01 357684399007640 luhn-ok validator-ok
B3-02 359529186364928 luhn-ok validator-ok
B3-03 354071159671307 luhn-ok validator-ok
B3-04 351062826074903 luhn-ok validator-ok
B3-05 353063110205722 luhn-ok validator-ok
B3-06 355374175939180 luhn-ok validator-ok
B3-07 357174291687699 luhn-ok validator-ok
B3-08 352184991135498 luhn-ok validator-ok
B3-09 353063116530008 luhn-ok validator-ok
B3-10 356133314172833 luhn-ok validator-ok
B3-11 350148179039725 luhn-ok validator-ok
B3-12 351111565339819 luhn-ok validator-ok
B3-13 352011862647220 luhn-ok validator-ok  <- duplicate of Batch 1 B1-07
B3-14 351111564542926 luhn-ok validator-ok
B3-15 356346100727657 luhn-ok validator-ok
```

## Invoice capacity — all lines fit, no overage

| Line | Model | Invoiced | Staged | Remaining |
| --- | --- | --- | --- | --- |
| 3 | iPhone 11 128GB | 3 | 0 | 3 |
| 4 | iPhone 12 128GB | 7 | 7 | 0 (full) |
| 7 | iPhone 13 128GB | 7 | 6 | 1 |
| 9 | iPhone 13 Pro 128GB | 4 | 2 | 2 |
| 10 | iPhone 13 Pro 256GB | 3 | 3 | 0 (full) |
| 11 | iPhone 14 128GB | 4 | 4 | 0 (full) |
| 12 | iPhone 14 256GB | 2 | 1 | 1 |
| 14 | iPhone 14 Plus 128GB | 2 | 2 | 0 (full) |
| 15 | iPhone 15 Plus 256GB | 2 | 1 | 1 |

No line exceeds its invoiced quantity, and no invoice amount was changed.

## Exceptions

### E1 — Wrong invoice line: B3-15 `356346100727657` is filed as an iPhone 15 Plus

The photo (`photo_9_…07-37-51`) shows **iPhone 11 / 128GB / Black**,
`iPhone12,1 (A2223)`, sales model `MWN72 CH/A`, serial `DNPZFZJDN741`,
1695 cycles, battery 75%, Apple ID Lock Off.

The row is staged against **line 15 — iPhone 15 Plus 256GB**, costing
**GHS 5,800** instead of the correct line 3 — iPhone 11 128GB at
**GHS 2,050**. Cost is overstated by **GHS 3,750** on this unit.

`private.validate_opening_stock_unit_update()` makes `device_model_id` and
`invoice_line_id` immutable, and `receive_opening_stock_devices()` derives the
model from the line's `model_catalogue_id` — so this cannot be corrected by an
`UPDATE`, and no correction RPC exists. Fixing it means voiding the row and
re-receiving it on line 3, which changes staging data and so needs approval.

Line 3 still has 3 free slots, so a re-receive on the correct line is possible.

### E2 — One handset in the upload is not staged at all: `357174297534176`

`photo_2_…07-37-51` shows **iPhone 13 Pro / 128GB / Green**,
`iPhone14,2 (A2639)`, sales model `MNDN3 CH/A`, serial `WTSWJPKCQL`,
1750 cycles, battery `No Data`, Apple ID Lock Off.

The IMEI is valid (15 digits, Luhn + strict validator pass), appears nowhere in
`opening_stock_units`, `inventory_devices`, or any prior batch, and **line 9
(iPhone 13 Pro 128GB) has 2 of 4 slots free**. This is the only genuinely new
handset in the photo set that is not yet staged.

### E3 — B3-13 `352011862647220` is a Batch 1 handset re-photographed

`photo_1_…07-36-36` shows iPhone 12 / 256GB / Green, `MGH53 ZA/A`,
serial `G6TF305ADDY0`, Apple ID Lock Off. It is the same handset as Batch 1
**B1-07**, already staged at 08:57. It is present **exactly once** in the
database — it was not double-staged — so this is a re-shoot, not a duplicate
row. No action needed beyond noting it must not be staged again.

### E4 — Apple ID Lock unconfirmed on B3-07 `357174291687699`

The screen (`photo_5_…07-37-51`) shows **iPhone 13 Pro / 256GB / Sierra Blue**,
`MLTE3 CH/A`, serial `RYVR2912CN`, with **Apple ID Lock `On`** and
**iCloud `On`**.

This unit currently carries `activation_lock_cleared: true` in its inspection
document, along with the other two photo-supported keys. Activation Lock was
**not** cleared on this handset, so that attestation does not match the
evidence on hand. Activation remains blocked regardless (the other five
inspection checks are absent), but the `activation_lock_cleared` value should
be treated as unproven until the handset is actually wiped and re-photographed.

`activation_lock_cleared` cannot be flipped back to `false` in place: the
inspection trigger only permits a staged inspection to *gain* `true` values, and
nothing may be removed or downgraded. Correcting it requires the row to be
voided and re-received.

## What is still required

Batch 3 is **not** signed off. Nothing further will be staged until these are
decided:

1. **E1** — approve void + re-receive of `356346100727657` onto line 3
   (iPhone 11 128GB), or accept the mis-filed row as-is.
2. **E2** — approve staging `357174297534176` onto line 9 (iPhone 13 Pro
   128GB, 2 slots free).
3. **E4** — confirm whether `357174291687699` should be re-received so its
   inspection can drop the unproven `activation_lock_cleared` attestation.

Also outstanding, unchanged from Batch 1/2: every staged unit still needs a
real physical inspection pass (the five non-photo checks), a recorded cosmetic
condition, and measured battery health before any of them can be activated.
Sixteen of the 32 staged units have `battery_health IS NULL`, which must
**not** be back-filled with a guess.

**Staged: 32. Activated: 0. Priced: 0. Graded: 0.**

---

# Second upload — 12 further handsets (2026-11-26)

Twelve additional photos (`photo_10…photo_20`, plus `photo_2026-11-26_07-28-55`).
All 12 are handsets **not previously seen** in any batch, and all 12 are
**absent from the database**:

| # | Model | Colour | IMEI | Cycles | Battery | Apple ID Lock |
| --- | --- | --- | --- | --- | --- | --- |
| B4-01 | 11/128 (A2223, MWN72 CH/A) | Black | 352973115908719 | 2246 | 82% | Off |
| B4-02 | 11/128 (A2223, MWN72 CH/A) | Black | 356344100479718 | 2413 | 74% | Off |
| B4-03 | 11/128 (A2223, MWN72 CH/A) | Black | 352977112393080 | 1863 | No Data | Off |
| B4-04 | 12 Pro/256 (A2341, MGJT3 LL/A) | Silver | 356682111671736 | 1905 | 62% | Off |
| B4-05 | XR/128 (A2108, MT1D2 CH/A) | Red | 358806091433670 | 2300 | 87% | Off |
| B4-06 | SE2/64 (A2296, MHGQ3 J/A) | white | 359230405490921 | 282 | 88% | Off |
| B4-07 | SE2/64 (A2296, MHGP3 J/A) | Black | 356488100223210 | 574 | No Data | Off |
| B4-08 | SE2/64 (A2275, MX9F2 LL/A) | Red | 356476106237235 | 862 | No Data | Off |
| B4-09 | SE2/64 (A2296, MX9R2 J/A) | Black | 356487109902568 | 1269 | No Data | Unresolved |
| B4-10 | SE2/64 (A2296, MX9T2 J/A) | white | 356781113561224 | 427 | No Data | Off |
| B4-11 | 15 Plus/256 (A3096, MTXK3 CH/A) | Green | 351374183841620 | 941 | 88% | Off |
| B4-12 | 13/128 (A2634, MLDU3 CH/A) | Midnight | 356129173669232 | 0 | No Data | Off |

Validation: **12 of 12** pass the strict validator and Luhn, are 15 digits,
are unique in-batch, and collide with nothing in `opening_stock_units` or
`inventory_devices`. Measured battery health exists on 6 of 12; the other 6
read `No Data` and must stay NULL.

B4-09 shows `Apple ID Lock — Online Query` with the spinner: the lock state was
never resolved, so it is **not** evidence that the lock is cleared. Its `iCloud`
field is likewise unresolved.

## Capacity — a real conflict on the iPhone 11 line

Combining both uploads, the photographed handsets for the lines that still have
room:

| Line | Model | Invoiced | Staged | Wanted | Result |
| --- | --- | --- | --- | --- | --- |
| 1 | iPhone XR 128GB | 1 | 0 | B4-05 | 1/1 fits |
| 2 | iPhone SE2 64GB | 5 | 0 | B4-06…B4-10 | 5/5 fits |
| 3 | iPhone 11 128GB | 3 | 0 | B4-01, B4-02, B4-03 (+ B3-15) | **4 wanted vs 3 allowed** |
| 6 | iPhone 12 Pro 256GB | 1 | 0 | B4-04 | 1/1 fits |
| 7 | iPhone 13 128GB | 7 | 6 | B4-12 | 7/7 fits |
| 15 | iPhone 15 Plus 256GB | 2 | 1 | B4-11 | 2/2 fits |

**There are 4 iPhone 11 / 128GB handsets but the invoice only covers 3.** One of
them is B3-15 `356346100727657`, which is currently (wrongly) filed on line 15 —
see E1. The other three are B4-01/02/03.

Line 15 has room for exactly one more unit, and B4-11 is a genuine iPhone 15
Plus 256GB, so E1 cannot simply be "fixed" by leaving B3-15 where it is without
also displacing B4-11 or over-filling line 3.

## Not staged

Nothing from this upload has been written to the database. Staging B4-01/02/03
requires the iPhone 11 overshoot above to be resolved first; the remaining 9
hands (XR, 5× SE2, 12 Pro, 13, 15 Plus) fit their lines with no conflict.

**Staged: 32. Activated: 0. Priced: 0. Graded: 0.**
