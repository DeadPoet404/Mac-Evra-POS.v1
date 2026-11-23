begin;

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
comment on schema private is 'Internal functions that are not exposed through the Data API.';
revoke all on schema private from public;

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  timezone text not null default 'Africa/Accra',
  currency text not null default 'GHS',
  status text not null default 'active',
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint stores_code_format check (code = lower(code) and code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint stores_name_not_blank check (length(btrim(name)) > 0),
  constraint stores_timezone_not_blank check (length(btrim(timezone)) > 0),
  constraint stores_currency_ghs check (currency = 'GHS'),
  constraint stores_status_valid check (status in ('active', 'inactive')),
  constraint stores_code_unique unique (code)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on update cascade on delete restrict,
  display_name text not null,
  work_email text,
  phone text,
  status text not null default 'active',
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint profiles_display_name_not_blank check (length(btrim(display_name)) > 0),
  constraint profiles_status_valid check (status in ('active', 'suspended'))
);

create unique index profiles_work_email_unique
  on public.profiles (lower(work_email))
  where work_email is not null;

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  description text not null,
  is_system boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint roles_code_format check (code = lower(code) and code ~ '^[a-z][a-z0-9_]*$'),
  constraint roles_name_not_blank check (length(btrim(name)) > 0),
  constraint roles_code_unique unique (code)
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  description text not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint permissions_code_format check (code = lower(code) and code ~ '^[a-z][a-z0-9_]*$'),
  constraint permissions_description_not_blank check (length(btrim(description)) > 0),
  constraint permissions_code_unique unique (code)
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on update cascade on delete restrict,
  permission_id uuid not null references public.permissions(id) on update cascade on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  primary key (role_id, permission_id)
);

create index role_permissions_permission_idx
  on public.role_permissions (permission_id, role_id);

create table public.store_memberships (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on update cascade on delete restrict,
  user_id uuid not null references public.profiles(id) on update cascade on delete restrict,
  role_id uuid not null references public.roles(id) on update cascade on delete restrict,
  status text not null default 'pending',
  invited_by uuid references public.profiles(id) on update cascade on delete restrict,
  joined_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint store_memberships_status_valid check (status in ('pending', 'active', 'suspended', 'inactive')),
  constraint store_memberships_store_user_unique unique (store_id, user_id)
);

create index store_memberships_user_status_idx
  on public.store_memberships (user_id, status, store_id);
create index store_memberships_store_status_role_idx
  on public.store_memberships (store_id, status, role_id);

create table public.membership_permission_overrides (
  membership_id uuid not null references public.store_memberships(id) on update cascade on delete restrict,
  permission_id uuid not null references public.permissions(id) on update cascade on delete restrict,
  allowed boolean not null,
  reason text not null,
  granted_by uuid not null references public.profiles(id) on update cascade on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (membership_id, permission_id),
  constraint membership_permission_overrides_reason_not_blank check (length(btrim(reason)) >= 5)
);

create index membership_permission_overrides_permission_idx
  on public.membership_permission_overrides (permission_id, membership_id);

create table public.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on update cascade on delete restrict,
  email text not null,
  role_id uuid not null references public.roles(id) on update cascade on delete restrict,
  status text not null default 'pending',
  invited_by uuid not null references public.profiles(id) on update cascade on delete restrict,
  accepted_by uuid references public.profiles(id) on update cascade on delete restrict,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint staff_invitations_email_not_blank check (length(btrim(email)) > 3 and position('@' in email) > 1),
  constraint staff_invitations_email_normalized check (email = lower(btrim(email))),
  constraint staff_invitations_status_valid check (status in ('pending', 'accepted', 'expired', 'revoked')),
  constraint staff_invitations_expiry_after_creation check (expires_at > created_at),
  constraint staff_invitations_acceptance_consistent check (
    (status = 'accepted' and accepted_by is not null and accepted_at is not null)
    or
    (status <> 'accepted' and accepted_by is null and accepted_at is null)
  ),
  constraint staff_invitations_revocation_consistent check (
    (status = 'revoked' and revoked_at is not null)
    or
    (status <> 'revoked' and revoked_at is null)
  )
);

