# Mac Evra POS

Mac Evra POS is an employee-assisted iPhone retail point-of-sale interface for a retail business in Ghana. It is built with Next.js App Router, React, TypeScript, Tailwind CSS, shadcn/ui and Lucide icons.

## Current status

The repository contains a complete frontend demonstration of the employee sale flow and manager workspace. It does **not** yet have production authentication, database persistence or payment-provider confirmation.

Sample records are centralised in `src/lib/manager-data.ts`. Manager edits are held in React state and reset when the page reloads. All sample contact details use the reserved `.example` domain.

### Employee routes

| Route | Purpose |
| --- | --- |
| `/` | Sign-in preview |
| `/home` | Employee home |
| `/new-sale` | Find/scan a physical device |
| `/new-sale/payment` | Record a demo payment entry |
| `/new-sale/customer-info` | Collect customer details |
| `/new-sale/checkout` | Review the preview sale |
| `/new-sale/complete` | Preview completion state |

The payment and checkout pages explicitly identify their payment state as unverified demo data. Entering an amount or transaction reference never represents production payment confirmation.

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

4. **Approvals and audit trail**
   - Execute approved actions on the server in a single transaction.
   - Record the requester, approver, timestamps, reason, previous value and resulting value.
   - Never allow the requester to approve their own sensitive request where separation of duties is required.

5. **Receipts and reporting**
   - Generate immutable receipt numbers only after successful completion.
   - Derive financial reports from confirmed payment and cost records.
   - Include taxes, provider fees, refunds and operating costs in production profit reporting as applicable.

6. **Testing and operations**
   - Add unit, integration and end-to-end tests for the complete sale state machine.
   - Add monitoring, backups, migration checks and recovery procedures.

Do not place API keys or service credentials in tracked files. Use environment variables and server-only clients when backend integrations are introduced.
