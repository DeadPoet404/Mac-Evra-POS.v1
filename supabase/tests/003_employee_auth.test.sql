begin;

create extension if not exists pgtap with schema extensions;
select plan(32);

insert into public.stores (id, code, name, status)
values
  ('00000000-0000-4000-8000-000000000002', 'phase3-second-store', 'Phase 3 Second Store', 'active'),
  ('00000000-0000-4000-8000-000000000003', 'phase3-inactive-store', 'Phase 3 Inactive Store', 'active');

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('10000000-0000-4000-8000-000000000031', 'phase3.employee@local.test', statement_timestamp(), '{"full_name":"Phase 3 Employee"}'::jsonb),
  ('10000000-0000-4000-8000-000000000032', 'phase3.manager@local.test', statement_timestamp(), '{"full_name":"Phase 3 Manager"}'::jsonb),
  ('10000000-0000-4000-8000-000000000033', 'phase3.admin@local.test', statement_timestamp(), '{"full_name":"Phase 3 Administrator"}'::jsonb),
  ('10000000-0000-4000-8000-000000000034', 'new.employee@local.test', statement_timestamp(), '{"full_name":"New Employee"}'::jsonb),
  ('10000000-0000-4000-8000-000000000035', 'expired.employee@local.test', statement_timestamp(), '{"full_name":"Expired Employee"}'::jsonb),
  ('10000000-0000-4000-8000-000000000036', 'suspended.manager@local.test', statement_timestamp(), '{"full_name":"Suspended Manager"}'::jsonb),
  ('10000000-0000-4000-8000-000000000037', 'unverified.employee@local.test', null, '{"full_name":"Unverified Employee"}'::jsonb),
  ('10000000-0000-4000-8000-000000000039', 'inactive-store.employee@local.test', statement_timestamp(), '{"full_name":"Inactive Store Employee"}'::jsonb);

insert into public.store_memberships (id, store_id, user_id, role_id, status, joined_at)
values
  ('20000000-0000-4000-8000-000000000031', '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000031', '00000000-0000-4000-8000-000000000101', 'active', statement_timestamp()),
  ('20000000-0000-4000-8000-000000000032', '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000032', '00000000-0000-4000-8000-000000000102', 'active', statement_timestamp()),
  ('20000000-0000-4000-8000-000000000042', '00000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000032', '00000000-0000-4000-8000-000000000102', 'active', statement_timestamp()),
  ('20000000-0000-4000-8000-000000000043', '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000032', '00000000-0000-4000-8000-000000000102', 'active', statement_timestamp()),
  ('20000000-0000-4000-8000-000000000033', '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000033', '00000000-0000-4000-8000-000000000103', 'active', statement_timestamp()),
  ('20000000-0000-4000-8000-000000000036', '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000036', '00000000-0000-4000-8000-000000000102', 'suspended', statement_timestamp());

create temporary table invitation_results (
  label text primary key,
  result text not null,
  invitation_id uuid not null,
  email text not null,
  expires_at timestamptz not null,
  acceptance_token text not null,
  attempt_id uuid not null
) on commit drop;
grant select, insert on table invitation_results to authenticated;

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
insert into invitation_results
select 'first', prepared.*
from public.prepare_staff_invitation(
  '00000000-0000-4000-8000-000000000001',
  '  New.Employee@Local.Test  ',
  '00000000-0000-4000-8000-000000000101',
  72
) prepared;
select is((select result from invitation_results where label = 'first'), 'prepared', 'Manager prepares an employee invitation');
select is((select email from invitation_results where label = 'first'), 'new.employee@local.test', 'Invitation email is normalized');

insert into invitation_results
select 'retry', prepared.*
from public.prepare_staff_invitation(
  '00000000-0000-4000-8000-000000000001',
  'new.employee@local.test',
  '00000000-0000-4000-8000-000000000101',
  72
) prepared;
select is((select result from invitation_results where label = 'retry'), 'reprepared', 'Repeated preparation is identified as a new attempt');
select is(
  (select invitation_id from invitation_results where label = 'retry'),
  (select invitation_id from invitation_results where label = 'first'),
  'Repeated preparation retains the invitation identity'
);
select isnt(
  (select acceptance_token from invitation_results where label = 'retry'),
  (select acceptance_token from invitation_results where label = 'first'),
  'Repeated preparation rotates the acceptance token'
);
reset role;
select is(
  (select count(*)::integer from public.audit_events
   where action = 'staff.invitation_prepared'
     and entity_id = (select invitation_id from invitation_results where label = 'retry')),
  2,
  'Every repeated preparation attempt is audited'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000032', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000032","role":"authenticated"}', true);
select ok(
  public.record_staff_invitation_delivery(
    (select invitation_id from invitation_results where label = 'first'),
    (select attempt_id from invitation_results where label = 'first'),
    'auth_invite',
    'sent'
  ) is not null,
  'First provider delivery result is audited'
);
select ok(
  public.record_staff_invitation_delivery(
    (select invitation_id from invitation_results where label = 'retry'),
    (select attempt_id from invitation_results where label = 'retry'),
    'existing_account_magic_link',
    'sent'
  ) is not null,
  'Repeated provider delivery result is audited'
);
reset role;
select is(
  (select count(*)::integer from public.audit_events
   where action = 'staff.invitation_delivery'
     and entity_id = (select invitation_id from invitation_results where label = 'retry')),
  2,
  'Repeated invitation deliveries have separate audit events'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000032', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000032","role":"authenticated"}', true);
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
  $$select * from public.accept_staff_invitation(
    '30000000-0000-4000-8000-000000000001',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  )$$,
  '42501',
  null,
  'Anonymous clients cannot execute invitation acceptance'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000032', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000032","role":"authenticated"}', true);