create unique index staff_invitations_pending_store_email_unique
  on public.staff_invitations (store_id, lower(email))
  where status = 'pending';
create index staff_invitations_store_status_idx
  on public.staff_invitations (store_id, status, expires_at);
create index staff_invitations_email_idx
  on public.staff_invitations (lower(email), status);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on update cascade on delete restrict,
  actor_user_id uuid references public.profiles(id) on update cascade on delete restrict,
  actor_membership_id uuid references public.store_memberships(id) on update cascade on delete restrict,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  request_id text,
  event_data jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default statement_timestamp(),
  constraint audit_events_action_not_blank check (length(btrim(action)) > 0),
  constraint audit_events_entity_type_not_blank check (length(btrim(entity_type)) > 0),
  constraint audit_events_data_is_object check (jsonb_typeof(event_data) = 'object')
);

create index audit_events_store_time_idx
  on public.audit_events (store_id, occurred_at desc);
create index audit_events_actor_time_idx
  on public.audit_events (actor_user_id, occurred_at desc);
create index audit_events_entity_time_idx
  on public.audit_events (entity_type, entity_id, occurred_at desc);
create index audit_events_request_idx
  on public.audit_events (request_id)
  where request_id is not null;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = statement_timestamp();
  return new;
end;
$$;

create trigger stores_set_updated_at
before update on public.stores
for each row execute function private.set_updated_at();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger roles_set_updated_at
before update on public.roles
for each row execute function private.set_updated_at();

create trigger store_memberships_set_updated_at
before update on public.store_memberships
for each row execute function private.set_updated_at();

create trigger membership_permission_overrides_set_updated_at
before update on public.membership_permission_overrides
for each row execute function private.set_updated_at();

create trigger staff_invitations_set_updated_at
before update on public.staff_invitations
for each row execute function private.set_updated_at();

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_name text;
begin
  profile_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Team member'
  );

  insert into public.profiles (id, display_name, work_email)
  values (new.id, profile_name, lower(new.email))
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

create or replace function private.prevent_audit_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit events are append-only';
end;
$$;

create trigger audit_events_append_only
  before update or delete on public.audit_events
  for each row execute function private.prevent_audit_event_mutation();

insert into public.roles (id, code, name, description)
values
  ('00000000-0000-4000-8000-000000000101', 'employee', 'Employee', 'Employee-assisted sales and trade-in access.'),
  ('00000000-0000-4000-8000-000000000102', 'manager', 'Manager', 'Store management and sensitive-action approval access.'),
  ('00000000-0000-4000-8000-000000000103', 'administrator', 'Administrator', 'Store administration, access control and all manager permissions.')
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    updated_at = statement_timestamp();

insert into public.permissions (id, code, description)
values
  ('00000000-0000-4000-8000-000000000201', 'access_employee_workspace', 'Access the authenticated employee workspace.'),
  ('00000000-0000-4000-8000-000000000202', 'create_sales', 'Create and manage assigned sale drafts.'),
  ('00000000-0000-4000-8000-000000000203', 'reserve_inventory', 'Reserve eligible inventory for an assigned workflow.'),
  ('00000000-0000-4000-8000-000000000204', 'process_trade_ins', 'Record trade-in details and submit them for approval.'),
  ('00000000-0000-4000-8000-000000000205', 'view_own_performance', 'View the member''s own performance information.'),
  ('00000000-0000-4000-8000-000000000206', 'access_manager_workspace', 'Access the manager workspace.'),
  ('00000000-0000-4000-8000-000000000207', 'manage_inventory', 'Manage inventory intake and approved adjustments.'),
  ('00000000-0000-4000-8000-000000000208', 'manage_employee_access', 'Manage store memberships, invitations and permitted access.'),
  ('00000000-0000-4000-8000-000000000209', 'review_approvals', 'Review approval requests subject to separation of duties.'),
  ('00000000-0000-4000-8000-000000000210', 'approve_discounts', 'Approve sale discounts within store policy.'),
  ('00000000-0000-4000-8000-000000000211', 'approve_trade_ins', 'Approve trade-in valuations and acceptance.'),
  ('00000000-0000-4000-8000-000000000212', 'approve_refunds', 'Approve refund requests.'),
  ('00000000-0000-4000-8000-000000000213', 'approve_cancellations', 'Approve sale cancellation requests.'),
  ('00000000-0000-4000-8000-000000000214', 'approve_inventory_adjustments', 'Approve sensitive inventory adjustments.'),
  ('00000000-0000-4000-8000-000000000215', 'view_reports', 'View store financial and operational reports.'),
  ('00000000-0000-4000-8000-000000000216', 'manage_store_settings', 'Manage store-level configuration.'),
  ('00000000-0000-4000-8000-000000000217', 'view_audit_events', 'View store audit history.'),
  ('00000000-0000-4000-8000-000000000218', 'manage_roles', 'Manage role assignments and permission overrides.')
