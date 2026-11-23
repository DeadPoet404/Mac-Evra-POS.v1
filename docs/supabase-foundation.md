# Supabase foundation

## Hosted project inspection

The connected Supabase project was inspected read-only on 23 November 2026.

| Setting | Inspected value |
| --- | --- |
| Project | Mac Evra project |
| Project ref | `vyjqmwgyriebgzajmmax` |
| Organisation | Mac-Evra-Store |
| Region | `eu-west-1` |
| Project status | `ACTIVE_HEALTHY` |
| PostgreSQL | 17.12, GA channel |
| Auth service | GoTrue v2.198.0, healthy |

All reported services were healthy. The public and GraphQL API schemas had no application tables, views, policies, functions, or triggers. Auth had zero users and identities. Storage had zero buckets and objects. No user-created migrations, database branches, Edge Functions, or Realtime subscriptions existed.

The enabled extensions were the Supabase defaults present on the new project: `pg_stat_statements`, `pgcrypto`, `plpgsql`, `supabase_vault`, and `uuid-ossp`.

Hosted Auth was configured with:

- site URL `http://localhost:3000`;
- email provider enabled and email confirmation required;
- phone, Google, Apple, and other external providers disabled;
- public signup enabled (not yet aligned with the locked invite-only policy);
- anonymous users disabled;
- one-hour JWT expiry;
- refresh-token rotation enabled with a 10-second reuse interval;
- TOTP enrolment and verification available;
- minimum password length of six;
- no custom SMTP configuration.

The hosted project is suitable for Mac Evra because it is healthy and contains no application data or schema that would conflict with the Phase 1 migration. Public signup, password policy, provider selection, redirect URLs, and MFA enforcement still require a reviewed hosted Auth change. No hosted setting or schema was changed during inspection or implementation.

## Foundation tables

| Table | Purpose |
| --- | --- |
| `stores` | Store identity, status, timezone, and GHS-only currency foundation |
| `profiles` | One-to-one application profile for `auth.users` |
| `roles` | System employee, manager, and administrator roles |
| `permissions` | Named capabilities used by RLS and future trusted operations |
| `role_permissions` | Default role-to-permission mapping |
| `store_memberships` | Store-scoped role and access status for a profile |
| `membership_permission_overrides` | Explicit allow/deny exceptions with reason and grantor |
| `staff_invitations` | Invite-only onboarding metadata; Supabase Auth owns secure invite tokens |
| `audit_events` | Append-only foundation for sensitive-action history |

The development seed creates only one `Mac Evra — Development Store`. It creates no Auth users, employees, credentials, invitations, inventory, or financial records.

## Role defaults

- **Employee:** employee workspace, assigned sale creation, inventory reservation, trade-in submission, and own-performance access.
- **Manager:** all employee capabilities plus manager workspace, inventory management, employee access, approvals, sensitive-action approval capabilities, reports, settings, and audit visibility.
- **Administrator:** all defined permissions, including role management.

An explicit membership permission override wins over the role default. Authenticated clients cannot create or edit role assignments or overrides directly; future Next.js server operations must validate the actor and write the corresponding audit event.

## Row Level Security

All Phase 1 application tables have RLS enabled and forced.

| Resource | Authenticated access |
| --- | --- |
| Stores | Select active stores where the caller has an active membership |
| Profiles | Select own profile; employee-access managers can select profiles in their store |
| Profile updates | Own `display_name` and `phone` columns only |
| Roles and permissions | Select for active members |
| Memberships | Select own membership; employee-access managers can select store memberships |
| Permission overrides | Select own overrides; employee-access managers can select store overrides |
| Staff invitations | Select only with store employee-access permission |
| Audit events | Select only with store audit permission |

There are no authenticated insert/delete policies on foundation administration tables. Anonymous clients receive no table privileges. The `private` schema is not exposed by PostgREST; its narrowly granted helper functions evaluate active membership and permissions for RLS.

## Audit guarantees in this phase

`audit_events` has no `updated_at` field and a database trigger rejects every update or delete. Authenticated users cannot insert audit events directly. The service role receives only select and insert privileges on this table. Future trusted commands must append an event in the same transaction as the sensitive change.

This is an application-level append-only guarantee. Hosted backups, log retention, monitoring, and privileged database-owner controls remain operational requirements.

## Auth integration boundary

`src/proxy.ts` uses the Next.js 16 proxy convention to validate/refresh Supabase access tokens. Browser and server clients use `@supabase/ssr` cookie adapters. The browser has no path to a service-role credential.

The current sign-in page was not connected because it offers Google and Apple while both providers are disabled remotely. Wiring either button now would create a broken flow; adding email/password or magic-link controls would invent and redesign an authentication method. Route redirects are therefore deferred until an approved provider is configured.

## Migration safety

The repository migration is version-controlled but not applied to the hosted project. Local validation should use:

```bash
npm run supabase:start
npm run db:reset
npm run db:lint
npm run db:test
```

After explicit approval, link and push migrations with:

```bash
npx supabase login
npx supabase link --project-ref vyjqmwgyriebgzajmmax
npx supabase db push
```

Never run `supabase db reset --linked` or any equivalent reset against the hosted project.