insert into invitation_results
select 'second-store', prepared.*
from public.prepare_staff_invitation(
  '00000000-0000-4000-8000-000000000002',
  'new.employee@local.test',
  '00000000-0000-4000-8000-000000000101',
  72
) prepared;
select is((select result from invitation_results where label = 'second-store'), 'prepared', 'The same email can have a distinct invitation for another store');

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000034', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000034","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.accept_staff_invitation(
    (select invitation_id from invitation_results where label = 'retry'),
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
  )$$,
  '42501',
  null,
  'Password-authenticated sessions cannot accept without the email-specific token'
);
select is(
  (select count(*)::integer from public.accept_staff_invitation(
    (select invitation_id from invitation_results where label = 'retry'),
    (select acceptance_token from invitation_results where label = 'retry')
  )),
  1,
  'Verified invitee accepts one specifically linked invitation'
);
select is(
  (select count(*)::integer
   from public.store_memberships
   where user_id = '10000000-0000-4000-8000-000000000034'
     and store_id = '00000000-0000-4000-8000-000000000001'
     and role_id = '00000000-0000-4000-8000-000000000101'
     and status = 'active'),
  1,
  'Specific acceptance activates only its invited role and store'
);
reset role;
select is(
  (select status from public.staff_invitations
   where id = (select invitation_id from invitation_results where label = 'second-store')),
  'pending',
  'A second pending invitation for the same email remains untouched'
);
select is(
  (select count(*)::integer from public.store_memberships
   where user_id = '10000000-0000-4000-8000-000000000034'
     and store_id = '00000000-0000-4000-8000-000000000002'),
  0,
  'Unaccepted store invitation creates no membership'
);
select is(
  (select status from public.staff_invitations
   where id = (select invitation_id from invitation_results where label = 'retry')),
  'accepted',
  'Accepted invitation lifecycle is preserved'
);
select is(
  (select count(*)::integer from public.audit_events
   where action = 'staff.invitation_accepted'
     and entity_id = (select invitation_id from invitation_results where label = 'retry')),
  1,
  'Specific invitation acceptance appends one audit event'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000032', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000032","role":"authenticated"}', true);
insert into invitation_results
select 'unverified', prepared.*
from public.prepare_staff_invitation(
  '00000000-0000-4000-8000-000000000001',
  'unverified.employee@local.test',
  '00000000-0000-4000-8000-000000000101',
  72
) prepared;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000037', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000037","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.accept_staff_invitation(
    (select invitation_id from invitation_results where label = 'unverified'),
    (select acceptance_token from invitation_results where label = 'unverified')
  )$$,
  '42501',
  null,
  'Unverified Auth email cannot accept an invitation'
);
reset role;
select is(
  (select status from public.staff_invitations
   where id = (select invitation_id from invitation_results where label = 'unverified')),
  'pending',
  'Unverified acceptance leaves the invitation pending'
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
  id, store_id, email, role_id, status, invited_by, created_at, expires_at, acceptance_token_hash
)
values (
  '30000000-0000-4000-8000-000000000035',
  '00000000-0000-4000-8000-000000000001',
  'expired.employee@local.test',
  '00000000-0000-4000-8000-000000000101',
  'pending',
  '10000000-0000-4000-8000-000000000032',
  statement_timestamp() - interval '2 days',
  statement_timestamp() - interval '1 day',
  extensions.digest(repeat('e', 64), 'sha256')
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000035', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000035","role":"authenticated"}', true);
select is(
  (select count(*)::integer from public.accept_staff_invitation(
    '30000000-0000-4000-8000-000000000035',
    repeat('e', 64)
  )),
  0,
  'Expired invitation cannot create a membership'
);
reset role;
select is(
  (select status from public.staff_invitations where id = '30000000-0000-4000-8000-000000000035'),
  'expired',
  'Expired invitation is marked without being accepted'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000032', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000032","role":"authenticated"}', true);
insert into invitation_results
select 'inactive-store', prepared.*
from public.prepare_staff_invitation(
  '00000000-0000-4000-8000-000000000003',
  'inactive-store.employee@local.test',
  '00000000-0000-4000-8000-000000000101',
  72
) prepared;
reset role;
update public.stores set status = 'inactive' where id = '00000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000039', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000039","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.accept_staff_invitation(
    (select invitation_id from invitation_results where label = 'inactive-store'),
    (select acceptance_token from invitation_results where label = 'inactive-store')
  )$$,
  '42501',
  null,
  'Inactive store cannot be accepted even with a valid invitation link'
);
reset role;
select is(
  (select status from public.staff_invitations
   where id = (select invitation_id from invitation_results where label = 'inactive-store')),
  'pending',
  'Inactive-store rejection leaves the invitation pending'
);

select is(
  (select count(*)::integer
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('prepare_staff_invitation', 'record_staff_invitation_delivery', 'accept_staff_invitation')
     and p.prosecdef),
  3,
  'All invitation functions are security definer functions'
);
select is(
  (select count(*)::integer
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('prepare_staff_invitation', 'record_staff_invitation_delivery', 'accept_staff_invitation')
     and p.proconfig = array['search_path=""']::text[]),
  3,
  'All invitation functions use a fixed empty search path'
);

select * from finish();
rollback;