on conflict (code) do update
set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in (
  'access_employee_workspace',
  'create_sales',
  'reserve_inventory',
  'process_trade_ins',
  'view_own_performance'
)
where r.code = 'employee'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code <> 'manage_roles'
where r.code = 'manager'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'administrator'
on conflict do nothing;

create or replace function private.has_any_active_membership()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.store_memberships m
    join public.profiles p on p.id = m.user_id
    join public.stores s on s.id = m.store_id
    where m.user_id = auth.uid()
      and m.status = 'active'
      and p.status = 'active'
      and s.status = 'active'
  );
$$;

create or replace function private.is_active_store_member(target_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.store_memberships m
    join public.profiles p on p.id = m.user_id
    join public.stores s on s.id = m.store_id
    where m.user_id = auth.uid()
      and m.store_id = target_store_id
      and m.status = 'active'
      and p.status = 'active'
      and s.status = 'active'
  );
$$;

create or replace function private.has_store_permission(target_store_id uuid, permission_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when permission_override.allowed is not null then permission_override.allowed
      else role_permission.permission_id is not null
    end
    from public.store_memberships membership
    join public.profiles profile on profile.id = membership.user_id
    join public.stores store_record on store_record.id = membership.store_id
    join public.permissions permission_record on permission_record.code = permission_code
    left join public.membership_permission_overrides permission_override
      on permission_override.membership_id = membership.id
     and permission_override.permission_id = permission_record.id
    left join public.role_permissions role_permission
      on role_permission.role_id = membership.role_id
     and role_permission.permission_id = permission_record.id
    where membership.user_id = auth.uid()
      and membership.store_id = target_store_id
      and membership.status = 'active'
      and profile.status = 'active'
      and store_record.status = 'active'
    limit 1
  ), false);
$$;

create or replace function private.can_view_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_user_id = auth.uid()
    or exists (
      select 1
      from public.store_memberships target_membership
      where target_membership.user_id = target_user_id
        and target_membership.status in ('pending', 'active', 'suspended', 'inactive')
        and private.has_store_permission(target_membership.store_id, 'manage_employee_access')
    );
$$;

revoke all on function private.set_updated_at() from public;
revoke all on function private.handle_new_auth_user() from public;
revoke all on function private.prevent_audit_event_mutation() from public;
revoke all on function private.has_any_active_membership() from public;
revoke all on function private.is_active_store_member(uuid) from public;
revoke all on function private.has_store_permission(uuid, text) from public;
revoke all on function private.can_view_profile(uuid) from public;

grant usage on schema private to authenticated, service_role;
grant execute on function private.has_any_active_membership() to authenticated;
grant execute on function private.is_active_store_member(uuid) to authenticated;
grant execute on function private.has_store_permission(uuid, text) to authenticated;
grant execute on function private.can_view_profile(uuid) to authenticated;

alter table public.stores enable row level security;
alter table public.stores force row level security;
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.roles enable row level security;
alter table public.roles force row level security;
alter table public.permissions enable row level security;
alter table public.permissions force row level security;
alter table public.role_permissions enable row level security;
alter table public.role_permissions force row level security;
alter table public.store_memberships enable row level security;
alter table public.store_memberships force row level security;
alter table public.membership_permission_overrides enable row level security;
alter table public.membership_permission_overrides force row level security;
alter table public.staff_invitations enable row level security;
alter table public.staff_invitations force row level security;
alter table public.audit_events enable row level security;
alter table public.audit_events force row level security;

