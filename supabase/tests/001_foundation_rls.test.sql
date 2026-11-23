begin;

create extension if not exists pgtap with schema extensions;
select plan(21);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('10000000-0000-4000-8000-000000000001', 'employee@local.test', '{"full_name":"Local Employee"}'::jsonb),
  ('10000000-0000-4000-8000-000000000002', 'manager@local.test', '{"full_name":"Local Manager"}'::jsonb);

select is(
  (select count(*)::integer from public.profiles where id in (
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002'
  )),
  2,
  'Auth inserts create application profiles'
);

insert into public.store_memberships (id, store_id, user_id, role_id, status, joined_at)
values
  (
    '20000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000101',
    'active',
    statement_timestamp()
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000102',
    'active',
    statement_timestamp()
  );

insert into public.staff_invitations (
  id,
  store_id,
  email,
  role_id,
  status,
  invited_by,
  expires_at
)
values (
  '30000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  'invitee@local.test',
  '00000000-0000-4000-8000-000000000101',
  'pending',
  '10000000-0000-4000-8000-000000000002',
  statement_timestamp() + interval '1 day'
);

insert into public.audit_events (
  id,
  store_id,
  actor_user_id,
  actor_membership_id,
  action,
  entity_type,
  entity_id,
  event_data
)
values (
  '40000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000002',
  'foundation.test',
  'store',
  '00000000-0000-4000-8000-000000000001',
  '{"source":"pgTAP"}'::jsonb
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is((select count(*)::integer from public.stores), 1, 'Employee can read their active store');
select is((select count(*)::integer from public.profiles), 1, 'Employee can read only their own profile');
select is((select count(*)::integer from public.store_memberships), 1, 'Employee can read only their own membership');
select is((select count(*)::integer from public.staff_invitations), 0, 'Employee cannot read staff invitations');
select is((select count(*)::integer from public.audit_events), 0, 'Employee cannot read audit events');
select ok(
  private.has_store_permission('00000000-0000-4000-8000-000000000001', 'create_sales'),
  'Employee receives the create_sales role permission'
);
select ok(
  not private.has_store_permission('00000000-0000-4000-8000-000000000001', 'manage_employee_access'),
  'Employee does not receive manager access permissions'
);
select throws_ok(
  $$insert into public.stores (code, name) values ('forbidden-store', 'Forbidden Store')$$,
  '42501',
  null,
  'Employee cannot create a store directly'
);
select lives_ok(
  $$update public.profiles set display_name = 'Updated Employee' where id = '10000000-0000-4000-8000-000000000001'$$,
  'Employee can update the allowed fields on their own profile'
);
select throws_ok(
  $$update public.profiles set status = 'suspended' where id = '10000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'Employee cannot update protected profile fields'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is((select count(*)::integer from public.profiles), 2, 'Manager can read profiles in the managed store');
select is((select count(*)::integer from public.staff_invitations), 1, 'Manager can read store invitations');
select is((select count(*)::integer from public.audit_events), 1, 'Manager can read store audit events');
select ok(
  private.has_store_permission('00000000-0000-4000-8000-000000000001', 'manage_employee_access'),
  'Manager receives employee-access management permission'
);
select throws_ok(
  $$update public.store_memberships set status = 'inactive' where user_id = '10000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'Manager cannot bypass trusted server operations with a direct membership update'
);

reset role;
insert into public.membership_permission_overrides (
  membership_id,
  permission_id,
  allowed,
  reason,
  granted_by
)
select
  '20000000-0000-4000-8000-000000000002',
  id,
  false,
  'Local RLS override test',
  '10000000-0000-4000-8000-000000000002'
from public.permissions
where code = 'view_audit_events';

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select ok(
  not private.has_store_permission('00000000-0000-4000-8000-000000000001', 'view_audit_events'),
  'An explicit permission override wins over the role default'
);
select is((select count(*)::integer from public.audit_events), 0, 'Denied audit permission is enforced by RLS');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$select count(*) from public.stores$$,
  '42501',
  null,
  'Anonymous clients have no store table privileges'
);

reset role;
select throws_ok(
  $$update public.audit_events set event_data = '{"changed":true}'::jsonb where id = '40000000-0000-4000-8000-000000000001'$$,
  'P0001',
  'audit events are append-only',
  'Audit events cannot be updated even by a privileged application path'
);
select throws_ok(
  $$delete from public.audit_events where id = '40000000-0000-4000-8000-000000000001'$$,
  'P0001',
  'audit events are append-only',
  'Audit events cannot be deleted even by a privileged application path'
);

select * from finish();
rollback;
