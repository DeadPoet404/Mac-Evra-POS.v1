begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into public.stores (id, code, name)
values ('00000000-0000-4000-8000-000000000004', 'phase4-staff-test', 'Phase 4 Staff Test');

insert into auth.users (id, email, email_confirmed_at)
values
 ('10000000-0000-4000-8000-000000000041', 'phase4.employee@local.test', statement_timestamp()),
 ('10000000-0000-4000-8000-000000000042', 'phase4.manager@local.test', statement_timestamp()),
 ('10000000-0000-4000-8000-000000000043', 'phase4.admin@local.test', statement_timestamp()),
 ('10000000-0000-4000-8000-000000000044', 'phase4.other-admin@local.test', statement_timestamp());

insert into public.store_memberships (id, store_id, user_id, role_id, status, joined_at)
values
 ('20000000-0000-4000-8000-000000000041', '00000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000041', '00000000-0000-4000-8000-000000000101', 'active', statement_timestamp()),
 ('20000000-0000-4000-8000-000000000042', '00000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000042', '00000000-0000-4000-8000-000000000102', 'active', statement_timestamp()),
 ('20000000-0000-4000-8000-000000000043', '00000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000043', '00000000-0000-4000-8000-000000000103', 'active', statement_timestamp()),
 ('20000000-0000-4000-8000-000000000044', '00000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000044', '00000000-0000-4000-8000-000000000103', 'active', statement_timestamp());

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000042', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000042","role":"authenticated"}', true);

select lives_ok(
 $$select public.update_staff_membership(
   '00000000-0000-4000-8000-000000000004',
   '20000000-0000-4000-8000-000000000041',
   null, 'suspended'
 )$$,
 'Manager can suspend an employee in the manager store'
);
select throws_ok(
 $$select public.update_staff_membership(
   '00000000-0000-4000-8000-000000000004',
   '20000000-0000-4000-8000-000000000041',
   'manager', null
 )$$,
 '42501', null,
 'Manager cannot elevate an employee role'
);
select throws_ok(
 $$select public.update_staff_membership(
   '00000000-0000-4000-8000-000000000004',
   '20000000-0000-4000-8000-000000000042',
   null, 'suspended'
 )$$,
 '42501', null,
 'Manager cannot change their own access'
);
select throws_ok(
 $$select public.update_staff_membership(
   '00000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-000000000041',
   null, 'active'
 )$$,
 '42501', null,
 'Manager cannot update a membership outside the selected store'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000043', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000043","role":"authenticated"}', true);
select lives_ok(
 $$select public.update_staff_membership(
   '00000000-0000-4000-8000-000000000004',
   '20000000-0000-4000-8000-000000000041',
   'manager', 'active'
 )$$,
 'Administrator can assign manager role'
);
select throws_ok(
 $select public.update_staff_membership(
   '00000000-0000-4000-8000-000000000004',
   '20000000-0000-4000-8000-000000000043',
   'employee', null
 )$$,
 '42501', null,
 'Administrator cannot modify their own role'
);

reset role;
select is(
 (select count(*)::integer from public.audit_events where action = 'staff.membership_updated'),
 2,
 'Successful staff access changes append audit events'
);

select * from finish();
rollback;