create policy stores_select_active_members
on public.stores
for select
to authenticated
using (private.is_active_store_member(id));

create policy profiles_select_self_or_managed_store
on public.profiles
for select
to authenticated
using (private.can_view_profile(id));

create policy profiles_update_self
on public.profiles
for update
to authenticated
using (id = auth.uid() and status = 'active')
with check (id = auth.uid() and status = 'active');

create policy roles_select_active_members
on public.roles
for select
to authenticated
using (private.has_any_active_membership());

create policy permissions_select_active_members
on public.permissions
for select
to authenticated
using (private.has_any_active_membership());

create policy role_permissions_select_active_members
on public.role_permissions
for select
to authenticated
using (private.has_any_active_membership());

create policy memberships_select_self_or_access_managers
on public.store_memberships
for select
to authenticated
using (
  user_id = auth.uid()
  or private.has_store_permission(store_id, 'manage_employee_access')
);

create policy permission_overrides_select_self_or_access_managers
on public.membership_permission_overrides
for select
to authenticated
using (
  exists (
    select 1
    from public.store_memberships membership
    where membership.id = membership_id
      and (
        membership.user_id = auth.uid()
        or private.has_store_permission(membership.store_id, 'manage_employee_access')
      )
  )
);

create policy staff_invitations_select_access_managers
on public.staff_invitations
for select
to authenticated
using (private.has_store_permission(store_id, 'manage_employee_access'));

create policy audit_events_select_authorized_managers
on public.audit_events
for select
to authenticated
using (
  store_id is not null
  and private.has_store_permission(store_id, 'view_audit_events')
);

revoke all on table public.stores from anon, authenticated;
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.roles from anon, authenticated;
revoke all on table public.permissions from anon, authenticated;
revoke all on table public.role_permissions from anon, authenticated;
revoke all on table public.store_memberships from anon, authenticated;
revoke all on table public.membership_permission_overrides from anon, authenticated;
revoke all on table public.staff_invitations from anon, authenticated;
revoke all on table public.audit_events from anon, authenticated;

grant select on table public.stores to authenticated;
grant select on table public.profiles to authenticated;
grant update (display_name, phone) on table public.profiles to authenticated;
grant select on table public.roles to authenticated;
grant select on table public.permissions to authenticated;
grant select on table public.role_permissions to authenticated;
grant select on table public.store_memberships to authenticated;
grant select on table public.membership_permission_overrides to authenticated;
grant select on table public.staff_invitations to authenticated;
grant select on table public.audit_events to authenticated;

revoke all on table public.stores from service_role;
revoke all on table public.profiles from service_role;
revoke all on table public.roles from service_role;
revoke all on table public.permissions from service_role;
revoke all on table public.role_permissions from service_role;
revoke all on table public.store_memberships from service_role;
revoke all on table public.membership_permission_overrides from service_role;
revoke all on table public.staff_invitations from service_role;
revoke all on table public.audit_events from service_role;

grant select, insert, update on table public.stores to service_role;
grant select, insert, update on table public.profiles to service_role;
grant select on table public.roles to service_role;
grant select on table public.permissions to service_role;
grant select on table public.role_permissions to service_role;
grant select, insert, update on table public.store_memberships to service_role;
grant select, insert, update, delete on table public.membership_permission_overrides to service_role;
grant select, insert, update on table public.staff_invitations to service_role;
grant select, insert on table public.audit_events to service_role;

comment on table public.stores is 'Retail stores. Currency is restricted to GHS for the initial release.';
comment on table public.profiles is 'Application profile linked one-to-one with Supabase Auth users.';
comment on table public.store_memberships is 'Store-scoped role and access status for an authenticated profile.';
comment on table public.membership_permission_overrides is 'Audited store-membership permission exceptions; an explicit override wins over the role default.';
comment on table public.staff_invitations is 'Application invitation metadata. Supabase Auth remains responsible for secure invite tokens.';
comment on table public.audit_events is 'Append-only foundation for security and business audit events.';
comment on column public.audit_events.event_data is 'Non-secret structured context. Credentials and sensitive provider payloads must not be stored here.';

commit;
