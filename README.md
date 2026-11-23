# Mac Evra POS

Mac Evra POS is an employee-assisted iPhone retail point-of-sale interface for a retail business in Ghana. It is built with Next.js App Router, React, TypeScript, Tailwind CSS, shadcn/ui and Lucide icons.

## Current status

The repository contains a complete frontend demonstration of the employee sale flow and manager workspace. It does **not** yet have production authentication, database persistence or payment-provider confirmation.

Shared physical-device records are centralised in `src/lib/inventory.ts` and are reused by the employee and manager experiences. Other manager preview records remain in `src/lib/manager-data.ts`. Interface edits are held in local or session state and reset when that browser state is cleared. All sample contact details use the reserved `.example` domain.

### Employee routes

| Route | Purpose |
| --- | --- |
| `/` | Sign-in preview |
| `/home` | Employee home and workflow navigation |
| `/inventory` | Search and filter IMEI-level inventory, inspect a device and select it for sale |
| `/trade-in` | Six-step customer trade-in and replacement-device preview |
| `/new-sale` | Find/scan a physical device or continue an inventory selection |
| `/new-sale/payment` | Record a demo payment entry |
| `/new-sale/customer-info` | Collect customer details |
| `/new-sale/checkout` | Review the preview sale |
| `/new-sale/complete` | Preview completion state |

The selected inventory device is passed through the sale journey in session storage, so model, IMEI and price do not need to be re-entered. Only sample devices marked `Available` can be selected. This frontend handoff does not reserve or sell inventory; production requires an atomic server-side transition.

The trade-in route captures customer and device details, requires every inspection item to be assessed, presents clearly labelled illustrative valuation adjustments, limits replacement selection to available inventory, and prepares a demo manager-approval request. Every trade-in estimate requires manager review in this preview. The fixed figures in `src/lib/trade-in.ts` demonstrate the interface only and are not business valuation rules.

The payment and checkout pages explicitly identify their payment state as unverified demo data. Entering an amount or transaction reference never represents production payment confirmation.

Employee routes share navigation and device presentation components in `src/components/employee`. No IMEI, ownership, blacklist, activation-lock, diagnostic, payment or approval service is connected.

### Manager routes

| Route | Purpose |
| --- | --- |
| `/manager` | Store overview and attention queue |
| `/manager/sales` | Transactions, collections, balances and payment status |
| `/manager/inventory` | IMEI-level device register and availability |
| `/manager/employees` | Profiles, roles, permissions, performance and activity |
| `/manager/approvals` | Refund, cancellation, discount, trade-in and stock requests |
| `/manager/reports` | Sales, collections, team/model/payment and margin reporting |
| `/manager/settings` | Store, account, POS and business preferences |

Manager pages share the responsive shell in `src/components/manager/manager-shell.tsx` and reusable presentation components in `src/components/manager/manager-ui.tsx`.

## Run locally

Requirements:

- Node.js 22 or newer
- npm

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The development server can also be exposed by binding to all interfaces:

```bash
npm run dev -- --hostname 0.0.0.0
```

## Quality checks

```bash
npm run lint
npx tsc --noEmit
npm run build
```

The app uses a system font stack, so production builds do not depend on downloading a Google font.

## Important production blockers

The current UI is suitable for design review and workflow validation only. Before live retail use, the following are required:

1. **Authentication and authorisation**
   - Connect employee identities.
   - Enforce roles and permissions on the server, not only in the interface.
   - Add secure sessions, account recovery and manager-grade MFA.

2. **Persistent data with server-side constraints**
   - Add stores, employees, customers, devices, reservations, sales, payment attempts, approval requests, receipts and audit events.
   - Enforce a unique IMEI constraint.
   - Use atomic database transactions to move a device from `Available` to `Reserved` to `Sold`.
   - Prevent sold devices from being returned to available stock without an approved, audited return workflow.

3. **Trusted payment confirmation**
   - Integrate supported Ghana payment providers and bank/card confirmation channels.
   - Verify provider webhooks server-side and make them idempotent.
   - Treat employee-entered references as unverified metadata only.
   - Require the sum of confirmed payment components to equal the sale total before completion or device handover.

4. **Trade-in verification and valuation**
   - Connect trusted IMEI, ownership, blacklist, activation-lock and diagnostic checks.
   - Replace the illustrative estimate with manager-approved business valuation rules and version those rules.
   - Create incoming inventory only after required checks, customer consent and manager approval.
   - Reserve the selected replacement device atomically while the trade-in transaction is active.

5. **Approvals and audit trail**
   - Execute approved actions on the server in a single transaction.
   - Record the requester, approver, timestamps, reason, previous value and resulting value.
   - Never allow the requester to approve their own sensitive request where separation of duties is required.

6. **Receipts and reporting**
   - Generate immutable receipt numbers only after successful completion.
   - Derive financial reports from confirmed payment and cost records.
   - Include taxes, provider fees, refunds and operating costs in production profit reporting as applicable.

7. **Testing and operations**
   - Add unit, integration and end-to-end tests for the complete sale state machine.
   - Add monitoring, backups, migration checks and recovery procedures.

Do not place API keys or service credentials in tracked files. Use environment variables and server-only clients when backend integrations are introduced.
