# Phase 3 employee authentication

Phase 3 adds email/password employee authentication, trusted route authorization, and an invitation foundation without changing the existing employee or manager workflows. It does not connect persistent inventory, sales, payments, trade-ins, or reporting.

## Authentication flow

- `/` accepts a work email and password through a server action. There is no registration link or public sign-up action.
- Supabase Auth validates credentials. Client-facing failures are deliberately generic so account existence and provider details are not disclosed.
- After authentication, application access is resolved from `profiles`, active `store_memberships`, active stores, roles, role permissions, and explicit permission overrides.
- A valid Auth session without either employee or manager workspace permission is signed out and denied application access. Manager-only assignments land on `/manager` even when `access_employee_workspace` is explicitly denied.
- Ordinary password sign-in never consumes a pending invitation.
- `/auth/confirm` receives the real Supabase email token plus an invitation ID and a random application acceptance token, verifies the Auth token, and atomically accepts only that locked invitation row.
- New-account invitation links continue to `/auth/set-password`, which enforces a 12-character application minimum. Existing accounts receive a no-signup magic link and continue to their authorized workspace without a misleading invitation failure.
- Sign-out is a server action that clears the local Supabase session. Employee and manager shells use this action rather than linking back to the sign-in page.

The browser receives only the Supabase URL and publishable key. The service-role credential is loaded only by `src/lib/supabase/admin.ts`, which imports `server-only`, disables session persistence, and is used solely for trusted Auth Admin invitation delivery.

## Route authorization

Next.js Proxy validates the access token with `auth.getUser()` and refreshes session cookies through `@supabase/ssr`. Protected server layouts repeat the authorization check so access does not depend on navigation UI or a client-side redirect.

| Route | Required effective permission(s) |
| --- | --- |
| `/home`, `/inventory` | `access_employee_workspace` |
| `/new-sale/**` | `access_employee_workspace`, `create_sales` |
| `/trade-in` | `access_employee_workspace`, `process_trade_ins` |
| `/manager`, `/manager/sales` | `access_manager_workspace` |
| `/manager/inventory` | `access_manager_workspace`, `manage_inventory` |
| `/manager/employees` | `access_manager_workspace`, `manage_employee_access` |
| `/manager/approvals` | `access_manager_workspace`, `review_approvals` |
| `/manager/reports` | `access_manager_workspace`, `view_reports` |
| `/manager/settings` | `access_manager_workspace`, `manage_store_settings` |

Permissions are never accepted from forms, URL parameters, user metadata, or caller-supplied role claims. Explicit membership overrides are applied after role defaults, so a denial immediately removes access. Suspended profiles, suspended or inactive memberships, and inactive stores fail closed. Denied routes fall back only to a workspace the account can actually access, avoiding `/home` redirect loops. Post-login redirects are revalidated after URL normalization, including protocol-relative and encoded separators.

## Invitation foundation

The review-only migration `20261123180000_phase_03_employee_auth.sql` adds:

- `prepare_staff_invitation` — locks the actor's active access chain, requires `manage_employee_access`, permits ordinary managers to assign only the employee role, and requires `manage_roles` for elevated roles. Every preparation or retry rotates a random invitation-specific token and appends a distinct audit event.
- `record_staff_invitation_delivery` — appends one idempotent `sent` or `failed` provider result for the exact preparation attempt, including whether the channel was a new-account Auth invite or existing-account magic link.
- `accept_staff_invitation` — accepts one invitation ID and random token, requires a verified Auth email, locks Auth/profile/invitation/store/membership state, and activates only the store and role from that invitation row.

The raw random token is sent only in the email link; the database stores its SHA-256 digest and clears it after acceptance. A second pending invitation for the same email remains pending. Store/role authority never comes from editable user metadata, and password sign-in does not call the acceptance function.

All three functions are security-definer functions with a fixed empty search path and narrowly granted execution. Authenticated users still cannot insert or update invitations, memberships, roles, or audit rows directly.

`src/lib/auth/provisioning.ts` performs these server-side gates before delivery:

1. validates and normalizes the request;
2. confirms the caller's effective `manage_employee_access` permission for the selected store;
3. calls the permission-checked preparation function;
4. requests a Supabase Auth invitation for a new account, or a `shouldCreateUser: false` magic link when Auth reports that the account already exists;
5. records the provider outcome against the exact preparation attempt.

Local Supabase uses the reviewed templates in `supabase/templates/`. They link directly to `/auth/confirm` with Supabase's `TokenHash` and the database-backed invitation token, so the default provider redirect cannot lose the confirmation parameters. Production must install and test equivalent templates as a separately approved hosted Auth change.

The invitation email feature also requires `STAFF_INVITATION_EMAIL_ENABLED=true`. Keep it false until SMTP, templates, and redirect configuration have been reviewed and tested. Provider errors and action links are never returned to browser code.

## Hosted Auth inspection and blockers

The hosted project `vyjqmwgyriebgzajmmax` was inspected read-only on 23 November 2026. No Auth setting was changed.

Observed configuration:

- email/password provider enabled;
- email confirmation required (`mailer_autoconfirm=false`);
- no custom SMTP host, user, sender, or password configured;
- site URL still `http://localhost:3000`;
- redirect allow-list empty;
- public signup still enabled at the hosted provider level;
- zero hosted Auth users and zero production stores.

These are deployment blockers, not conditions the application should bypass:

1. **Email delivery:** configure a production SMTP provider and sender. Do not distribute generated action links manually as a substitute.
2. **Templates and redirects:** install the reviewed invite and magic-link templates, approve the production site URL and exact `/auth/confirm` redirect, and test that delivered links retain `token_hash`, `type`, `invitation_id`, and `acceptance_token` through confirmation.
3. **Invite-only policy:** disable hosted public signup after confirming both the new-account and existing-account email flows. The application exposes no sign-up UI, but the hosted API setting remains a defense-in-depth gap until changed.
4. **Phase 3 database review:** review and separately approve the Phase 3 migration before applying it to hosted Supabase.
5. **First administrator:** decide the production store code/name and initial administrator email. Because there is currently no administrator, the first store and administrator membership require a one-time, owner-controlled bootstrap after SMTP works. That operation must create the Auth user through Auth Admin, rely on the profile trigger, assign the fixed administrator role in a reviewed transaction, and append a bootstrap audit event. Do not use public signup, browser-side service-role access, fake identities, or a self-assignment endpoint.

After the first administrator exists, all later employee invitations should use the permission-checked invitation flow. This phase intentionally does not invent production store details or create the first account.

## Environment

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
APP_URL=http://localhost:3000
STAFF_INVITATION_EMAIL_ENABLED=false
```

`SUPABASE_SERVICE_ROLE_KEY` and any SMTP credential are server-only. Never prefix them with `NEXT_PUBLIC_`, commit them, log them, or send them to the browser.

## Local validation

```bash
npm ci
npm test
npm run lint
npm run typecheck
npm run build
npm run supabase:start
npm run db:reset
npm run db:lint
npm run db:test
npm run db:test:inventory-concurrency
npm run db:test:auth-concurrency
npm run db:test:auth-sessions
npm run supabase:stop -- --no-backup
```

The Auth integration scripts refuse every non-local API, database, and mail-capture URL. They create randomized disposable local users and sessions to test email/password authentication, manager-only access, token validation, sign-out, employee/manager isolation, suspension, anonymous denial, real local invite and magic-link email templates, SSR confirmation cookies, password setup, multiple invitations for one email, existing accounts, repeated delivery audits, and deterministic acceptance-versus-suspension locking. The GitHub workflow runs these checks against a fresh disposable Supabase stack and always removes it.
