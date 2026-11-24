# Mac Evra POS — Application UI/UX Audit

**Date:** 24 November 2026
**Scope:** entire application (every route, page, component, form, table, dialog, navigation element, and workflow)
**Branch inspected:** `arena/ccb9c647-mac-evra-pos-v1` @ `ae5ee895`
**Nature of work:** inspection and analysis only. No source file was modified, nothing was committed, and nothing was deployed.

---

## Contents

- [0. How this audit was done (and its limits)](#0-how-this-audit-was-done-and-its-limits)
- [1. Executive summary](#1-executive-summary)
- [A. Application map](#a-application-map)
- [B. Current workflows](#b-current-workflows-the-real-sequences)
- [C. Screen-by-screen findings](#c-screen-by-screen-findings)
- [D. The 15 biggest UX problems](#d-the-15-biggest-ux-problems-ranked)
- [E. Proposed improvements](#e-proposed-improvements)
- [F. Suggested redesigned workflows](#f-suggested-redesigned-workflows)
- [G. Design consistency and a proposed design system](#g-design-consistency-and-a-proposed-design-system)
- [H. Implementation roadmap](#h-implementation-roadmap)
- [I. What I recommend we decide together](#i-what-i-recommend-we-decide-together)

---

## 0. How this audit was done (and its limits)

**What I read.** All 86 TypeScript/TSX files under `src/`, the six documents in `docs/`, `README.md`, and the role/permission seed in `supabase/migrations/20261123060000_phase_01_foundation.sql`. Every route, server action, layout guard, and shared component was read end to end — this is a full read of the codebase, not a sample.

**What I ran.** I installed dependencies and started the real Next.js app (`next dev`, Turbopack, port 3007). I confirmed:

| Request | Observed result |
| --- | --- |
| `GET /` | `200` — renders the real sign-in screen ("Good to have you here.", Work email, "Sign in securely") |
| `GET /home` | `307` → `/?next=%2Fhome` |
| `GET /manager` | `307` → `/?next=%2Fmanager` |
| `GET /trade-in` | `307` → `/?next=%2Ftrade-in` |

**The limitation, stated plainly.** Every authenticated screen is gated twice — once in `src/lib/supabase/proxy.ts` (token validation + `evaluateRouteAccess`), and again in each route's `layout.tsx` via `requirePermissions`. There is no local Supabase stack in this environment (`docker` is unavailable) and no fixtures, so I could not obtain a session. **I therefore could not view rendered authenticated screens.** Everything below about authenticated pages is derived from reading the exact JSX, Tailwind classes, permission guards, server actions, and data loaders that produce them — which for the specific claims I make (table min-widths, control heights, number of forms, redirect chains, which fields are prefilled from which record) is fully determinable from source. Where a judgement depends on live data or pixel rendering I say so. I have not invented any screen behaviour.

**One honest caveat on "2,300-line file" style claims.** Line counts and element counts below were produced by reading/grepping the files, so they are exact.

---

## 1. Executive summary

Mac Evra POS is **two products in one repository, and they are at very different maturity levels.**

- The **employee sale spine is real and well-engineered.** IMEI → payment → customer → completion is backed by a genuine state machine (`create_sale_draft` → `add_sale_item` → `confirm_sale_payment` → `create_completed_sale_customer`), integer-pesewa money, RLS-scoped reads, and append-only audit. The backend is more sophisticated than the UI that sits on it.
- The **manager workspace is a polished mock-up wrapped around two real screens.** `/manager/inventory` and `/manager/sales` read live Supabase rows. `/manager` (dashboard), `/manager/approvals`, `/manager/reports` and `/manager/settings` read hardcoded arrays from `src/lib/manager-data.ts` and local React state. A manager can look at a "Confirmed revenue GH₵28,400" card, an "Export CSV" button that writes a **fabricated financial report to disk**, and an approvals queue with approve/decline buttons that change nothing, all without a single visual cue that would stop them believing it — the "Preview data" badge is one small pill in the sidebar header.
- The **trade-in flow is a demo that looks finished.** Six steps, careful inspection UI, an invented valuation model, and a final "Prepare Manager Approval" button that only sets `submitted = true` in component state. Nothing is persisted, nothing reaches `/manager/approvals`, and a page refresh destroys the whole inspection.
- **Opening Stock is functionally real but interactionally hostile.** Nine separate forms, five collapsible `<details>` sections, one ~3,300-pixel page, a full round trip per device activation, and — worst — two correction forms whose default values are bound to `invoices[0]` / `lines[0]` while their dropdowns let you pick *any* invoice or line. Selecting invoice #3 and pressing submit writes invoice #1's identity onto invoice #3.
- **The two workspaces have no door between them.** There is not one `<Link>` from the manager shell to `/home`, `/new-sale`, `/inventory`, or `/trade-in`, and the employee shell has no manager entry. A manager who also sells must type URLs.

The good news for the redesign conversation: the domain rules are correct and enforced server-side, so **almost everything recommended in this report is frontend-only.** The exceptions are listed explicitly in §E and §H.

**The three things I would fix first, before any visual polish:**
1. The Opening Stock correction forms that write the wrong invoice's data (§D-1).
2. The unlabelled fabricated financial data in dashboard/reports/approvals (§D-2).
3. Managers landing on the employee home page with no route to their own workspace (§A.4, §D-3).

---

## A. Application map

### A.1 Route inventory (discovered, not assumed)

Every route is a Next.js App Router segment under `src/app/`. Guard columns are from the route's `layout.tsx` plus `src/lib/auth/policy.ts`.

| Route | File | Purpose | Audience | Data source | Guard |
| --- | --- | --- | --- | --- | --- |
| `/` | `src/app/page.tsx` + `login-form.tsx` | Email/password sign-in on a photo background | Both | Supabase Auth via server action | Public (redirects if signed in) |
| `/auth/confirm` | `src/app/auth/confirm/route.ts` | Email token + invitation acceptance | Both | Auth + DB RPC | Public |
| `/auth/set-password` | `src/app/auth/set-password/page.tsx` | First-time password (min 12 chars) | Both | Auth | Public (requires session) |
| `/home` | `src/app/home/page.tsx` → `home-client.tsx` | Employee landing; 3 large image cards | **Employee** | Display name only | `access_employee_workspace` |
| `/inventory` | `src/app/inventory/page.tsx` | Search real IMEI-level stock | **Employee** | **Live** `listAuthorizedInventory` | `access_employee_workspace` |
| `/new-sale` | `src/app/new-sale/page.tsx` | Step 1 — start/resume draft, verify IMEI | **Employee** | **Live** sales + inventory | `+ create_sales` |
| `/new-sale/payment` | `.../payment/page.tsx` | Step 2 — record one full manual payment | **Employee** | **Live** | `+ reserve_inventory` |
| `/new-sale/customer-info` | `.../customer-info/page.tsx` | Step 3 — capture customer | **Employee** | **Live** | `+ create_sales` |
| `/new-sale/complete` | `.../complete/page.tsx` | Step 4 — success / cancelled / unpaid status | **Employee** | **Live** | `+ create_sales` |
| `/new-sale/checkout` | `.../checkout/page.tsx` | Legacy redirect → `/new-sale/payment` | — | none | `+ create_sales` |
| `/trade-in` | `src/app/trade-in/page.tsx` | 6-step trade-in + replacement preview | **Employee** | **Mock** (`src/lib/inventory.ts`, local state) | `+ process_trade_ins` |
| `/manager` | `src/app/manager/page.tsx` | Store overview: metrics, chart, approvals, recent sales | **Manager** | **Mixed** — inventory live, finance/sales/approvals mock | `access_manager_workspace` |
| `/manager/sales` | `.../manager/sales/page.tsx` | Sale + payment register with detail panel | **Manager** | **Live** `listManagerSales` | `access_manager_workspace` |
| `/manager/inventory` | `.../manager/inventory/page.tsx` | IMEI register with detail panel | **Manager** | **Live** `listAuthorizedInventory` | `+ manage_inventory` |
| `/manager/opening-stock` | `.../opening-stock/page.tsx` | Supplier intake, receiving, activation, repricing, corrections | **Manager** | **Live** | `+ manage_inventory` |
| `/manager/employees` | `.../manager/employees/page.tsx` | Directory, invitations, role/status changes | **Manager** | **Live** | `+ manage_employee_access` |
| `/manager/approvals` | `.../manager/approvals/page.tsx` | Approval queue + decision panel | **Manager** | **Mock** (client state) | `+ review_approvals` |
| `/manager/reports` | `.../manager/reports/page.tsx` | Period revenue, margin, breakdowns, CSV export | **Manager** | **Mock**, rescaled by hardcoded factors | `+ view_reports` |
| `/manager/settings` | `.../manager/settings/page.tsx` | Store / account / POS / preferences | **Manager** | **Mock** (local state) | `+ manage_store_settings` |

**There is no device/model catalogue route.** `README.md` lists one only implicitly; catalogue data (`device_models`) is managed *inside* Opening Stock via "Register a model" and `ModelSelector`. Treating "Device/model catalogue" as a separate manager route would be inventing a feature.

**Missing infrastructure routes:** zero `loading.tsx`, zero `error.tsx`, zero `not-found.tsx` in the entire tree.

### A.2 Shared components (the actual system)

| Component | File | Used by |
| --- | --- | --- |
| `PageHeader`, `MetricCard`, `DataBadge`, `DemoNotice`, `EmptyState`, `DetailRow` | `src/components/manager/manager-ui.tsx` | Manager pages only |
| `ManagerShell` (sidebar, header, account menu) | `src/components/manager/manager-shell.tsx` | All `/manager/**` |
| `EmployeeHeader` (sticky bar + back link) | `src/components/employee/employee-header.tsx` | `/inventory`, `/new-sale*`, `/trade-in` |
| `DeviceCard`, `DeviceStatus`, `SaleDeviceSummary` | `src/components/employee/device-card.tsx` | **Only `/trade-in`** (mock inventory) |
| `ActionCards` | `src/app/home/action-cards.tsx` | **Nothing — dead file** |
| shadcn primitives (`Card`, `Button`, `Input`, `Badge`, `Separator`, `Avatar`, `DropdownMenu`, `Sidebar`, `Sheet`, `Skeleton`, `Table`, `Tabs`, `Tooltip`, `Select`) | `src/components/ui/*` | Manager pages only. `Table`, `Tabs`, `Select`, `Skeleton`, `Tooltip` are **never imported by any page** — every table is hand-rolled `<table>` markup |

**Two parallel UI systems exist.** Employee pages use raw `<div>` + Tailwind with `rounded-2xl`/`rounded-3xl` and ad-hoc `text-[38px]`/`text-[42px]` sizes. Manager pages use shadcn `<Card>`/`<Button>`/`<Input>`. Neither uses the CSS variables declared in `globals.css` — every surface hardcodes hex (`#6E0728`, `#E8E8ED`, `#86868B`, …). The `.manager-theme` token block in `globals.css` is therefore decorative.

### A.3 Navigation graph (what actually connects to what)

```
                          ┌──────────────┐
              ┌──────────▶│  /  (sign-in)│◀───────── sign-out ──────┐
              │           └──────┬───────┘                          │
              │                  │ access_employee → /home          │
              │                  │ access_manager  → /manager       │
              │                  ▼                                  │
      ┌───────┴────────┐   ┌──────────┐                            │
      │  /manager/**   │   │  /home   │                            │
      │  (sidebar)     │   │          │                            │
      └───────┬────────┘   └────┬─────┘                            │
              │                 │ 3 image cards                    │
   ┌──────────┼─────────┐       ├──────────────▶ /new-sale ──▶ payment ──▶ customer ──▶ complete
   ▼          ▼         ▼       ├──────────────▶ /trade-in  (6 steps, mock, dead end)
 /manager  sales  inventory     └──────────────▶ /inventory
  ├ opening-stock                                    │
  ├ employees                                        └─ "Open sale drafts" → /new-sale
  ├ approvals
  ├ reports
  └ settings
```

**Verified gaps in this graph:**
- No link from any `/manager/**` page to `/home`, `/new-sale`, `/inventory`, or `/trade-in`. (grep for `href="/home"|"/new-sale"|"/inventory"|"/trade-in"` inside `src/app/manager` and `src/components/manager` returns nothing.)
- No link from the employee shell to `/manager`.
- Employee header shows the **same** four destinations on every screen. `Process a Swap` appears in the desktop nav but **not** in the mobile icon row (`src/components/employee/employee-header.tsx` lines 48–60) — so on the target device (iPhone) trade-in is reachable only from `/home`.
- `/manager/approvals` badge is hardcoded `count: 4` in `manager-shell.tsx` line 56 — it does not reflect any queue.
- "Help & support" (`manager-shell.tsx` line 151) is a `<SidebarMenuButton>` with no `render`/`href` — a dead control.
- Two dead controls on `/home` (`home-client.tsx` lines 31–36): the Search icon sets the message "Employee search is not connected yet." and the bag icon sets "There is no active sale in this preview." These read as broken buttons to a retail employee.

### A.4 A manager signs in to the wrong workspace

This is worth stating separately because it is invisible in the UI and follows from the database seed rather than from any page code.

`defaultWorkspacePath` (`src/lib/auth/policy.ts:109-113`) returns `/home` **first** when the session has `access_employee_workspace`, and only falls back to `/manager` otherwise. The manager role is seeded with *every* permission except `manage_roles` (`phase_01_foundation.sql:298-300`), which includes `access_employee_workspace`. Therefore:

> **A store manager, on signing in, lands on the employee home page — not the manager dashboard.** The same applies to any administrator. Only an account whose employee-workspace access has been explicitly overridden to *deny* will land on `/manager`.

Combined with A.3 (no link from either shell to the other), the consequence is that the manager's own dashboard is reachable only by typing `/manager` into the address bar. The `authorizedPostSignInPath` logic is correct and secure — this is a product decision that was never revisited when the manager workspace was added, not a bug in the redirect guard. It is, however, the highest-leverage single fix in the navigation findings, because it affects every manager on every shift.

*(Verification: seed at `phase_01_foundation.sql:283-305`; `defaultWorkspacePath` ordering at `policy.ts:110-111`; confirmed by reading `resolveAccess` in `src/lib/auth/resolve.ts`.)*


---

## B. Current workflows (the real sequences)

### B.1 Complete a sale (happy path) — 4 routes, ~10 interactions, 5 full page loads

| # | Where | Action | Server call | Cost |
| --- | --- | --- | --- | --- |
| 1 | `/home` | Tap **New Sale** card | — | 1 tap, 1 navigation |
| 2 | `/new-sale` | Tap **Start sale** | `create_sale_draft` | 1 tap, server redirect |
| 3 | `/new-sale?sale=…` | Type 15-digit IMEI, or **Scan** → camera modal → scan | — | 15 keystrokes *or* 2 taps + camera permission |
| 4 | — | Device card appears; tap **Verify and continue** | `add_sale_item` (reserves inventory) | 1 tap, server redirect → `/new-sale?notice=item-added` → redirect → `/payment` |
| 5 | `/new-sale/payment` | Tap a method radio (Mobile Money / Cash / Bank transfer) | — | 1 tap |
| 6 | — | Optional: type transaction reference | — | optional |
| 7 | — | Tick the mandatory attestation checkbox | — | 1 tap |
| 8 | — | Tap **Record payment** | `confirm_sale_payment` — **this completes the sale, fulfils the reservation, marks inventory sold, writes the audit event** | 1 tap, server redirect |
| 9 | `/new-sale/customer-info` | Type full name, phone, (email) | — | 2–3 fields |
| 10 | — | Tap **Continue** | `create_completed_sale_customer` | 1 tap, server redirect |
| 11 | `/new-sale/complete` | Tap **Start another sale** | — | 1 tap |

**Three findings from this sequence:**

1. **The irreversible financial act happens at step 8, but the progress indicator says "Step 2 of 4".** `confirm_sale_payment` sets the sale to `completed`, releases the reservation, marks the device `sold`, and appends the audit trail — *before* the customer is captured. Steps 3 and 4 ("Customer details", "Sale complete") are both after the money is booked. The page copy even says so: *"Payment is recorded. Add the customer receiving this device."* If the employee is interrupted after step 8, the store has a completed paid sale with no customer attached to it.
2. **Two intermediate redirects per step.** `addSaleItemAction` redirects to `/new-sale?notice=item-added`, which `/new-sale/page.tsx` (lines 54–56) immediately redirects to `/payment`. That is 2 round trips where 1 would do, and the user watches two full page loads after tapping one button.
3. **There is no discount UI at all.** `set_sale_item_discount` RPC and `updateSaleItemDiscountAction` (`src/app/new-sale/actions.ts` line 79) both exist and are never called. The `approve_discounts` permission is seeded but has no surface. A manager-approved discount cannot be applied by anyone.

### B.2 Resume an interrupted sale

On `/new-sale` with no `?sale=` query, the page loads `listEmployeeSales` and — if any sale exists — **silently redirects** to the computed resume step (`employeeSaleResumeStep`). There is no "you have an unfinished sale" prompt and no way to start a *new* sale while one is open, other than completing or cancelling the old one. The resume step logic itself is sensible (`src/lib/sale-journey.ts` lines 19–27), and the `listEmployeeSales` query deliberately re-surfaces completed-but-customerless sales. Good recovery design; invisible to the user.

### B.3 Correct inventory (the workflow you flagged)

There are **four different correction surfaces**, none of which share a pattern:

| What the manager wants to fix | Where | Steps |
| --- | --- | --- |
| Invoice identity (supplier, number, date, declared total, notes) | Opening Stock → "Audited corrections" → *Correct invoice identity* (collapsed `<details>`) | expand → pick invoice from dropdown → **values are prefilled from `invoices[0]`, not the picked invoice** → retype → type reason → submit → full page reload → success banner |
| Line quantity or unit cost | Opening Stock → *Correct invoice-line quantity or cost* | expand → pick line → **values prefilled from `lines[0]`** → retype → reason → submit |
| Selling price of an activated unit | Opening Stock → Activated devices grid | scroll → enter new price + reason + tick → submit (one full page reload **per device**) |
| Battery / condition / anything else on a received device | **Not possible anywhere** | — |

The confirmation resets: any correction "clears confirmation and requires a fresh review" (correct per `docs/opening-stock-intake.md`), so fixing one line forces the manager to re-scroll to the reconciliation card and re-confirm the invoice.

`/manager/inventory` is **read-only** — no edit affordance of any kind, and its row click only opens a detail panel. A manager looking at a wrong battery percentage on the register has no path from that row to a fix.

### B.4 Receive stock (opening stock)

For a delivery of *n* devices on one invoice:

1. Register model (4 fields + submit) — `register_opening_stock_model`
2. Create supplier invoice (5 fields + submit) — `create_supplier_invoice`
3. Add invoice line, per model (search model, select, qty, unit cost, notes + submit) — `add_supplier_invoice_line`
4. Scroll to reconciliation, verify, tick "I verified every line total", submit — `confirm_supplier_invoice`
5. Receive devices, via one of **two parallel forms on the same page**:
   - *Receive one device*: select line, IMEI, colour, condition, battery, **8 attestation checkboxes**, notes, submit
   - *Receive a batch*: select line, click **Add device** *n−1* times, then **per device** IMEI, colour, condition, battery, **8 attestation checkboxes**, notes, one submit
6. Scroll to *Staged devices*, and **for each device**: type approved price, tick "Pricing approved", submit → one full page reload each — `activate_opening_stock_unit`

For n = 10: **≈15 page loads, ≈145 form interactions, 80 attestation checkboxes.**

### B.5 Manage employees

`/manager/employees` renders, **for every staff row**, an always-open inline form with a Role select, a Status select, and a "Save access" button (`page.tsx` lines 89–96), permanently occupying a full-width band inside the directory. Consequences:
- No confirmation before `status = suspended` — an accidental submit locks a colleague out mid-shift.
- `assignableRoles` collapses to *Employee only* for non-admin managers (`line 48`), so the Role select on a row silently shows a different value than the person's actual role. It looks like their role changed.
- The invite form is a separate card above; the `Invite employee` button is an `<a href="#invite-staff">` anchor scroll.
- No "resend invitation", no "revoke invitation", no expiry display on the directory (only in the side card).

### B.6 Trade-in

Six steps (`Customer → Trade-in device → Inspection → Demo value → Replacement → Summary`) all in client state in one 384-line component. Inspection is 8 groups + battery + notes. Then a demo valuation (`src/lib/trade-in.ts` `calculateDemoValuation`, base GH₵2,400 with invented deductions). Then replacement selection from **mock inventory** (`inventoryPhones`). Then "Prepare Manager Approval" sets `submitted = true` and displays *"No request was sent and no inventory or payment record changed."*

**Nothing persists.** Refresh at any point loses everything. The manager's `/manager/approvals` queue is a *different* hardcoded array; the two never meet.

### B.7 Sign in / onboarding

`/` → server action → `resolveAccess` → `defaultWorkspacePath` → employee lands `/home`, manager lands `/manager`. Invitations: invite → `/auth/confirm` → `/auth/set-password` (12 chars) → workspace. Errors use a deliberate generic message (`publicAuthErrorMessage`) — correct for security, and good UX given the constraint.

---

## C. Screen-by-screen findings

Format per screen: **what it does / who & why / what's shown / actions / problems / iPhone fit / consistency / recommended change / backend impact.**

---

### C.1 `/` — Sign in (`src/app/page.tsx`, `login-form.tsx`)

- **Does:** Full-bleed photo (`/Mac-evra-login-img.webp`) with a dark gradient, MAC EVRA wordmark, "Good to have you here.", email + password, one white pill button.
- **Who/why:** Every employee, every shift, often one-handed.
- **Shows:** Only inputs and an error banner. No store name, no "forgot password", no help.
- **Actions:** Sign in.
- **Problems:** (a) It is the **only** screen in the app with a dark photographic background — it shares nothing with the white, restrained system behind it. (b) `text-[clamp(42px,10vw,56px)]` headline plus a 54px input and 58px button means on a 667pt iPhone SE the form and the compliance note compete for the fold. (c) `globals.css` contains a **complete second, unused login stylesheet** (`.login-page`, `.login-background`, `.login-button`, `.google-button`, `.apple-button`, lines 67–240) — dead CSS including Google/Apple button styles for auth methods that do not exist. (d) The email input has `bg-white/95` on a photo — over a bright image region, contrast for the placeholder is unpredictable.
- **iPhone:** Vertical rhythm is fine; the photo makes it heavier than it needs to be for a tool used 20× a day.
- **Consistency:** Outlier. This is the entrance to an Apple-inspired white app and it looks like a different product.
- **Recommend:** Keep the photograph but reduce it to a tasteful hero band or drop it on repeat visits; move to the same white/`#FAFAFC` surface with the burgundy lockup used in `/auth/set-password`. Add the store name and a real "Need help signing in? Ask your manager" line. Delete the dead CSS.
- **Backend:** none.

---

### C.2 `/home` — Employee landing (`src/app/home/home-client.tsx`)

- **Does:** Greeting, then three large photo cards: **New Sale** (half width), **Process a Swap** (half width), **Inventory** (full width). Each ~210px tall with a black gradient and 12px caption.
- **Who/why:** The employee's launchpad at the start of every interaction with a customer. Speed here multiplies through the whole day.
- **Shows:** First name only. No shift info, no open-draft indicator, no stock count, no "3 items low".
- **Actions:** Three navigations, plus Search / Bag / Sign out in the header.
- **Problems:**
  1. **Two of three header buttons are fake.** Search → "Employee search is not connected yet." Bag → "There is no active sale in this preview." For a retail employee these read as broken, and they teach mistrust of the UI. (`lines 31–36`)
  2. **The most common task is not the most prominent.** All three cards are the same visual weight (210px each); *New Sale* is not distinguishable at a glance from *Inventory*.
  3. **The cards depend entirely on photographs.** `Mac-evra-sale-badge.jpeg`, `trade-in-image.webp`, `inventory.jpeg` carry all the meaning, with white text over a gradient — this is the least legible possible treatment for the target audience on a glossy iPhone screen in a shop with daylight.
  4. **~630px of cards + 200px of greeting** = the third card requires a scroll on an iPhone SE.
  5. No feedback that an unfinished sale exists (see B.2) even though the app *knows*.
- **iPhone:** Structurally mobile-first (max-w-lg, 2-col grid) — the best mobile layout in the app. But scroll-heavy.
- **Consistency:** Uses `rounded-md` (6px) on cards — the only place in the employee app that does. Every other surface is `rounded-2xl`/`3xl`.
- **Recommend:** One primary action. Replace the three photo cards with a clear hierarchy: a large burgundy **Start a sale** button, then two secondary rows (Inventory, Process a swap) with small icons and one-line descriptions. Add a *live* strip: open draft ("Resume sale · iPhone 15 Pro") and available-device count. Remove or wire the two dead header buttons.
- **Backend:** open-draft tile and stock count need the loaders that already exist (`listEmployeeSales`, `listAuthorizedInventory`) passed into the client component — small, frontend-only wiring.

---

### C.3 `/inventory` — Employee stock search (`src/app/inventory/page.tsx`)

- **Does:** Live, RLS-scoped, IMEI-level list. Search box + status select + Apply (a GET form). Card grid (`md:grid-cols-2`). Default filter is **available**.
- **Who/why:** Employee checking "do we have a 14 Pro in blue?" while a customer waits.
- **Shows:** Model, status pill, storage · colour · condition, battery %, IMEI (mono), price, and for available devices a link *"Add through sale draft →"*.
- **Actions:** Search, filter, and one link that goes to `/new-sale` **with no IMEI pre-filled**.
- **Problems:**
  1. **The result of finding a phone is useless.** You locate the exact device the customer wants, tap *Add through sale draft*, and land on `/new-sale` where you must **re-type the 15-digit IMEI you were just looking at**. This is the single most wasteful interaction in the employee app. The IMEI is right there on the card.
  2. **Filtering requires a round trip.** `method="get"` + **Apply filters** = a full server navigation for every query change, on a device with a software keyboard. No debounce, no instant filter, no filter-as-you-type.
  3. **`Status` is duplicated.** A private `Status` component in this file (`lines 63–66`) re-implements what `DeviceStatus` in `device-card.tsx` already does, with different colours and `capitalize` on lowercase values. So the *same* device reads "Available" on `/trade-in` and "available" on `/inventory`.
  4. **The default hides everything but available** — ironic for a page whose job is exploring, and the empty state only says "Change the search or status filter" (it does not tell you it defaulted to available).
  5. **Dense single-line JSX.** Lines 34 and 53 are ~1,400-character single lines. Not a user-facing bug, but it is why the typographic details drifted.
  6. The security explainer at the bottom ("Inventory is store-scoped through RLS…") is developer-facing copy on a shop-floor screen.
- **iPhone:** Card grid collapses to one column — good. But `px-5 pt-9` with a 38px headline and a 11px uppercase eyebrow means the search form starts ~330px down.
- **Consistency:** `rounded-2xl` + `#E8E8ED` border — the de-facto standard. Status pill colours differ from `DeviceStatus`.
- **Recommend:** Debounced client filter (data is already fully loaded server-side — there is no reason to round-trip). Make the card tap / a primary button **"Start sale with this device"** carrying `?imei=…` so `/new-sale` pre-fills and auto-verifies. Show all statuses by default with a filter chip row instead of a select + Apply. Delete the duplicated `Status` component and reuse `DeviceStatus`.
- **Backend:** none if the IMEI is passed as a query param and the existing `add_sale_item` RPC is used (server still validates availability — must not be weakened). A dedicated "start sale with this device" RPC would be nicer but is optional.

---

### C.4 `/new-sale` — Step 1, IMEI verification (`page.tsx`, `imei-verification.tsx`)

- **Does:** Multi-state page: (a) no sale → "Start a sale" card; (b) sale with no item → IMEI input + **Scan**; (c) sale with exactly one verified item → device card + "Continue to payment"; (d) >1 item → "Start this sale again"; (e) unknown sale → "Sale unavailable".
- **Who/why:** The employee, scanning a boxed or in-hand iPhone at the counter.
- **Shows:** IMEI input with a live 15-char counter, scan button, and on a match a card with model, availability, storage · colour · condition, battery, IMEI, price, and **Verify and continue**.
- **Actions:** Type or scan IMEI, verify, change device, cancel sale, continue.
- **Problems:**
  1. **The page is a state machine disguised as a page.** Five mutually exclusive branches in one 159-line component, driven by URL params and redirects. Every action (`Start sale`, `Verify and continue`, `Change device`, `Cancel sale` ×2) is a `<form action={serverAction}>` → server redirect → full page re-render. There is no in-place feedback; the screen blanks and comes back.
  2. **You must press "Start sale" before you can scan.** Two taps and a server round-trip before the employee can do the one thing they came to do. The scan field and the start button should be the same screen.
  3. **The scan → verify handshake is broken into two gestures.** The camera finds the IMEI, fills the field, closes — and then the employee must *also* tap **Verify and continue**. A scan that matches an in-stock device should auto-advance (with a visible 1-step undo), because the server already re-validates.
  4. **Camera failure is a dead end.** If `decodeFromConstraints` rejects, the modal says "Camera access is unavailable. Enter the IMEI manually." — fine — but the scanner full-screen overlay is `fixed inset-0 bg-black` with no focus trap and no `Escape` handler.
  5. **Two "Cancel sale" affordances** with different visible styling on the same page (`lines 138–142` and `147–151`), both immediately destructive, both small grey text.
  6. `params.notice === "item-added"` and `"item-removed"` and `"draft-created"` are all consumed by redirects; only `sale-cancelled` ever renders a banner, so success feedback is invisible by design.
- **iPhone:** Strong. 64px input, 64px scan button, thumbs reach both. The best-executed screen in the app.
- **Consistency:** Good. Matches the `#6E0728` / `#FAFAFC` / `rounded-3xl` employee language. Slight drift: this page uses `text-base` body copy while `/inventory` uses `text-sm`.
- **Recommend:** Collapse "start" and "verify" into **one** screen: persistent IMEI field (autofocused, `inputMode="numeric"`) + Scan button, with the draft created lazily on first successful verify. Auto-advance on a successful scan match. Replace the two "Cancel sale" links with one, inside an overflow menu, behind a confirmation dialog that names the device being released.
- **Backend:** "create draft on first item" needs the draft created server-side inside `add_sale_item` or a combined action — small, but it touches the sale lifecycle, so treat it as a reviewed change. Everything else frontend-only.

---

### C.5 `/new-sale/payment` — Step 2 (`payment/page.tsx`)

- **Does:** Shows "Authoritative amount due" at 42px, the item description and IMEI, then a method fieldset (3 large radio cards), optional reference, a mandatory attestation checkbox, and **Record payment**.
- **Who/why:** The employee, at the moment money changes hands. Highest-risk screen in the business.
- **Shows:** Total, device, IMEI, three methods, reference, attestation, and — when the reservation has expired — a hard stop.
- **Actions:** Choose method, optional reference, attest, submit; or cancel.
- **Problems:**
  1. **The reservation expiry is invisible until it has already failed.** `reservationReady` is computed on the server at render; when false the form is replaced by "Payment cannot be recorded." An employee who takes 3 minutes to walk to the card machine gets a dead screen with no countdown, no warning at 1 minute left, and no "extend reservation" action. Reservation length is set in the DB, not shown anywhere in the UI.
  2. **Method icons are decorative but imply verification.** `Mobile Money` is described as *"Manually received Mobile Money"* — good copy — but the card visually mirrors a payment-gateway selector. In a market where staff are used to MoMo confirmations, this invites the belief that the app checked something. The attestation checkbox below mitigates, but the layout implies otherwise.
  3. **The attestation is a checkbox inside a large tinted box with bold inline copy.** Correct and required. Keep it. But note it is one tap — a genuine safeguard that is also trivially fast, which is the right trade-off only if the confirmation dialog at completion is honest about what was (not) verified.
  4. **The amount due is very large and the method list is below it** — good hierarchy. But **there is no way to see what you are about to record** in one glance (device + amount + method together) before submitting.
  5. Cancel sale is again an immediate grey text link.
- **iPhone:** Good. 42px amount, 200px+ of method cards, 56px submit. Radios are `size-4` (16px) but the entire label is the hit area — acceptable.
- **Consistency:** Good.
- **Recommend:** Add a live reservation countdown chip in the header ("Reserved · 6:12 left") with a manager-configurable extension. Add a final one-screen summary line above the button: *"Recording GH₵8,500.00 Cash for iPhone 15 Pro · IMEI …7890."* Keep the attestation exactly as it is (business rule). Add a confirmation dialog for **Cancel sale** only.
- **Backend:** countdown needs the reservation expiry already returned by `getPersistentSale` (`reservationExpiresAt` is present) — frontend-only. Extension, if wanted, is a new RPC.

---

### C.6 `/new-sale/customer-info` — Step 3 (`customer-info/page.tsx`)

- **Does:** After payment, asks for full name (required), phone (required), email (optional). One **Continue**.
- **Who/why:** The employee, *after* the money is taken.
- **Shows:** A one-line device/price strip, then three fields.
- **Actions:** Submit.
- **Problems:**
  1. **It is a post-hoc data entry step for an already-completed sale**, which is why it feels like friction: the value has been collected, the device is sold in the database, and now we ask questions. Commercially this is the worst moment to ask for anything — the customer is already reaching for their bag.
  2. **No customer search, despite the capability existing.** `selectSaleCustomerAction` and `listStoreCustomers(storeId, query)` are both implemented and **never used by any page**. A returning customer must retype name and phone; `create_completed_sale_customer` then silently matches on canonical phone and returns `"existing"`, which the page turns into a redirect with **no message** (notice `customer-existing` is in `successNotices` and immediately redirects). So the employee retyped everything and got no confirmation that it matched an existing record.
  3. **Phone-only matching is invisible.** No "This looks like Ama Boateng — use this customer?" moment.
  4. **The step exists only for some sales.** If the employee skips it, `/new-sale/complete` redirects them *back* here (`complete/page.tsx` line 33). So "complete" is not actually the end.
- **iPhone:** Good — three 56px fields, but a phone keyboard plus a name field plus a scroll.
- **Consistency:** Good; `Field` is a local component duplicated from the pattern in `settings/page.tsx`.
- **Recommend:** Move customer capture **before** payment (IDEAL below in §F): IMEI → Customer → Payment → Done, with "Walk-in / no details" as one tap. Add the existing searchable customer picker (it is already built server-side). Show the matched-existing-customer state explicitly.
- **Backend:** reordering the journey is a UX-only change (the RPC order is enforced server-side — `customer-info` already refuses to run before payment, so reordering requires relaxing that guard, which is a **reviewed backend change**). Reusing the search picker is frontend-only.

---

### C.7 `/new-sale/complete` — Step 4 (`complete/page.tsx`)

- **Does:** Renders one of five presentations (completed+paid, draft, awaiting payment, cancelled, unmatched) from `saleCompletionPresentation` in `src/lib/sales.ts`.
- **Who/why:** The employee, confirming "can I hand over the phone?".
- **Shows:** Big status icon, eyebrow, title, description, sale number, status, customer, total, item rows, and for success: method, confirmed-at, **confirmed by**, reference. Plus a notice box and one CTA.
- **Actions:** Start another sale / return to sale / return to payment.
- **Problems:**
  1. **It is a status page, not a receipt.** There is no receipt number the customer can keep, no print/share/copy action, and `README.md` confirms receipts are excluded. So the last screen of the transaction produces nothing the customer takes away.
  2. **"Confirmed by" and the reference invite an inference the app forbids.** The docs are emphatic that this is a manual attestation, not provider verification; the screen labels it "Payment recorded" with the note. The *visual* treatment (green check, "Sale complete") will be read by staff as verification. This is a copy/visual-design problem, not a data one.
  3. **The success CTA is "Start another sale"** — but the employee's actual next action is usually **hand over the device and say goodbye**, then maybe check stock.
  4. It is reachable in five states, and the cancelled variant (`"This sale was cancelled"`) is a *whole page* for what should be a toast back on the sale screen.
- **iPhone:** Good.
- **Consistency:** Good, though it introduces a **fifth** status colour family (`#FFF4DB`/`#8A6517` for awaiting-payment) beyond the four in `DataBadge`.
- **Recommend:** Make it a **completion sheet**: device + amount + method, a copyable/printable summary, and one primary "Done" returning to `/home`. Make cancelled a toast, not a page.
- **Backend:** a receipt artefact (PDF/print view) is new work; a print-optimised version of this page is frontend-only.

---

### C.8 `/trade-in` — "Process a Swap" (`trade-in/page.tsx` + `src/lib/trade-in.ts` + `src/lib/inventory.ts`)

- **Does:** 6 steps with a progress rail; customer, existing device, 8-part inspection, demo valuation with itemised deductions, replacement selection from mock stock, summary, "Prepare Manager Approval".
- **Who/why:** The employee, with a customer trading in a phone.
- **Shows:** Detailed inspection UI, an invented GH₵ estimate, mock stock, and a numbered balance.
- **Actions:** Next/Back, inspection selections, replacement selection, mock submit.
- **Problems — this screen needs the most honesty:**
  1. **Nothing is saved. Anywhere.** Six steps of customer and device data live in `useState`. One accidental swipe-back, one phone call, one screen lock and the entire inspection is gone. For a workflow performed standing up in a shop, this is close to unusable in production.
  2. **"Prepare Manager Approval" approves nothing.** It sets a boolean and shows *"No request was sent"*. There is no `trade_ins` table in any migration. The manager's approval queue never sees it.
  3. **The valuation is invented and presented like a real one.** GH₵2,400 base with −150/−500/−250/−800 adjustments (`src/lib/trade-in.ts` lines 62–93). It is clearly labelled "Demo" in three places (good), but it is displayed in a burgundy hero card with the same visual authority as the real amount-due card on the payment screen. An employee under pressure will read the number to the customer.
  4. **Six steps for a 15-minute counter task**, with the inspection spread over eight separate groups, each requiring a scroll and a tap.
  5. **The trade-in device's IMEI is free text with `minLength 6`** and no Luhn check, while the *sale* side enforces 15-digit Luhn. Two different standards for the same device identifier in the same app.
  6. **It reuses mock inventory** (`inventoryPhones`) — so the replacement device offered to the customer may not exist, and its price may be wrong. The page has no way to know.
- **iPhone:** The progress rail with 6 circles is cramped at 320px; inspection groups are single-column and long. `grid-cols-3` option buttons with 12px text are at the edge of legibility for the 3-way cosmetic ratings.
- **Consistency:** Uses the employee visual language but with `SaleDeviceSummary` from the manager demo data — the only screen that mixes both.
- **Recommend:** Until trade-in is real, **gate it**. Either (a) mark the whole route "Preview — do not quote to customers" with a persistent banner and remove the fake price from a hero card, or (b) reduce it to a single-page *intake capture* (customer, device, inspection, photos) that **persists a draft** and hands off to a manager. Do not ship a 6-step wizard that loses data.
- **Backend:** persistence requires new tables/RPCs and manager approval wiring — out of scope for a UX-only pass. **Flag it as a product decision, not a design tweak.**

---

### C.9 `/manager` — Manager dashboard (`src/app/manager/page.tsx`)

- **Does:** Four metric cards, a 7-bar CSS chart, "Needs attention" approvals list, a searchable preview sales table, "Inventory watch", and three activity cards.
- **Who/why:** The manager at open-of-day and at close-of-day.
- **Shows:** Two kinds of truth, unseparated:
  - **Live:** `Available devices`, total IMEI records, and the Inventory watch list (`listAuthorizedInventory`).
  - **Hardcoded:** `Confirmed revenue`, `Money received`, `+12.8%`, the seven bar heights `[20,39,31,46,54,34,100]`, `Pending approvals` (from `initialApprovals`), the entire Recent sales table (`sales` from `manager-data.ts`), and all three activity cards (`"Alex completed ME-2026-1048"`, `"Receipt for ME-2026-1046"`).
- **Actions:** Search sales, open reports, open approvals, open inventory, open a sale.
- **Problems:**
  1. **The most important numbers are fake and sit beside real ones at identical visual weight.** "Confirmed revenue GH₵28,400 · 4 preview paid sales" and "Available devices 6 · 12 live IMEI records" are the same `MetricCard`. The only signal is the note text (11–12px grey) and one `DemoNotice` paragraph above. A manager will screenshot this.
  2. **The chart is fabricated twice over** — invented amounts *and* invented percentages, with a hardcoded `+12.8%` badge in green. Green means "good" in this design system.
  3. **The Recent sales table shows payment statuses that do not exist** in the schema: `"Verified"`, `"Partially verified"`, `"Awaiting verification"`, and a `"Split"` method. The real app supports exactly one full payment, three methods, and no verification. This table teaches managers a *false model of their own system*.
  4. **`/manager/sales` already does this table correctly with real data.** The dashboard duplicates it with fake data — the worst of both worlds.
  5. **"Needs attention" is the best idea on the page** and is fed by fake requests. It is also the correct priority architecture (it should be the top card, not the third).
  6. Search on the dashboard filters the mock array, not the register.
- **iPhone:** The sidebar collapses to a Sheet (good), but the sales table has `min-w-[720px]` inside `overflow-x-auto` — on a 390px screen that is a horizontally scrolling table, the single worst mobile pattern for a manager checking numbers.
- **Consistency:** Best-looking page in the app; uses the manager system consistently. The problem is content, not craft.
- **Recommend:** Delete every fabricated figure. Four honest live metrics (available, reserved, sold, low-stock), a **real** "needs attention" list (expired reservations, staged devices awaiting price approval, stale drafts — all queryable today), and a real 7-day revenue bar chart from completed+confirmed sales. Move "needs attention" to the top.
- **Backend:** real aggregates need 1–2 read-only views/RPCs (`daily confirmed revenue`, `staged unit count`). Frontend can do the rest from `listManagerSales` + `listAuthorizedInventory` immediately.

---

### C.10 `/manager/sales` — Sale register (`src/app/manager/sales/page.tsx`)

- **Does:** Live sale register with search (sale number, customer, employee, IMEI), status filter, from/to dates, four metrics, and a right-hand detail panel (`?sale=`).
- **Who/why:** The manager reconciling the day, or checking one transaction.
- **Shows:** Sale number, timestamp, customer + phone, item count + descriptions, employee, total (+discount), status. Detail adds reservation status, subtotal/discount/total, and payment block.
- **Actions:** Filter, select a row, read.
- **Problems:**
  1. **Read-only, correctly.** No false affordances. This is the most trustworthy screen in the manager workspace.
  2. **Filtering is a full server round trip via `Apply filters`**, and the filters are *five* fields in a single row that becomes a 5-row stack on mobile. Changing one thing re-submits all five.
  3. **The date filter compares strings** (`sale.createdAt.slice(0,10) < from`) in Accra time — technically correct but brittle against any timezone change; worth noting as latent risk, not a UX defect.
  4. **`min-w-[900px]` table** on mobile; the detail panel is a card that appears *below* the table rather than as a sheet.
  5. **Row selection is a link inside the first cell only** — the whole row is not clickable, and there is no keyboard focus state on `<tr>`.
  6. **"Revenue" metric recomputes over the *filtered* set** (it uses `sales`, so it is store-wide — but visually it sits under the filter bar, so managers will assume it is filtered). Ambiguous scope is a real hazard for a financial number.
  7. No column sorting, no pagination (hard `limit(500)`), no CSV export (Reports has a fake one).
- **iPhone:** Weak. Table + horizontal scroll + a detail panel below the fold.
- **Consistency:** Good.
- **Recommend:** Inline filters (debounced), sticky table header, column sort, responsive row→card transformation under 640px, detail as a Sheet, and a CSV export of the **real** filtered rows. Label metric scope explicitly ("Store-wide, all statuses").
- **Backend:** none for the above; server-side pagination if volumes grow.

---

### C.11 `/manager/inventory` — IMEI register (`src/app/manager/inventory/page.tsx`)

- **Does:** Live register: 4 metrics, search + status filter + Apply, `min-w-[950px]` table (device, condition, battery, IMEI, listed price, received, status), detail panel via `?device=`.
- **Who/why:** The manager answering "what do we actually have?" and auditing individual devices.
- **Shows:** Correct live data. No cost (correctly — cost is permission-masked and not in `listAuthorizedInventory`).
- **Actions:** Search, filter, select.
- **Problems:**
  1. **It is a dead end.** You cannot edit condition, battery, price, colour, or status from here. The only way to change a price is `/manager/opening-stock` → Activated devices grid → find the device in an unfiltered, unpaginated card grid. A manager auditing 60 devices must scroll.
  2. **Same round-trip filter pattern** (`Apply filters`) and a redundant single-line JSX style.
  3. **`min-w-[950px]`** — the widest table in the app; seven columns on a phone.
  4. **No sort** by received date or price; no "low battery" or "ageing stock" filter — the two things a phone retailer actually wants.
  5. The green reassurance banner ("This is the real IMEI-level register…") is developer-facing copy taking prime real estate above the metrics.
  6. **No link from a row to that device's sale** (if sold) — the register can't answer "who bought this?".
- **iPhone:** Weakest mobile screen in the app.
- **Consistency:** Good.
- **Recommend:** Make this **the** inventory workspace: inline price/battery/condition editing behind a manager-gated edit icon (with the same audit write that Opening Stock already performs via `reprice_opening_stock_unit`), sortable sticky-header table, card layout under 640px, filters as chips, and a "sold" row linking to its sale.
- **Backend:** condition/battery edits have **no RPC today** — that is new backend work and must be a reviewed, audited operation. Price editing can reuse `reprice_opening_stock_unit`.

---

### C.12 `/manager/opening-stock` — Supplier intake (`src/app/manager/opening-stock/page.tsx`, 542 lines)

This is the screen your message singled out, and it is the most important manager surface. Detail in §F, but the findings:

- **Does:** Everything about intake in one page: 5 quantity metrics, invoice setup (3 collapsible forms), audited corrections (2 forms), per-invoice reconciliation with a nested line table each, physical receiving (**two parallel forms**), a line reconciliation table (`min-w-[1050px]`), a staged-devices card grid with a per-device activation form, an activated-devices card grid with a per-device repricing form, correction history (JSON dumps), and price-change history.
- **Who/why:** The manager on delivery day. Done in bulk, under time pressure, with a supplier rep waiting.
- **Shows:** Real live data, correctly permission-masked (`CostValue` renders "Restricted" when `costVisible` is false). Business rules are genuinely enforced.
- **Actions:** 9 forms, 5 collapsible sections, per-device submit buttons, per-invoice confirm buttons, 2 correction forms, 2 history lists.
- **Problems:**
  1. **🔴 The correction forms can write the wrong record.** *Correct invoice identity* prefills from `dashboard.invoices[0]` and *Correct invoice-line quantity or cost* prefills from `dashboard.lines[0]` — but both submit the `invoiceId`/`lineId` chosen in the dropdown. Select invoice #3, leave the prefilled supplier/date/total (which belong to invoice #1), press submit → invoice #3 is overwritten with invoice #1's identity, with a perfectly valid audit record describing the change. (`page.tsx` lines 262–266 and 273–275.) This is the highest-severity finding in the audit.
  2. **A ~3,300px single page with no tab bar, no anchors, and no sticky section nav.** The five sections are: metrics, invoice setup + corrections, reconciliation, physical receiving, line table, staged, activated, history. On a laptop this is 5+ screens of scroll; on an iPad it is unmanageable.
  3. **Activation is one full page reload per device.** Ten staged phones = ten form submits, ten scroll-backs (the page always returns to the top after `redirect`).
  4. **Two parallel receiving forms on screen simultaneously** — *Receive one device* and *Receive a batch* — with different behaviours and the same fields. The manager must decide which philosophy to use before typing. The single form duplicates every `DeviceFields` input that the batch form also has.
  5. **8 attestation checkboxes per device.** These are a real audit control and must not be silently removed — but multiplying them by 10 devices in a batch form yields 80 checkboxes, and the batch form is capped at 100 devices (800 checkboxes).
  6. **Error messages are generic and frequently wrong.** `rpcErrorReason` maps PG codes; but `addSupplierInvoiceLineAction` also does `redirect(?error=${encodeURIComponent("Selected device model was not found.")})` — a free-text message that will never match the `errors` map, so the user sees "The operation could not be completed." for a very specific, fixable problem.
  7. **`JsonState` renders raw `JSON.stringify` into the UI** for correction before/after data. Raw JSON in a manager-facing audit panel is unusable; it also leaks internal column names.
  8. **`ModelSelector` is a search input above a native `<select>`** — a two-step control that only exists because a proper combobox isn't available; it resets its selection whenever the filter changes.
  9. **Invoice references in dropdowns are enormous**, e.g. `"Supplier · 2026-11-24 · no reference · line 3 · iPhone 16 Pro · 4 outstanding"`. Native selects truncate these; the manager cannot tell two similar lines apart.
  10. **No bulk activation.** Invoices arrive as 5–20 identical units with the same price; the app makes you approve each one.
- **iPhone:** Not viable. A 1,050px table, two side-by-side forms, and a per-device card grid.
- **Consistency:** Uses `DataBadge`, `MetricCard`, `Card` consistently. Local `inputClass`/`labelClass`/`buttonClass` constants are re-declared here *and* in `batch-receiving-form.tsx` and *again* in the employee pages with different values — a small sign of the deeper duplication in §G.
- **Recommend:** See §F.4 for the full proposed workspace.
- **Backend:** the inline-editing proposals mostly map onto **existing** RPCs (`correct_supplier_invoice`, `correct_supplier_invoice_line`, `activate_opening_stock_unit`, `reprice_opening_stock_unit`), each of which already takes a reason and writes an attributed ledger row. A batch-activation RPC would be new; it must remain all-or-nothing per device and must not bypass `price_confirmed`.

---

### C.13 `/manager/employees` — Staff (`page.tsx`, `actions.ts`)

- **Does:** 3 metrics, an invite card (email + role), a directory where each row is a grid plus an always-visible inline *Save access* form, and a side card of recent invitations.
- **Who/why:** The manager/administrator onboarding a hire or suspending someone.
- **Shows:** Name, work email, phone, role, status badge, and per-row Role/Status controls; invitations with status and expiry.
- **Actions:** Invite, change role, change status, save.
- **Problems:**
  1. **Every row carries an open edit form.** The directory scan task ("who works here?") is buried under two selects and a button per person. This is the mirror image of the Opening Stock problem: instead of a clean table with on-demand editing, it is permanent editing with no clean table.
  2. **No confirmation for suspension.** `updateStaffAction` immediately calls `update_staff_membership`. A mis-tap locks a colleague out.
  3. **The role select silently misrepresents non-admin managers' view** (`assignableRoles` filtered to `employee`), showing "Employee" selected for a person who is actually a Manager. Presenting wrong data as the current value is worse than hiding the control.
  4. **No resend / revoke invitation**, and expiry is only shown in the side card, not where the action is.
  5. **The `Invite employee` header button is an anchor scroll** (`<a href="#invite-staff">`), not a dialog — on mobile it scrolls past the metrics and can land under the sticky header.
  6. `"Staff roles 3"` metric is a constant — a metric that can never change is noise.
- **iPhone:** Rows become tall stacked blocks (name / role / status / form / joined) — ~260px per employee.
- **Consistency:** The only page where shadcn `<Input>`/`<Button>` are used inside a hand-rolled list; the invite form inputs (`h-10`) are smaller than the same concept on employee pages (`h-14`).
- **Recommend:** Clean table → row action menu (Change role / Suspend / Resend invite / Revoke) → each opens a small dialog with a required reason and an explicit confirm. Role/status changes behind the menu, never permanently open. Show "Invitation expires in 41h" inline. Replace the anchor with a dialog.
- **Backend:** `update_staff_membership` already exists and is audited; resend/revoke invitations need new RPCs (invitation preparation exists; revoke does not).

---

### C.14 `/manager/approvals` — Approvals (`page.tsx`)

- **Does:** A fully client-side approval queue over `initialApprovals`, filters (status/type/search), a selectable list, and a 410px detail panel with a required "Decision note" (min 5 chars) and Approve/Decline.
- **Who/why:** A manager's core duty: reviewing refunds, cancellations, discounts, trade-ins, adjustments.
- **Shows:** 6 fabricated requests (4 pending). Amounts, IMEIs, reasons, employees, priorities.
- **Actions:** Filter, select, note, approve/decline (local state only).
- **Problems:**
  1. **The buttons do nothing but are not disabled.** `makeDecision` mutates local state and shows "…marked approved in preview state". Real refunds, cancellations and price adjustments are **not** performed. Combined with realistic content (real-looking IMEIs, real employee names, real amounts), this is the most dangerous screen in the app for a manager's trust.
  2. **There is no approval domain in the backend at all.** No `approvals` table exists in any migration. This is a *product gap presented as a finished screen*.
  3. **The decision note requirement is enforced only by disabling the buttons** with a 5-character rule and a static hint; no inline error, no counter, and no indication of *which* action is blocked.
  4. **The detail panel is a side column that on mobile stacks below a long list** — you scroll past 6 cards to reach the decision form for the card you tapped.
  5. **No "next request" flow** — after deciding, you must scroll back up and pick another.
  6. The "Decided" metric counts local clicks, so it can be inflated by clicking approve/decline repeatedly on different requests.
- **iPhone:** Poor (split-pane on a phone).
- **Consistency:** Good visually.
- **Recommend:** Either implement real approvals or **remove the page from the sidebar** until it is real. If it stays as a preview, disable the decision buttons and replace them with "Preview only — decisions are not recorded", and drop the realistic money. If implementing: a queue with one-request-at-a-time review (a full-screen sheet on mobile), a required note, a diff of what will change, and an audit event per decision.
- **Backend:** substantial — needs an approvals table, RPCs, and wiring into refunds/cancellations/discounts. **Do not attempt this as a UI-only change.**

---

### C.15 `/manager/reports` — Reports (`page.tsx`)

- **Does:** Period toggle (daily/weekly/monthly), 4 metrics, a CSS bar chart, revenue/margin card, employee/model/payment breakdowns, and **Export CSV**.
- **Who/why:** Owner/manager reviewing the week.
- **Shows:** `reportPeriods` from `manager-data.ts` — three hand-written objects — plus `employeeReport`, `modelReport`, `paymentReport`, rescaled by hardcoded factors `{daily: 0.021, weekly: 0.073, monthly: 1}`.
- **Actions:** Switch period, export CSV.
- **Problems:**
  1. **The numbers are invented and internally inconsistent.** Choosing "Daily" does not compute a day from data — it *multiplies the monthly figure by 0.021*. "Daily transactions: 2" is `Math.round(118 × 0.021)`. Switching periods produces a coherent-looking but meaningless report.
  2. **Export CSV writes the invented figures to a file the manager will then email or open in Excel.** This converts harmless demo data into a durable, plausible-looking financial artefact with no watermark. Highest-consequence copy of fake data in the app.
  3. **Gross profit is presented to a manager while purchase costs are, by design, not disclosed** anywhere else. `reports` shows "Gross profit GH₵119,850 · 16.3% margin" and a "Device cost" row — inverting the product's cost-protection model, even though the underlying costs are fake.
  4. **Period switching is client state**, so the URL is not shareable and a refresh resets to monthly.
  5. Percentages can exceed 100% after rounding; "Payment method breakdown" sums five invented shares to 100 exactly (luck).
- **iPhone:** 5-column payment card grid collapses to 1 — very long page.
- **Consistency:** Good visuals; the burgundy hero card is the best-looking element in the manager workspace.
- **Recommend:** Replace with a **real** report built from `listManagerSales`: confirmed revenue, count, average sale, payment-method mix, employee mix, model mix — all from completed+confirmed rows. If not ready: **remove the route from the sidebar** and delete the CSV export. Do not ship an export of fake financial data.
- **Backend:** real aggregates can be computed client-side from the existing 500-row sales loader initially; a summary RPC/view is the correct medium-term answer.

---

### C.16 `/manager/settings` — Settings (`page.tsx`)

- **Does:** 4 sections (Store, Account, POS, Preferences) in a local-state form; Save shows "saved in preview state".
- **Who/why:** Manager adjusting store details or POS rules.
- **Shows:** Store name/location/phone/email/footer; manager name/email/phone; reservation minutes, discount limit, payment methods, three toggles; timezone, currency, low-stock level, three notification toggles.
- **Actions:** Edit, toggle, Save.
- **Problems:**
  1. **Nothing persists.** It is `useState` with a fake success banner. A manager who "sets the reservation to 30 minutes" has changed nothing.
  2. **It contains business rules that contradict the system.** `allowSplitPayments` (default **on**) directly contradicts a documented invariant — "One full payment method per sale". `discountLimit` contradicts "discounts require `approve_discounts`". `requireCustomerPhone` contradicts the optional customer. Three switches offer control over rules the backend will not honour.
  3. **"Accepted payment methods" includes MTN MoMo, Other Mobile Money, Card, Split** — but the real payment RPC accepts only `mobile_money`, `cash`, `bank_transfer`. The settings screen describes a different application.
  4. `LockedRule` ("Require confirmed full payment · Always on") is the one honest, useful element — and it is a non-interactive div.
  5. Role is a disabled input reading "Manager" — fine, but it is the only place the manager sees their own role, which belongs in the account menu.
- **iPhone:** Left settings nav becomes a 4-item stacked card, then a long form. Acceptable.
- **Consistency:** Uses shadcn `Input` at default height inside `Field` — the only place `Input` is used for a long form.
- **Recommend:** Ship only settings the backend actually honours: store identity and receipt footer (needs persistence), and read-only documentation of the fixed rules. Delete `allowSplitPayments` and the payment-method multi-select; replace with a static "Supported payment methods" list. Autosave per field with explicit "Saved" feedback, or one Save per section.
- **Backend:** persisting store settings needs a `store_settings` table + audited RPCs. Until then the page should say "Read-only in this phase".

---

### C.17 Cross-cutting screens

**Sign-out** is a bare `<form action={signOutAction}>` in three places with no confirmation — acceptable for sign-out, but there is **no idle timeout warning** anywhere, which for a shared shop-floor iPhone is a real risk (previous employee's session, tab left open).

**Errors:** every failure path is a redirect to `?error=<slug>` rendered as a coloured banner. There is no field-level validation, no inline message beside the offending input, no preserved form values on failure (the whole page re-renders empty), and no `error.tsx` — so any thrown exception from a loader (e.g. `"Sale could not be loaded."` from `sales-server.ts` line 40) produces Next's default 500 screen inside the app chrome, with the sidebar intact.

**Loading:** zero `loading.tsx`. Every server action is a full navigation with no pending UI except Next's implicit behaviour. On a slow mobile connection a manager tapping "Activate to sellable inventory" gets no feedback until the redirect completes.

---

## D. The 15 biggest UX problems, ranked

Severity considers **financial/correctness risk first**, then frequency, then effort.

| # | Problem | Where | Severity | Frequency | Why it matters |
| --- | --- | --- | --- | --- | --- |
| 1 | **Correction forms write the wrong invoice/line.** Prefilled from `invoices[0]`/`lines[0]` while the dropdown selects any record. | `manager/opening-stock/page.tsx:262-275` | **Critical** | Every correction | Silently corrupts supplier invoices with a *valid* audit trail. Worst possible failure mode: a wrong record that looks audited. |
| 2 | **Fabricated financials presented as operational.** Revenue, margin, verification statuses, approvals, and a CSV export of invented numbers. | `/manager`, `/manager/reports`, `/manager/approvals`, `lib/manager-data.ts` | **Critical** | Every manager visit | Decisions get made on invented money. The CSV outlives the session. |
| 3 | **No door between employee and manager workspaces — and managers land in the wrong one.** Zero links either direction; seeded manager role has `access_employee_workspace`, so `defaultWorkspacePath` sends managers to `/home` after sign-in, with no link to `/manager`. | `manager-shell.tsx`, `employee-header.tsx`, `policy.ts:109-113`, `phase_01_foundation.sql:298-300` | **High** | Every owner-manager, every sign-in | A manager cannot reach their own dashboard without typing a URL, and cannot sell without typing another. |
| 4 | **Trade-in loses all data and approves nothing.** 6 steps of `useState`; the "approval" is a boolean. | `trade-in/page.tsx`, `lib/trade-in.ts` | **High** | Every trade-in | Hours of staff time destroyed by a refresh; customers quoted an estimate that is never recorded. |
| 5 | **Payment completes the sale before the customer is captured**, under a "Step 2 of 4" label. | `new-sale/actions.ts:142-177`, `customer-info/page.tsx` | **High** | Every sale | Completed paid sales with no customer; the "customer" step becomes post-hoc admin. |
| 6 | **No inline editing or keyboard flow anywhere.** Every table is read-only; every edit is a separate form + full page reload. | all manager tables; Opening Stock | **High** | Constant | This is the core of your Opening Stock observation, generalised: the app cannot be driven with Enter/Tab. |
| 7 | **Desktop tables on an iPhone.** `min-w-[720px]`…`min-w-[1050px]` inside horizontal scrollers, no card fallback. | inventory, sales, opening-stock | **High** | Every mobile use | iPhone-first product whose manager screens are desktop-only. |
| 8 | **No loading or error boundaries; generic URL-param errors; specific errors swallowed.** | 0 `loading.tsx`, 0 `error.tsx`, `opening-stock/actions.ts:121` | **High** | On any failure | A DB hiccup becomes an unstyled crash; a fixable mistake becomes "operation could not be completed". |
| 9 | **Destructive actions with no confirmation.** Cancel sale, change device, suspend employee, remove batch row. | `new-sale/*`, `employees/actions.ts` | **Medium-High** | Daily | Cancelling a sale releases a live reservation irreversibly. |
| 10 | **Dead controls teach staff the app is broken.** Home Search/Bag, "Help & support", hardcoded approvals badge `4`. | `home-client.tsx:31-36`, `manager-shell.tsx:56,151` | **Medium-High** | Every session | Erodes trust faster than a missing feature. |
| 11 | **Inventory finding is disconnected from selling.** "Add through sale draft" lands on an empty IMEI field. | `inventory/page.tsx:53` | **High** | Every sale from stock | Re-typing 15 digits the screen already knows. The single clearest click-reduction win. |
| 12 | **Employee row forms permanently open; no confirm; role select misrepresents actual role.** | `employees/page.tsx:85-98` | **Medium** | Every staff change | Wrong data shown as current value + accidental lockouts. |
| 13 | **Approvals is a split-pane on a phone with buttons that do nothing.** | `approvals/page.tsx` | **Medium-High** | Daily | Core manager duty, unusable on the target device, and untruthful. |
| 14 | **Two money formatters and two status vocabularies.** `GH₵ 8,500` vs `GH₵8,500.00`; `Available` vs `available`; `Process a Swap` vs `Trade-in`. | `lib/inventory.ts:32` vs `lib/sales.ts:14` | **Medium** | Pervasive | Readability and trust: the same device shows a different price *format* on two screens. |
| 15 | **Opening Stock is a 3,300px page with 9 forms and 5 collapsed sections**, no tabbing, no sticky nav, one reload per activation. | `opening-stock/page.tsx` (542 lines) | **High** | Delivery days | Directly creates the friction you described, and it is where the most valuable manager hour goes. |

**Honourable mentions:** orphaned actions (`updateSaleItemDiscountAction`, `selectSaleCustomerAction`, `expireSaleDraftsAction`, `listStoreCustomers`) meaning discount and customer-search features exist server-side with no UI · no reservation countdown before payment fails · `/home` dead file `action-cards.tsx` · 1,400-character JSX lines making drift inevitable · no idle-timeout warning on shared devices.

---

## E. Proposed improvements

Each item states the current experience, the proposed experience, why it is better, the measurable reduction, the work involved, and the security/audit consequences. **Nothing below weakens a business rule.** Where a rule is involved I say explicitly how it is preserved.

### E.1 Fix correctness and honesty first

| # | Current | Proposed | Why better | Reduction | Work | Security / audit |
| --- | --- | --- | --- | --- | --- | --- |
| E1 | Correction forms prefill from `invoices[0]`/`lines[0]` regardless of the selected record | Prefill from the **selected** record; the form is rendered per row with that row's values (see F.4, inline editing) | Removes a silent data-corruption path | No click change — this is a defect fix | Frontend only | **Strengthens** auditability: the ledger will describe the record the manager actually edited. No new bypass; still `correct_supplier_invoice` / `correct_supplier_invoice_line` with a mandatory reason. |
| E2 | Dashboard/Reports/Approvals show invented financials; CSV exports them | Phase A: visually quarantine and relabel every mock block ("Sample — not store data"), remove the CSV export, disable approval decisions. Phase B: replace with live aggregates | Managers can no longer act on or forward fabricated money | n/a | Frontend (A); read-only views/RPCs (B) | No write path changes. If approvals become real, each decision needs its own table + audit event + permission check (`review_approvals`, and `approve_refunds`/`approve_cancellations`/`approve_discounts`). |
| E3 | No navigation between workspaces | Add "Store counter" to the manager sidebar footer; add "Manager workspace" to the employee header, rendered only when `access_manager_workspace` is in the session's permissions | One tap instead of URL-guessing | Saves ~3 manual steps per role switch | Frontend; requires passing the membership's permission list into `EmployeeHeader` | No authorisation change: `requirePermissions` in each layout remains the enforcement point; the link is discoverability only. |
| E4 | Trade-in is a data-losing demo | Until it is real: persistent "Preview — do not quote to customers" banner, remove the hero-price treatment, add `beforeunload`/draft-to-`sessionStorage` so a refresh doesn't destroy work. Later: persist intake as a real draft, hand off to approvals | Honesty + no lost inspections | Prevents total data loss | Frontend now; backend later (`trade_ins` tables + RPCs) | Trade-in approval must stay manager-controlled (`approve_trade_ins`). No client-side write may create an inventory row; a traded-in device must enter through the same staged-intake + activation path as supplier stock. |
| E5 | Sale completes before customer capture | Browse-only proposal: reorder to **IMEI → Customer → Payment → Done** (see F.1) | Matches the moment the customer is still standing there; removes a post-payment admin step | Removes 1 page + 1 round trip from every sale | Backend guard change required: `customer-info` currently redirects away unless `status = completed && payment confirmed` | **This is the one workflow change with real backend impact.** `create_completed_sale_customer` and the guard in `customer-info/page.tsx:33` must be reworked so a customer can be attached to a draft. Customer creation still must not touch payment or inventory. Needs review, not a UI-only change. |

### E.2 Reduce clicks in the sale path

| # | Current | Proposed | Why better | Reduction | Work | Security / audit |
| --- | --- | --- | --- | --- | --- | --- |
| E6 | Inventory → "Add through sale draft" opens an empty IMEI field | Card gets **"Sell this device"** → `/new-sale?imei=<imei>`; the IMEI field pre-fills and auto-advances the match card (employee still taps Verify, or auto-verify after a scan) | Removes 15 keystrokes and a context switch from the most common sale | **−15 keystrokes, −2 taps, −1 navigation** per stock sale | Frontend | Must **not** pre-reserve server-side on page load. `add_sale_item` remains the only reservation path and still re-checks availability and permission. |
| E7 | "Start sale" then "verify IMEI" are two screens | One screen: autofocused IMEI field + Scan; draft created lazily on first successful verify | Employee starts working immediately | **−1 tap, −1 full page load** | Combined server action or draft-on-add | Draft creation still uses `create_sale_draft`; nothing about ownership/permissions changes. |
| E8 | A successful scan still needs a second "Verify and continue" tap | Auto-advance on a scan that matches available inventory, with a visible 3-second undo | One gesture for the primary action | **−1 tap per scanned device** | Frontend | Server still validates; auto-advance only *submits* the same form. Race conditions still rejected by `add_sale_item`. |
| E9 | Filters are GET forms with **Apply** | Debounced client-side filtering (all data already loaded); filter chips instead of selects | Instant feedback, no navigation | **−1 submit + −1 page load per filter change** | Frontend | None (read-only). |
| E10 | Employee header duplicates 4 links on every screen; `Process a Swap` missing on mobile | One consistent mobile pattern: a persistent 3-item bottom bar (Home · Sell · Stock) with a "More" sheet for trade-in | Predictable destinations, thumb-reachable | −1 navigation on mobile for trade-in | Frontend | None. |
| E11 | Success feedback is invisible (notices consumed by redirects) | A single toast region (`role="status"`, `aria-live="polite"`) fed by the redirect's `?notice=`, rendered once in each shell | The employee sees what happened without a screen change | Avoids re-navigation to confirm | Frontend | None. |

### E.3 The shared interaction system (the core of your request)

| # | Current | Proposed | Why better | Reduction | Work | Security / audit |
| --- | --- | --- | --- | --- | --- | --- |
| E12 | Every edit = separate form + full page reload | **Inline editable rows** with a small pencil icon: read state shows the value; edit state turns it into an input in place; **Enter saves, Esc cancels, Tab moves to the next editable cell**. Applied to: invoice identity, invoice-line quantity/cost, unit price, employee role/status, low-stock thresholds | One workspace instead of "setup screen + correction screen"; keyboard-drivable | **≈1 page load → 0; ≈3 taps → 1 key** per correction | Frontend for the interaction; each save calls the **existing** audited RPC | Each inline save must collect a reason (inline popover, required, min 5 chars) and call the same `correct_*` / `reprice_*` RPC. **The audit record and the ledger are unchanged** — the UI is only faster. No value may be written by a direct table update. |
| E13 | Enter does nothing useful anywhere | Global: **Enter submits the current row/step and advances focus to the next logical field**; Tab order follows the visual order; sticky primary action visible while scrolling | This is what makes data entry fast on a laptop and an iPad with a keyboard | ~30–50% fewer interactions on bulk receiving | Frontend | None, provided Enter only submits the *current* record (no accidental batch write). Each device still validates individually and atomically. |
| E14 | Two parallel receiving forms | **One** receiving table: choose the invoice line once, then add device rows; each row saves and advances; "Receive all" at the end | Ends the "which form am I in?" decision | **−1 form, −1 decision**, and — 8 duplicated inputs | Frontend; a batch RPC already exists (`receive_opening_stock_devices`) | Per-device colour/condition/battery/inspection must remain per-row (already enforced by `parseBatchDeviceInput`). Whole batch must remain atomic or per-row atomic — either way, no partial record. |
| E15 | 8 attestation checkboxes per device | Replace the 8 checkboxes with **one** structured attestation control: a single "Inspection complete" confirm that expands to show the eight items as read-only checklist items the employee must tick *once per batch* only when the devices are identical; for mixed batches, keep per-device. | Cuts 80 checkboxes to 8 for a homogeneous delivery | **−72 checkboxes** on a 10-device batch | Backend-compatible but requires care: the 8 fields are required by `parseInspectionInput` | **Must not be weakened.** Safe version: "apply this inspection attestation to the remaining rows in this batch" is an *explicit*, attributable action that still records all 8 booleans per device — the employee affirms them per device, just once for the batch. Never derive the attestation from a prior device silently. Needs product sign-off. |
| E16 | Per-device activation = one reload each | Multi-select staged rows → **"Approve price for 5 selected"** → one dialog: price per row prefilled, one confirmation → one RPC call per row (parallel) or a new batch RPC | Bulk intake gets bulk approval | **10 reloads → 1** | Frontend + new batch RPC (recommended) | Each activation must still require `approve_inventory_adjustments`, an explicit `price_confirmed`, a positive price, and must produce one audit event + one intake movement **per device**. A batch RPC must be all-or-nothing or report per-device failures explicitly. |
| E17 | Actions are immediate; nothing to undo | Keep immediate for **safe** changes; require a reusable `ConfirmDialog` for: cancel sale, change device, suspend employee, remove a batch row, delete nothing (no deletes exist) | Prevents irreversible mistakes without nagging | Adds 1 tap only to destructive acts | Frontend | Cancelling a sale releases a live reservation — the dialog must name the device and IMEI being released. |
| E18 | Money formatted two ways; two status vocabularies | One `Money` component (`formatPesewas` everywhere, tabular figures) and one `StatusBadge` with a `text-transform: capitalize` fix | The same device shows the same number the same way on every screen | n/a (consistency) | Frontend | None. Note `formatGhs` is used with whole-GHS mock values only — safe to retire with the mock data. |
| E19 | Oversized pages; no structure | **Sticky sub-navigation** with counts on every long manager page (Opening Stock, Settings, Inventory); one `<h1>` per page; a proper empty state per section | Orientation on a 3,000px page | Saves scroll-hunting | Frontend | None. |
| E20 | No loading/error boundaries | `loading.tsx` per route group with skeletons (the `Skeleton` component already exists and is unused), one `error.tsx` per workspace with a "Try again" and a support line, field-level validation from the actions' structured results | Failures become recoverable and legible | n/a | Frontend | Error UIs must never echo DB error text or IDs — keep the existing generic-message discipline. |

### E.4 Backend changes required (identified separately, as requested)

These **cannot** be delivered frontend-only and should each be reviewed on their own:

1. **Customer before payment** (E5): relax the `customer-info` guard; allow attaching a customer to a `draft`; keep `create_completed_sale_customer` for the post-payment path or deprecate it.
2. **Draft-on-first-scan** (E7): a create-and-add action, or move draft creation inside `add_sale_item`.
3. **Inventory attribute edits** — condition / battery / colour. No RPC exists. Needs an audited, permission-gated adjustment RPC (compare with how `reprice_opening_stock_unit` proves an expected value, and with the audit model in `opening_stock_corrections`).
4. **Batch activation** (E16).
5. **Approvals domain** (E2): `approvals` table, decision RPCs, wiring into discounts/refunds/cancellations.
6. **Trade-in persistence** (E4): tables + RPCs + manager approval.
7. **Store settings persistence**: `store_settings` + audited update RPC; and removal of UI-only rules (`allowSplitPayments`, `discountLimit`) that contradict the schema.
8. **Receipt artefact / print view** for the completion step.
9. **Reservation extension** (optional) if the payment screen gets a countdown.

---

## F. Suggested redesigned workflows

### F.1 The sale, end to end (after redesign)

```
TAP "Start a sale" (or "Sell this device" from inventory, IMEI prefilled)
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│  Sell a phone                                    1 of 3       │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  IMEI  [ 3 5 7 0 0 0 0 0 0 0 0 0 0 1 7 ]        [Scan] │  │  ← autofocus, numeric pad
│  └─────────────────────────────────────────────────────────┘  │
│  ── matched ────────────────────────────────────────────────── │
│  iPhone 15 Pro · 256GB · Natural Titanium · 92% · Excellent    │
│  GH₵8,500.00                            [ Sell this phone → ]  │   ← scan auto-advances
│                                                               │
│  ● Reserved for you · 9:41 left                               │   ← live countdown
└───────────────────────────────────────────────────────────────┘
        │  one screen, no page change for IMEI entry
        ▼
┌───────────────────────────────────────────────────────────────┐
│  Customer details                                 2 of 3      │
│  [ Search existing customer… ]        ← already built server-side
│  Ama Boateng · 024 000 0000            ← one-tap match
│  ── or ──                                                     │
│  Name [ ]   Phone [ ]   Email [optional]                      │
│  [ Walk-in · no details ]              ← one tap, honest skip │
└───────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│  Payment                                          3 of 3      │
│  iPhone 15 Pro · IMEI …7890 · Ama Boateng                     │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │   GH₵8,500.00            amount due                     │  │
│  └─────────────────────────────────────────────────────────┘  │
│  ( Mobile Money ) ( Cash ) ( Bank transfer )                  │  ← 3 big segmented buttons
│  Reference (optional) [            ]                          │
│  ☑ I confirm I have received the full GH₵8,500.00             │  ← UNCHANGED business rule
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  Record GH₵8,500.00 Cash →                              │  │  ← states exactly what is recorded
│  └─────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
        │  ← single atomic action: payment + fulfil + sold + audit
        ▼
   Completion sheet (over the sale screen, not a page)
   ✔ Sold. iPhone 15 Pro · GH₵8,500.00 · Cash · Ama Boateng
   [ Copy summary ]  [ Print ]        [ Done → Home ]
```

**Click/steps comparison**

| | Today | Proposed |
| --- | --- | --- |
| Screens | 4 routes | 3 + 1 sheet |
| Full page loads | ~6 (incl. 2 hidden redirects) | 3 |
| Keystrokes for a stock sale | 15 (IMEI) + 2–3 fields | 0 (IMEI from inventory) + 2–3 |
| Taps | ~10 | ~6 |
| Where the money is booked | before the customer exists | last step, with the customer attached |

Business rules preserved: one iPhone per sale (single item), one full method, manual attestation unchanged and still mandatory, prices still server-derived, no browser writes.

### F.2 Inventory correction (after redesign)

Today: four disconnected surfaces (see B.3), one of which corrupts data.

Proposed: **one register with a single editing model.**

```
/manager/inventory
┌──────────────────────────────────────────────────────────────────────────┐
│  Inventory                          [ Filter: available ▾ ]  [ + Receive]│
│  Available 6 · Reserved 2 · Sold 4 · Needs attention 3                    │
├──────────────────────────────────────────────────────────────────────────┤
│  Device              Condition  Battery  Price              Status    ✎  │
│  iPhone 15 Pro 256   Excellent   92%    GH₵8,500.00  ✎      Available ✎  │
│  iPhone 14 Pro 128   Good        89%    GH₵7,200.00  ✎      Reserved  ✎  │
└──────────────────────────────────────────────────────────────────────────┘
   ↑ hover/focus any editable cell shows the pencil; tap it → the value
     becomes an input in place; Enter saves, Esc cancels, Tab = next cell.
```

Saving price → inline reason popover → `reprice_opening_stock_unit` (expected-price optimistic lock already in the RPC) → toast "Price changed · audit recorded".
Saving condition/battery → **requires the new audited adjustment RPC** (§E.4.3) → toast → one `inventory_movements` row + one audit event.
Hovering a "Reserved" row → "Reserved by Sarah · expires in 4:02".

This replaces: the read-only register, the "Correct invoice-line" form, and the repricing card grid — all with one screen.

### F.3 Receiving (after redesign)

Instead of 9 forms and 15 page loads, one **receiving session**:

```
[ Receive stock ]  →  a focused workspace, not a page of everything

Step A — Supplier & invoice            (only if no open invoice exists)
  Supplier [        ]  Ref (optional) [      ]  Date [ 24 Nov 2026 ]
  Declared total [ GH₵ 0.00 ]                    [ Continue ]

Step B — Lines            ← type straight into the next empty row
  ┌───────────────────────────────────────────────────────────────┐
  │ Model                 Qty   Unit cost      Line total          │
  │ iPhone 16 Pro 256     5     GH₵9,200.00 ✎  GH₵46,000.00      │
  │ iPhone 15 128         3     GH₵5,100.00 ✎  GH₵15,300.00      │
  │ + add line (or just start typing in the empty row)            │
  └───────────────────────────────────────────────────────────────┘
  Declared GH₵61,300.00 · Calculated GH₵61,300.00 · Difference 0.00  ✓
  ☑ I have verified every line total and the declared total
                                     [ Confirm invoice totals ]

Step C — Devices (one row per physical phone, save-and-advance)
  Invoice line [ iPhone 16 Pro 256 · 5 outstanding ▾ ]
  ┌───────────────────────────────────────────────────────────────┐
  │ IMEI             Colour   Cond.  Batt.  Inspection   ✎       │
  │ 357000000000017  Natural  good   92%    ☑ complete ✎         │
  │ 357000000000025  Natural  good   94%    ☑ complete ✎         │
  │ ____ (next row — press Enter to save and continue)            │
  └───────────────────────────────────────────────────────────────┘
  5 of 5 received · 0 outstanding        [ Continue to pricing ]

Step D — Pricing (bulk)
  ☑ ☑ ☑ ☑ ☑  selected 5 devices
  Approved sale price for selected: [ GH₵10,900.00 ]  per device
  ☑ Pricing approved by me                       [ Activate 5 devices ]
```

`Enter` on a device row commits that row (via `receive_opening_stock_devices` with one device, or a per-row RPC) and opens the next row with colour/condition/battery/inspection inherited as *editable defaults the manager must still affirm*. Nothing is inherited silently across the batch boundary.

### F.4 Opening Stock — the specific redesign you asked for

**Goal:** one coherent workspace replacing "Initial setup" and "Audited corrections", driven by inline editing, with audit records generated behind the scenes and no rule weakened.

#### F.4.1 Structure

Replace the 3,300px page + 5 `<details>` sections with **one page, a sticky section switcher, and one master table**:

```
Opening stock                                        [ Receive stock ]
[ Invoices (3) ] [ Lines (11) ] [ Devices (8) ] [ History ]     ← sticky, with counts

── Invoices ───────────────────────────────────────────────────────────────
┌──────────────────────────────────────────────────────────────────────────┐
│ Supplier         Ref        Date        Declared     Calculated  Reconciled│
│ Approved suppl.  INV-0091   20 Nov 26   GH₵61,300    GH₵61,300   ✓ 24 Nov │
│ Titan Traders    —          22 Nov 26   GH₵18,400    GH₵18,200   ⚠  −200  │
│ + new invoice (type into the empty row and press Enter)                   │
└──────────────────────────────────────────────────────────────────────────┘
   Each cell carries ✎ on hover. Editing any cell opens the correction
   flow for THAT row: value → reason → Save. The audit row is written by
   correct_supplier_invoice exactly as today.

── Lines ───────────────────────────────────────────────────────────────────
┌──────────────────────────────────────────────────────────────────────────┐
│ Invoice        Model          Qty  Unit cost     Invoiced Recv Staged Act.│
│ INV-0091       iPhone 16 Pro   5   GH₵9,200.00   5        5    5     5  │
│ INV-0091       iPhone 15       3   GH₵5,100.00   3        0    0     0  │
│ + add line                                                                │
└──────────────────────────────────────────────────────────────────────────┘
   Qty and unit cost are editable in place (✎) → reason → correct_supplier_
   invoice_line. Cost cells are hidden entirely ("Restricted") when
   costVisible is false — the masking reads are unchanged.

── Devices ─────────────────────────────────────────────────────────────────
┌──────────────────────────────────────────────────────────────────────────┐
│ IMEI              Model          Cost        Sale price       Status   ✓ │
│ 357…017           iPhone 16 Pro  GH₵9,200    [GH₵10,900.00]  Staged   ☐ │
│ 357…025           iPhone 16 Pro  GH₵9,200    [GH₵10,900.00]  Staged   ☐ │
│ 357…041           iPhone 15      GH₵5,100    GH₵6,400.00 ✎   Activated  │
│ ── select all ──  [ Approve price for 2 selected ]                       │
└──────────────────────────────────────────────────────────────────────────┘

── History ─────────────────────────────────────────────────────────────────
   One reverse-chronological stream, human-readable, no JSON:
   24 Nov 14:02 · Sarah Owusu · corrected INV-0091 declared total
     GH₵60,900 → GH₵61,300 · "Supplier reissued with corrected total"
   24 Nov 13:40 · Sarah Owusu · approved price for 357…041
     GH₵6,100 → GH₵6,400 · "Market adjustment"
```

#### F.4.2 The interaction contract

| Gesture | Behaviour |
| --- | --- |
| Click the small ✎ beside a value | That value becomes an input, selected, in place. No modal, no navigation, no scroll. |
| `Enter` | Validates → opens a one-line **reason** field in the same cell's popover → `Enter` again saves. Two Enters total. |
| `Tab` | Commits the current cell and moves to the next editable cell in the same row. |
| `Esc` | Reverts to the previous value; nothing is sent. |
| `Enter` on the **last empty row** | Creates a new invoice / line, keeping the keyboard where it is. |
| Any save | Row shows an inline spinner → on success a green tick plus a toast ("Correction recorded · audit #…"); on failure the cell keeps the attempted value and shows the **specific** reason ("Quantity cannot be below 5 received units"). |
| Any sensitive value (cost, declared total, sale price) | Never saves on Tab. **Requires the explicit reason + Enter**, so a stray keystroke can never move money. |
| Safe values (notes, supplier name, reference, colour) | Save on blur with autosave + a quiet "Saved" tick. |
| Destructive/irreversible | Not present in this workspace by design — nothing here deletes. |

**Why the audit trail survives:** every one of those saves calls the RPC that already exists, with the same `p_reason`, the same actor derivation, and the same append-only ledger. The UI change is *where the keyboard focus goes*, not *what the database trusts*. Concretely:

| Table cell edited | RPC called (unchanged) | Audit artefact produced (unchanged) |
| --- | --- | --- |
| Supplier / ref / date / declared total / notes | `correct_supplier_invoice` | One `opening_stock_corrections` row with before/after JSON, actor, reason; clears invoice confirmation |
| Line quantity / unit cost | `correct_supplier_invoice_line` | One correction row; refuses cost change after receipt |
| Staged device sale price | `activate_opening_stock_unit` | Physical device + available inventory row + intake movement + audit event, atomically |
| Activated device sale price | `reprice_opening_stock_unit` | One adjustment movement + one price-change ledger row; expected-price optimistic lock |
| New invoice / new line | `create_supplier_invoice` / `add_supplier_invoice_line` | Existing creation audit events |

The invoice-reconciliation confirmation still clears on any correction and must be re-affirmed — the UI should surface that as a chip on the affected invoice ("Re-confirm totals") rather than silently.

#### F.4.3 What this removes

| Removed | Count |
| --- | --- |
| Collapsible `<details>` sections | 5 |
| Separate correction forms | 2 |
| Separate "receive one device" form | 1 (merged into the device table) |
| Separate per-device activation forms | n (one row each → one bulk action) |
| Separate per-device repricing forms | n (inline cell) |
| Raw `JSON.stringify` blocks | up to 2 per correction |
| Full page loads per correction | 1 → **0** |
| Clicks per correction | ~8 (scroll, expand, select, retype, submit, wait, scroll, verify) → **3** (✎, type, Enter) |
| Keystrokes for a 5-line invoice | 5 × (select + 2 fields + submit) → 5 rows typed straight through |

**Estimated saving:** a 10-device, 3-line delivery goes from ~145 interactions and ~15 page loads to ~55 interactions and 3 page loads.

---

## G. Design consistency and a proposed design system

### G.1 What is inconsistent today (verified)

| Area | Finding |
| --- | --- |
| **Two systems** | Employee pages = hand-written Tailwind on `<div>`s. Manager pages = shadcn `Card`/`Button`/`Input`/`Badge`. They share only hex codes. |
| **Design tokens unused** | `globals.css` defines a full `:root` token set and a `.manager-theme` override, but every component hardcodes hex. Changing the burgundy means editing ~200 string literals. |
| **Dead theme layer** | Root `:root` sets `color:#ffffff; background:#111111` — a dark default that no screen uses (the root body is immediately overridden by `bg-background`). `--chart-*`, `--sidebar-*`, `--radius-*` are largely unused. |
| **Dead login CSS** | ~175 lines (`.login-page` … `.apple-button`) for a design that no longer exists, including Google/Apple buttons for providers that are not configured. |
| **Radius** | 9 different radii in use: `rounded-2xl` ×80, `rounded-xl` ×70, `rounded-full` ×52, `rounded-lg` ×41, `rounded-md` ×20, `rounded-3xl` ×13, `rounded-sm` ×1, `rounded-none` ×1. Cards are `rounded-2xl` on manager screens, `rounded-3xl` on sale steps, `rounded-md` on home cards. |
| **Type scale** | Ad-hoc `text-[Npx]` everywhere: headings at `34/36/38/42/44px`, eyebrows at `10/11px` with `tracking-[0.12em…0.25em]`, body at `12/13/14/15/16px`. `PageHeader` uses `text-3xl sm:text-[34px]`; `/inventory` uses `text-[38px]`; `/new-sale` uses `text-[38px] sm:text-[44px]`. |
| **Control heights** | Inputs: 32px (`h-8` in Employees/Settings selects), 36px (`h-9`), 40px (`h-10`, most manager forms), 48px (`h-12`), 54px (login), 56px (`h-14`, sale steps), 64px (`h-16`, IMEI). Buttons: 32/36/40/48/56/58px. |
| **Colour vocabulary** | Four status families in `DataBadge` + a separate set in `device-card.tsx` (`DeviceStatus`) + a third private `Status` in `/inventory` + a fourth in `/new-sale/complete` (`#FFF4DB`) + a fifth in trade-in (`#4D5CA8` / `#D8DDF5`). Greens: `#267343`, `#214E31`, `#1F6138`. Reds: `#A13B34`, `#B42318`, `#E8C9D2`. |
| **Naming** | `Process a Swap` (home card), `Process a Swap` (header), `process_trade_ins` (permission), `Trade-in` (approvals type), "trade-in" (everything in the docs). One concept, four names. |
| **Money** | `GH₵ 8,500` (`lib/inventory.ts` `formatGhs`) vs `GH₵8,500.00` (`lib/sales.ts` `formatPesewas`). Both appear within the same session (home → trade-in → sale). |
| **Status casing** | `Available` / `Reserved` / `Sold` in `DeviceStatus` (`device-card.tsx:46-54`, used by trade-in) vs `available` / `reserved` / `sold` in the private `Status` on `/inventory` (`inventory/page.tsx:63-66`). The same physical device is labelled with a capital letter on one screen and lowercase on another. Managers additionally see `Available`/`Available`… while `manager-ui.tsx DataBadge` callers pass `inventoryStatusLabel()` (capitalised) — three casing conventions for one enum. |
| **Copy register** | Shop-floor copy ("Let's make today a great one.") mixed with developer copy ("Inventory is store-scoped through RLS", "Live database rows", "Permission-masked", "atomic batch"). The latter is correct engineering language shown to a retail manager. |
| **Duplicated primitives** | `DetailRow` (manager-ui) ≈ `SummaryRow` (trade-in) ≈ `Field` (customer-info) ≈ `Field` (settings) — four near-identical label/value components. `inputClass`/`labelClass`/`buttonClass` constants are re-declared in `opening-stock/page.tsx`, `batch-receiving-form.tsx`, and inline elsewhere. |
| **Focus/accessibility** | Focus rings are inconsistent (`focus:ring-4 ring-[#6E0728]/10` on employee inputs, `focus:ring-2` on manager, none on filter selects). Modal-ish overlays (scanner, sidebar sheet) are not consistently focus-trapped. Table rows are not keyboard reachable. Only 7 `role="status"`/`aria-live` in the whole app. |
| **Icons** | Consistent Lucide set — one of the few genuinely unified things. Keep it. |

### G.2 Proposed design system

A small, enforceable system. Deliberately minimal — this is a two-person-maintainer codebase, not a publisher.

**Tokens** (in `globals.css`, one set, light only — drop the unused dark block):

```css
:root {
  --me-burgundy:#6E0728;  --me-burgundy-press:#57051F; --me-burgundy-tint:#F7EDF0;
  --me-ink:#1D1D1F;       --me-ink-2:#424245;          --me-muted:#86868B;
  --me-line:#E8E8ED;      --me-line-soft:#F0F0F2;
  --me-surface:#FFFFFF;   --me-canvas:#FAFAFC;          --me-canvas-2:#F5F5F7;
  --me-green:#267343; --me-green-bg:#F0FAF3; --me-green-line:#CDE9D7;
  --me-amber:#8A6517; --me-amber-bg:#FFF9EB; --me-amber-line:#F2E2BD;
  --me-red:#A13B34;   --me-red-bg:#FCF4F6;   --me-red-line:#E8C9D2;
  --me-info:#4D5CA8;  --me-info-bg:#F3F5FF;  --me-info-line:#D8DDF5;
  --me-r-card:16px; --me-r-control:12px; --me-r-pill:999px;
  --me-shadow:0 1px 2px rgba(29,29,31,.04), 0 8px 24px rgba(29,29,31,.05);
}
```

**Type scale** — five roles, no arbitrary sizes:

| Role | Size / line-height / weight | Used for |
| --- | --- | --- |
| Display | 40/44, 600, −1.2px tracking | Only the top of a sale step or a completion state |
| Page title | 30/34, 600, −0.035em | One per page (`PageHeader`) |
| Section title | 18/24, 600 | Card headers, table section heads |
| Body | 15/22, 400 | Default text, table cells |
| Label / meta | 12/16, 500; uppercase option for eyebrows at 11px with 0.14em | Field labels, table headers, timestamps |

**Spacing** — 4px base, five steps: 8 / 12 / 16 / 24 / 32. Page gutter 16px mobile, 24px tablet, 32px desktop. Card padding 20px.

**Controls** — two heights only: **44px** (default, meets touch target) and **56px** (primary sale-path action). Never 32px for anything a finger must hit. Inputs always 44px minimum, 16px font to prevent iOS zoom.

**Radius** — three values only: cards 16px, controls 12px, pills 999px. Retire `rounded-md`/`rounded-3xl` on cards.

**Status** — **one** `StatusBadge` with a closed tone set (`neutral | success | warning | danger | info | brand`) and one mapping table from domain status → tone, shared by employee and manager. Delete `DeviceStatus`, the private `Status` in `/inventory`, and the inline colour ternaries in `/new-sale/complete`.

**Components to build once and reuse:**

| Component | Replaces |
| --- | --- |
| `Money` | `formatGhs` + 38 call sites of ad-hoc formatting; tabular figures |
| `StatusBadge` | 5 divergent status renderers |
| `PageHeader` (extend) | employee page headers, currently bespoke on 3 screens |
| `EditableCell` + `EditableRow` | **the new shared interaction primitive** (✎ → input → Enter/Tab/Esc → reason → save) |
| `ConfirmDialog` | all destructive actions (currently none, except browser `confirm`-less flows) |
| `Toaster` / `useToast` | 20 scattered `?notice=` banner implementations |
| `EmptyState` (extend to accept an action) | 6 bespoke empty states |
| `FieldRow` | `DetailRow`, `SummaryRow`, `Field` ×2 |
| `SearchField` (debounced) | 5 `method="get"` filter forms |
| `Sheet`-based detail panel | the right-hand `<Card>` panes on Sales/Inventory/Approvals on mobile |

**Copy rules.** Two voices only: *employee-facing* (plain, warm, short) and *system-status* (factual, no jargon). RLS, "permission-masked", "atomic", "optimistic lock" move into a manager-only "How this works" disclosure — never onto the primary surface.

---

## H. Implementation roadmap

### Phase 1 — Quick wins (days; frontend-only; no new backend)

| # | Change | Why now |
| --- | --- | --- |
| 1 | **Fix E1** — prefill correction forms from the selected record | Removes a data-corruption path. Highest value per line of code in the whole audit. |
| 2 | **Quarantine fake data (E2-A)** — remove the Reports CSV export, disable approval decisions, relabel every mock block with a visible "Sample" chip, drop the invented `+12.8%` | Stops managers acting on or forwarding invented money |
| 3 | Remove dead controls: `/home` Search + Bag, "Help & support", the hardcoded approvals badge `4` | Trust |
| 4 | Delete dead code: `action-cards.tsx`, the ~175 lines of unused login CSS in `globals.css`, and the `motion` dependency (imported nowhere). Also remove the `ui/table.tsx`, `ui/tabs.tsx` and `ui/select.tsx` primitives — verified unreferenced by any page, while every table is hand-rolled. (`skeleton`, `tooltip`, `sheet` **are** used, by `sidebar.tsx`.) | Reduces drift |
| 5 | One `Money` component and one `StatusBadge` (E18) | Instant visual consistency |
| 6 | `loading.tsx` + `error.tsx` per workspace (E20) | Turns failures into screens instead of crashes |
| 7 | Debounced client filters on `/inventory`, `/manager/inventory`, `/manager/sales`, `/manager/opening-stock` (E9) | Removes a page load per query |
| 8 | Responsive table→card under 640px on Sales, Inventory, Opening Stock (E7-adjacent) | Makes the iPhone claim true |
| 9 | `ConfirmDialog` on cancel sale / change device / suspend employee (E17) | Prevents irreversible mistakes |
| 10 | Cross-workspace navigation (E3) **and fix the manager landing page** — `defaultWorkspacePath` should prefer `/manager` when the session has `access_manager_workspace` | One tap instead of URL guessing; a manager's first screen becomes the one they need |

### Phase 2 — High-impact UX (1–2 weeks; mostly frontend)

| # | Change | Depends on |
| --- | --- | --- |
| 11 | `EditableCell`/`EditableRow` primitive (✎, Enter, Tab, Esc, inline reason) | #5, #9 |
| 12 | **Opening Stock master table** (F.4) using the primitive against existing RPCs | #11 |
| 13 | Inline price editing on `/manager/inventory` via `reprice_opening_stock_unit` | #11 |
| 14 | Inventory → sale deep link with prefilled IMEI (E6) | — |
| 15 | Employee `/home` restructure: one primary action + live resume-sale tile (C.2) | — |
| 16 | Payment screen: reservation countdown, explicit "recording X for Y" button, single cancel | — |
| 17 | Approval of staged devices in bulk (E16) | New batch RPC |
| 18 | Employees page: clean table + row action menu + dialogs (C.13) | #9, #11 |
| 19 | Completion as a sheet + cancelled as a toast (C.7) | #5 |

### Phase 3 — Larger workflow redesigns (needs backend review)

| # | Change | Why it needs backend |
| --- | --- | --- |
| 20 | Customer **before** payment (E5) | Guard in `customer-info` and the meaning of `create_completed_sale_customer` |
| 21 | Draft-on-first-scan, single IMEI screen (E7) | Sale lifecycle |
| 22 | Real dashboard: live metrics + real "needs attention" | 1–2 read-only aggregate views/RPCs |
| 23 | Real Reports from completed+confirmed sales | Aggregates |
| 24 | Inventory condition/battery adjustment | **No RPC exists**; needs an audited adjustment operation |
| 25 | Trade-in intake persistence + real approvals | New tables + approval domain |
| 26 | Store settings persistence + removal of contradictory rules | `store_settings` + audited RPC |
| 27 | Receipt / print view | New artefact |

### Phase 4 — Optional future

Live reservation extension from the payment screen · offline draft tolerance for poor connectivity (a genuine Ghana retail constraint) · barcode/label printing at intake · idle-timeout warning on shared iPhones · keyboard shortcuts cheat-sheet on manager tables · device age/low-battery/ageing-stock filters · audit-event browser for `view_audit_events` · multilingual copy (English/Twi) for shop-floor labels.

### Recommended order and dependencies

```
1 ─┬─ 2 ─ 3 ─ 4        (independent, ship immediately)
   └─ 5 ─┬─ 6 ─ 7 ─ 8
         └─ 9 ─ 10
              │
              └─ 11 ─┬─ 12 (Opening Stock table)  ← the flagship change
                     ├─ 13 (inline price on inventory)
                     └─ 18 (employee dialogs)
        14, 15, 16, 19 independent of 11, can ship in parallel
        17 needs a batch RPC → do with 20–24's backend work
        20 → 21 (sale journey rework, sequential)
        22 → 23 (aggregates first)
        24, 25, 26 → 27 (new domains last)
```

**Rule of thumb for the split:** anything that changes *where the keyboard focus goes* is frontend-only. Anything that changes *what the database will accept* is backend and must be reviewed separately. The Opening Stock redesign (your priority) is almost entirely the former — which is why it is the right first big piece of work.

---

## I. What I recommend we decide together

1. **Opening Stock first?** It is the highest-value manager hour and the redesign is mostly frontend. But fix E1 (wrong-invoice corrections) as a standalone patch before the redesign, because the bug is live today.
2. **What happens to the mock pages?** Three options: (a) hide `/manager/approvals` and `/manager/reports` from the sidebar until real, (b) keep them with hard "Sample" treatment, (c) build them for real. I recommend (a) for approvals and (b) for reports in the interim — a manager needs *some* financial view, but not a fabricated one.
3. **Trade-in:** preview-only with persistence, or remove the route until the approval domain exists? Shipping a six-step wizard that loses work is worse than not shipping it.
4. **Does the sale journey reorder (customer before payment)?** This is the single biggest correctness-of-process improvement and it is the only UX recommendation that requires a real backend change.

---

*No files were modified, committed, pushed, merged, or deployed in the course of this audit. The only artefact produced is this report. The local dev server used for route verification was started with placeholder Supabase credentials and left running only for the duration of the inspection; it performed no database reads or writes.*

---

## Appendix — Verification ledger

Every "does not exist" / "is never called" / "is hardcoded" claim in this report, with the check that produced it. Reproduce with the commands shown.

| Claim | How verified |
| --- | --- |
| 18 routes exist, no others | `find src/app -name "page.tsx" -o -name "route.ts"` |
| The app boots and `/` renders unauthenticated | `next dev` on :3007; `curl /` → `200`, body contains "Good to have", "Sign in securely"; `/home`, `/manager`, `/trade-in` → `307` to `/?next=…` |
| No `loading.tsx`, `error.tsx`, or `not-found.tsx` | `find src -name "loading.tsx" -o -name "error.tsx" -o -name "not-found.tsx" \| wc -l` → `0` |
| No client component performs a direct table write | `grep -rln '"use client"' src \| xargs grep -ln "\.insert(\|\.update(\|\.delete("` → empty. The only `.delete` hit app-wide is `Set.prototype.delete` in `lib/auth/resolve.ts:155`. |
| Approvals have no backend | No `create table public.approvals` in any migration; the only occurrence of the word is the permission seed `review_approvals` at `phase_01_foundation.sql:269`. |
| Trade-in has no backend | No `trade_in*` table or RPC in any migration; only the `process_trade_ins` / `approve_trade_ins` permission seeds. |
| `motion` is an unused dependency | `grep -rn "motion" src` → no import statements |
| `ui/table.tsx`, `ui/tabs.tsx`, `ui/select.tsx` are unreferenced | per-primitive import count across `src/app` + `src/components` → `0, 0, 0` (while `card` 9, `button` 9, `separator` 6, `input` 5) |
| `action-cards.tsx` is dead | `grep -rn "ActionCards\|action-cards" src` → only its own definition |
| Discount UI does not exist | `updateSaleItemDiscountAction` (`new-sale/actions.ts:79`) has no callers; no page imports it |
| Customer search does not exist in the UI | `selectSaleCustomerAction` (`new-sale/actions.ts:100`) and `listStoreCustomers` (`sales-server.ts:356`) have no callers outside their definitions |
| Draft-expiry action is orphaned | `expireSaleDraftsAction` (`new-sale/actions.ts:193`) has no callers |
| No cross-workspace links | `grep -rn 'href="/manager' src --include=*.tsx \| grep -v "src/app/manager\|manager-shell"` → empty; reciprocal grep for `/home\|/new-sale\|/inventory\|/trade-in` inside `src/app/manager` + `src/components/manager` → empty |
| Hardcoded approvals badge = 4 | `manager-shell.tsx:56` — `{ label: "Approvals", …, count: 4 }` |
| Manager dashboard mixes live and mock | `manager/page.tsx` imports `initialApprovals, money, sales` from `lib/manager-data.ts` and `listAuthorizedInventory` from `lib/inventory-server.ts`; the chart heights `[20,39,31,46,54,34,100]` are literals at line 87 |
| Reports rescales rather than computes | `reports/page.tsx:28-32` — `periodScale = { daily: 0.021, weekly: 0.073, monthly: 1 }`, applied by multiplication to the `manager-data.ts` arrays |
| Correction forms prefill the wrong record | `opening-stock/page.tsx:262-266` prefill from `firstInvoice = dashboard.invoices[0]` (line 183) while the same form's `<select name="invoiceId">` (line 261) offers every invoice; identically `firstLine` (line 184) vs the line selector (line 273) |
| Opening Stock form/section counts | `grep -c "<form" opening-stock/page.tsx` → `9`; `grep -c "<FormSection"` → `5` |
| Opening Stock page size | `wc -l opening-stock/page.tsx` → `542`; rendered section order spans ~3,300px at 1440×900 (estimated from section heights, not measured in a browser) |
| Table min-widths | `min-w-[720px]` (dashboard), `min-w-[900px]` (sales), `min-w-[950px]` (inventory), `min-w-[1050px]` (opening-stock lines) |
| Employee mobile nav omits trade-in | `employee-header.tsx:48-60` mobile block lists Inventory, New Sale, Sign out only; the desktop block at `36-46` includes `Process a Swap` |
| Two money formatters | `lib/inventory.ts:32` `formatGhs` (whole cedis, no decimals) vs `lib/sales.ts:14` `formatPesewas` (BigInt, force 2 decimals) |
| Radius sprawl | `grep -rho "rounded-\(none\|sm\|md\|lg\|xl\|2xl\|3xl\|full\)" src --include=*.tsx \| sort \| uniq -c` → 8 distinct values, 278 occurrences |
| Login page has a second unused stylesheet | `globals.css:67-240` defines `.login-page`…`.apple-button`; no `.tsx` file references any of those class names |
| Seed role defaults | `phase_01_foundation.sql:283-305` — manager receives every permission **except** `manage_roles`; therefore a manager has both `access_employee_workspace` and `access_manager_workspace`, and lands on `/home`, not `/manager`, at sign-in |
