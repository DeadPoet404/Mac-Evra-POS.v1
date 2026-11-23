begin;

create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('10000000-0000-4000-8000-000000000031', 'phase3.employee@local.test', '{"full_name":"Phase 3 Employee"}'::jsonb),
  ('10000000-0000-4000-8000-000000000032', 'phase3.manager@local.test', '{"full_name":"Phase 3 Manager"}'::jsonb),
  ('10000000-0000-4000-8000-000000000033', 'phase3.admin@local.test', '{"full_name":"Phase 3 Administrator"}'::jsonb),
  ('10000000-0000-4000-8000-000000000034', 'new.employee@local.test', '{"full_name":"New Employee"}'::jsonb),
  ('10000000-0000-4000-8000-000000000035', 'expired.employee@local.test', '{"full_name":"Expired Employee"}'::jsonb),
  ('10000000-0000-4000-8000-000000000036', 'suspended.manager@local.test', '{"full_name":"Suspended Manager"}'::jsonb);

insert into public.store_memberships (id, store_id, user_id, role_id, status, joined_at)
values
  ('20000000-0000-4000-8000-000000000031', '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000031', '00000000-0000-4000-8000-000000000101', 'active', statement_timestamp()),
  ('20000000-0000-4000-8000-000000000032', '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000032', '00000000-0000-4000-8000-000000000102', 'active', statement_timestamp()),
  ('20000000-0000-4000-8000-000000000033', '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000033', '00000000-0000-4000-8000-000000000103', 'active', statement_timestamp()),
  ('20000000-0000-4000-8000-000000000036', '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000036', '00000000-0000-4000-8000-000000000102', 'suspended', statement_timestamp());

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000032', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000032","role":"authenticated"}', true);

select ok(
  private.has_store_permission('00000000-0000-4000-8000-000000000001', 'manage_employee_access'),
  'Manager has trusted staff-access permission'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000031', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000031","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.prepare_staff_invitation(
    '00000000-0000-4000-8000-000000000001',
    'forbidden@local.test',
    '00000000-0000-4000-8000-000000000101',
    72
  )$$,
  '42501',
  null,
  'Employee cannot prepare a staff invitation'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000032', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000032","role":"authenticated"}', true);
select is(
  (select result from public.prepare_staff_invitation(
    '00000000-0000-4000-8000-000000000001',
    '  New.Employee@Local.Test  ',
    '00000000-0000-4000-8000-000000000101',
    72
  )),
  'prepared',
  'Manager can prepare an employee invitation'
);
select is(
  (select email from public.staff_invitations where email = 'new.employee@local.test'),
  'new.employee@local.test',
  'Invitation email is normalized by trusted database code'
);
select is(
  (select result from public.prepare_staff_invitation(
    '00000000-0000-4000-8000-000000000001',
    'new.employee@local.test',
    '00000000-0000-4000-8000-000000000101',
    72
  )),
  'existing',
  'Preparing the same invitation is idempotent'
);
select throws_ok(
  $$select * from public.prepare_staff_invitation(
    '00000000-0000-4000-8000-000000000001',
    'elevated@local.test',
    '00000000-0000-4000-8000-000000000102',
    72
  )$$,
  '42501',
  null,
  'Manager cannot assign an elevated role without manage_roles'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000033', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000033","role":"authenticated"}', true);
select is(
  (select result from public.prepare_staff_invitation(
    '00000000-0000-4000-8000-000000000001',
    'elevated@local.test',
    '00000000-0000-4000-8000-000000000102',
    72
  )),
  'prepared',
  'Administrator can prepare an elevated-role invitation'
);
select throws_ok(
  $$insert into public.staff_invitations (
    store_id, email, role_id, invited_by, expires_at
  ) values (
    '00000000-0000-4000-8000-000000000001',
    'direct@local.test',
    '00000000-0000-4000-8000-000000000101',
    '10000000-0000-4000-8000-000000000033',
    statement_timestamp() + interval '1 day'
  )$$,
  '42501',
  null,
  'Authenticated clients cannot insert invitation rows directly'
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$select * from public.accept_staff_invitations()$$,
  '42501',
  null,
  'Anonymous clients cannot execute invitation acceptance'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000034', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000034","role":"authenticated"}', true);
select is(
  (select count(*)::integer from public.accept_staff_invitations()),
  1,
  'Invitee accepts the invitation matched to their Auth email'
);
select is(
  (select count(*)::integer
   from public.store_memberships
   where user_id = '10000000-0000-4000-8000-000000000034'
     and store_id = '00000000-0000-4000-8000-000000000001'
     and role_id = '00000000-0000-4000-8000-000000000101'
     and status = 'active'),
  1,
  'Invitation acceptance activates only the invited role and store'
);
reset role;
select is(
  (select status from public.staff_invitations where email = 'new.employee@local.test'),
  'accepted',
  'Accepted invitation lifecycle is preserved'
);
select is(
  (select count(*)::integer from public.audit_events where action = 'staff.invitation_accepted'),
  1,
  'Invitation acceptance appends an audit event'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000036', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000036","role":"authenticated"}', true);
select ok(
  not private.has_store_permission('00000000-0000-4000-8000-000000000001', 'manage_employee_access'),
  'Suspended membership immediately loses manager permission'
);

reset role;
insert into public.staff_invitations (
  id, store_id, email, role_id, status, invited_by, created_at, expires_at
)
values (
  '30000000-0000-4000-8000-000000000035',
  '00000000-0000-4000-8000-000000000001',
  'expired.employee@local.test',
  '00000000-0000-4000-8000-000000000101',
  'pending',
  '10000000-0000-4000-8000-000000000032',
  statement_timestamp() - interval '2 days',
  statement_timestamp() - interval '1 day'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000035', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000035","role":"authenticated"}', true);
select is(
  (select count(*)::integer from public.accept_staff_invitations()),
  0,
  'Expired invitation cannot create a membership'
);
reset role;
select is(
  (select status from public.staff_invitations where id = '30000000-0000-4000-8000-000000000035'),
  'expired',
  'Expired invitation is marked without being accepted'
);

select is(
  (select count(*)::integer
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('prepare_staff_invitation', 'accept_staff_invitations')
     and p.prosecdef),
  2,
  'Both invitation functions are security definer functions'
);
select is(
  (select count(*)::integer
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('prepare_staff_invitation', 'accept_staff_invitations')
     and p.proconfig = array['search_path=""']::text[]),
  2,
  'Both invitation functions use a fixed empty search path'
);

select * from finish();
rollback;
