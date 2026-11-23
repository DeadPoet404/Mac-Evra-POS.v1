begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.stores (id, code, name)
values
  ('00000000-0000-4000-8000-000000000009', 'phase7-trade-a', 'Phase 7 Trade A'),
  ('00000000-0000-4000-8000-000000000010', 'phase7-trade-b', 'Phase 7 Trade B');

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('17000000-0000-4000-8000-000000000001', 'phase7.employee.a@local.test', statement_timestamp(), '{"full_name":"Phase 7 Employee A"}'),
  ('17000000-0000-4000-8000-000000000002', 'phase7.employee.other@local.test', statement_timestamp(), '{"full_name":"Phase 7 Employee Other"}'),
  ('17000000-0000-4000-8000-000000000003', 'phase7.manager.a@local.test', statement_timestamp(), '{"full_name":"Phase 7 Manager A"}'),
  ('17000000-0000-4000-8000-000000000004', 'phase7.reviewer.a@local.test', statement_timestamp(), '{"full_name":"Phase 7 Reviewer A"}'),
  ('17000000-0000-4000-8000-000000000005', 'phase7.manager.b@local.test', statement_timestamp(), '{"full_name":"Phase 7 Manager B"}'),
  ('17000000-0000-4000-8000-000000000006', 'phase7.manager.other.a@local.test', statement_timestamp(), '{"full_name":"Phase 7 Manager Other A"}');

insert into public.store_memberships (id, store_id, user_id, role_id, status, joined_at)
values
  ('27000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000009', '17000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', 'active', statement_timestamp()),
  ('27000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000009', '17000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000101', 'active', statement_timestamp()),
  ('27000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000009', '17000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000102', 'active', statement_timestamp()),
  ('27000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000009', '17000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000102', 'active', statement_timestamp()),
  ('27000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000010', '17000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000102', 'active', statement_timestamp()),
  ('27000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000009', '17000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000102', 'active', statement_timestamp());

insert into public.membership_permission_overrides (
  membership_id, permission_id, allowed, reason, granted_by
)
select
  '27000000-0000-4000-8000-000000000004', permission.id, false,
  'Phase 7 reviewer test denies decisions', '17000000-0000-4000-8000-000000000003'
from public.permissions permission
where permission.code = 'approve_trade_ins';

set constraints all immediate;
set constraints all deferred;

select has_table('public', 'trade_in_requests', 'Phase 7 creates persistent trade-in requests');
select has_column('public', 'store_inventory', 'trade_in_request_id', 'Inventory can retain trade-in acquisition provenance');
select col_type_is('public', 'trade_in_requests', 'proposed_offer_pesewas', 'bigint', 'Proposed offer uses integer pesewas');
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.trade_in_requests'::regclass),
  'Trade-in RLS is enabled and forced'
);
select ok(
  (select indisunique from pg_index where indexrelid = 'public.store_inventory_trade_in_request_unique'::regclass),
  'At most one inventory row can originate from one trade-in request'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"17000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$insert into public.trade_in_requests (request_number,store_id,requested_by_user_id,requested_by_membership_id,requested_by_display_name)
    values ('TI-20261123-AAAAAAAA','00000000-0000-4000-8000-000000000009','17000000-0000-4000-8000-000000000001','27000000-0000-4000-8000-000000000001','Bypass')$$,
  '42501', null,
  'Authenticated employees cannot bypass trade-in RPCs with a direct insert'
);
select is(
  (select result from public.create_trade_in_draft('00000000-0000-4000-8000-000000000009')),
  'created',
  'An authorized employee creates a persisted draft'
);
select is(
  (select result from public.create_trade_in_draft('00000000-0000-4000-8000-000000000009')),
  'resumed',
  'Starting again resumes the employee own draft'
);
select is((select count(*)::integer from public.trade_in_requests), 1, 'Only one employee draft exists after a retry');
select set_config('test.phase7_primary', (select id::text from public.trade_in_requests limit 1), true);
select is(
  public.save_trade_in_customer(current_setting('test.phase7_primary')::uuid, 'Ama Trade', '024 123 4567', 'AMA@EXAMPLE.COM'),
  2,
  'Customer details persist and advance draft progress'
);
select throws_ok(
  $$select public.save_trade_in_device(current_setting('test.phase7_primary')::uuid, 'Apple', 'iPhone 13', 128, 'Blue', 'imei', '490154203237519')$$,
  '22023', 'valid 15-digit Luhn IMEI required',
  'Invalid Luhn IMEIs are rejected'
);
select is(
  public.save_trade_in_device(current_setting('test.phase7_primary')::uuid, 'Apple', 'iPhone 13', 128, 'Blue', 'imei', '490154203237518'),
  3,
  'A valid IMEI device persists and advances progress'
);
select is(
  public.save_trade_in_inspection(
    current_setting('test.phase7_primary')::uuid,
    'unknown', 'not_tested', 'unknown', null,
    'not_tested', 'unknown', 'not_tested', 'not_applicable',
    'unknown', 'not_tested', 'Requires manager review'
  ),
  4,
  'Structured inspection explicitly persists unknown and not-tested values'
);
select is(
  public.submit_trade_in_request(current_setting('test.phase7_primary')::uuid, 210050, 'Non-final employee proposal'),
  'pending',
  'A complete draft submits for manager review'
);
select is((select status from public.trade_in_requests where id = current_setting('test.phase7_primary')::uuid), 'pending', 'Employee sees persisted pending status');
select throws_ok(
  $$update public.trade_in_requests set customer_full_name = 'Bypass' where id = current_setting('test.phase7_primary')::uuid$$,
  '42501', null,
  'Employees cannot directly rewrite a submitted request'
);

reset role;
select is(
  (select count(*)::integer from public.audit_events where entity_id = current_setting('test.phase7_primary')::uuid and action = 'trade_in.submitted'),
  1,
  'Submission appends one attributed audit event'
);
select throws_ok(
  $$update public.trade_in_requests set customer_full_name = 'Rewritten Name' where id = current_setting('test.phase7_primary')::uuid$$,
  'P0001', 'submitted trade-in request details are immutable',
  'Submitted customer, device, inspection and offer snapshots are immutable'
);

-- Another same-store employee cannot inspect or modify the request.
set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"17000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*)::integer from public.trade_in_requests), 0, 'Employees cannot read another employee trade-in');
select throws_ok(
  $$select public.save_trade_in_customer(current_setting('test.phase7_primary')::uuid, 'Other Person', '0240000000', null)$$,
  '42501', 'only the request owner can update this trade-in',
  'Same-store employees cannot target another employee draft or request'
);

-- A reviewer can see submitted requests but a denied effective approval permission is enforced by the RPC.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"17000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is((select count(*)::integer from public.trade_in_requests where status = 'pending'), 1, 'Review permission exposes the submitted same-store queue');
select throws_ok(
  $$select public.decide_trade_in_request(current_setting('test.phase7_primary')::uuid, 'approved', 'Reviewer lacks effective decision authority')$$,
  '42501', 'active store permission required',
  'Effective approve_trade_ins permission is required for a decision'
);

-- Cross-store managers cannot discover or decide a known request identifier.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claims', '{"sub":"17000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select is((select count(*)::integer from public.trade_in_requests), 0, 'RLS hides another store trade-in queue');
select throws_ok(
  $$select public.decide_trade_in_request(current_setting('test.phase7_primary')::uuid, 'approved', 'Cross-store decision must be rejected')$$,
  '42501', 'active store permission required',
  'Known identifiers do not permit cross-store decisions'
);

-- An authorized different manager decides once; approval itself never creates inventory.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"17000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$select public.decide_trade_in_request(current_setting('test.phase7_primary')::uuid, 'approved', 'short')$$,
  '22023', 'decision note must contain between 10 and 1000 characters',
  'A meaningful manager decision note is required'
);
select is(
  public.decide_trade_in_request(current_setting('test.phase7_primary')::uuid, 'approved', 'Approved proposal after review of the recorded inspection'),
  'approved',
  'An authorized different manager approves a pending request'
);
select is((select count(*)::integer from public.store_inventory), 0, 'Approval alone leaves physical inventory untouched');
select throws_ok(
  $$select public.decide_trade_in_request(current_setting('test.phase7_primary')::uuid, 'declined', 'A second decision must never overwrite the first')$$,
  '23514', 'only a pending trade-in can receive a decision',
  'Duplicate and non-pending decisions are rejected'
);

reset role;
select is(
  (select count(*)::integer from public.audit_events where entity_id = current_setting('test.phase7_primary')::uuid and action = 'trade_in.approved'),
  1,
  'Approval appends exactly one attributed audit event'
);
select is((select decided_by_user_id from public.trade_in_requests where id = current_setting('test.phase7_primary')::uuid), '17000000-0000-4000-8000-000000000003'::uuid, 'Approver identity is persisted from trusted auth context');

set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"17000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.intake_approved_trade_in(current_setting('test.phase7_primary')::uuid, 300000, true, true, 'Employee cannot perform physical inventory intake')$$,
  '42501', 'active store permission required',
  'Physical intake requires effective manage_inventory permission'
);

-- A manager-owned submitted request cannot be self-decided.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"17000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select result from public.create_trade_in_draft('00000000-0000-4000-8000-000000000009')), 'created', 'Manager can use existing employee trade-in permission to create a request');
select set_config('test.phase7_self', (select id::text from public.trade_in_requests where requested_by_user_id = '17000000-0000-4000-8000-000000000003' and status = 'draft'), true);
select is(public.save_trade_in_customer(current_setting('test.phase7_self')::uuid, 'Self Customer', '024 888 0000', null), 2, 'Save self-approval customer fixture');
select is(public.save_trade_in_device(current_setting('test.phase7_self')::uuid, 'Apple', 'iPhone 12', 64, 'Black', 'imei', '358240051111110'), 3, 'Save self-approval device fixture');
select is(public.save_trade_in_inspection(current_setting('test.phase7_self')::uuid, 'good', 'pass', 'pass', 85, 'pass', 'pass', 'pass', 'pass', 'pass', 'pass', null), 4, 'Save self-approval inspection fixture');
select is(public.submit_trade_in_request(current_setting('test.phase7_self')::uuid, 100000, null), 'pending', 'Submit self-approval fixture');
select throws_ok(
  $$select public.decide_trade_in_request(current_setting('test.phase7_self')::uuid, 'approved', 'Self approval is forbidden by separation of duties')$$,
  '42501', 'requesters cannot approve or decline their own trade-in',
  'Managers cannot decide their own submitted requests'
);
select is((select status from public.trade_in_requests where id = current_setting('test.phase7_self')::uuid), 'pending', 'Rejected self-approval preserves pending status');

-- Build an eligible employee request, then approve and physically intake it.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"17000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select result from public.create_trade_in_draft('00000000-0000-4000-8000-000000000009')), 'created', 'Create eligible intake draft');
select set_config('test.phase7_intake', (select id::text from public.trade_in_requests where requested_by_user_id = '17000000-0000-4000-8000-000000000002' and status = 'draft'), true);
select is(public.save_trade_in_customer(current_setting('test.phase7_intake')::uuid, 'Kojo Intake', '020 111 2222', 'kojo@example.com'), 2, 'Save eligible customer');
select is(public.save_trade_in_device(current_setting('test.phase7_intake')::uuid, 'Apple', 'iPhone 14', 256, 'Purple', 'imei', '358240051111128'), 3, 'Save eligible valid IMEI');
select is(public.save_trade_in_inspection(current_setting('test.phase7_intake')::uuid, 'good', 'pass', 'pass', 91, 'pass', 'pass', 'pass', 'not_applicable', 'pass', 'pass', 'All physical checks passed'), 4, 'Save intake-eligible inspection');
select is(public.submit_trade_in_request(current_setting('test.phase7_intake')::uuid, 250000, 'Proposed after complete inspection'), 'pending', 'Submit eligible request');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"17000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is(public.decide_trade_in_request(current_setting('test.phase7_intake')::uuid, 'approved', 'Approved after complete passing inspection review'), 'approved', 'Approve eligible request without inventory intake');

-- Force a late audit failure after device, inventory, movement and request writes;
-- the RPC statement must roll every one of those changes back.
reset role;
create or replace function public.phase7_force_intake_audit_failure()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.action = 'trade_in.physically_intaken' then
    raise exception 'forced Phase 7 intake audit failure';
  end if;
  return new;
end;
$$;
create trigger phase7_force_intake_audit_failure
before insert on public.audit_events
for each row execute function public.phase7_force_intake_audit_failure();
set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"17000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.intake_approved_trade_in(current_setting('test.phase7_intake')::uuid, 320000, true, true, 'Exact IMEI and passing condition physically reconfirmed')$$,
  'P0001', 'forced Phase 7 intake audit failure',
  'A late intake failure rolls back the whole physical inventory transaction'
);
reset role;
select is((select count(*)::integer from public.inventory_devices where imei = '358240051111128'), 0, 'Late failure rolls back the new physical device');
select is((select count(*)::integer from public.store_inventory where trade_in_request_id = current_setting('test.phase7_intake')::uuid), 0, 'Late failure rolls back the store inventory row');
select is((select count(*)::integer from public.inventory_movements where metadata->>'trade_in_request_id' = current_setting('test.phase7_intake')), 0, 'Late failure rolls back the inventory movement');
select is((select status from public.trade_in_requests where id = current_setting('test.phase7_intake')::uuid), 'approved', 'Late failure restores the approved request state');
drop trigger phase7_force_intake_audit_failure on public.audit_events;
drop function public.phase7_force_intake_audit_failure();

set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"17000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.intake_approved_trade_in(current_setting('test.phase7_intake')::uuid, 320000, false, true, 'Identity was not physically confirmed')$$,
  '22023', 'physical identity and condition confirmations are required',
  'Physical identity confirmation is mandatory'
);
select is((select count(*)::integer from public.store_inventory), 0, 'Failed physical confirmation creates no inventory');
select is(
  (select request_status from public.intake_approved_trade_in(current_setting('test.phase7_intake')::uuid, 320000, true, true, 'Exact IMEI and passing condition physically reconfirmed')),
  'intaken',
  'Separate physical receipt enters an eligible approved device into inventory'
);
select is((select status from public.trade_in_requests where id = current_setting('test.phase7_intake')::uuid), 'intaken', 'Trade-in records the physical intake state');
reset role;
select is((select status from public.store_inventory where trade_in_request_id = current_setting('test.phase7_intake')::uuid), 'available', 'Physically intaken device starts in existing available inventory lifecycle');
select is((select acquisition_source from public.store_inventory where trade_in_request_id = current_setting('test.phase7_intake')::uuid), 'trade_in', 'Inventory records trade-in acquisition provenance');
select is((select cost_pesewas from public.store_inventory where trade_in_request_id = current_setting('test.phase7_intake')::uuid), 250000::bigint, 'Trusted approved proposal becomes restricted acquisition cost');
select is((select price_pesewas from public.store_inventory where trade_in_request_id = current_setting('test.phase7_intake')::uuid), 320000::bigint, 'Physical intake stores the manager-entered selling price in pesewas');
set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"17000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.intake_approved_trade_in(current_setting('test.phase7_intake')::uuid, 320000, true, true, 'A duplicate physical intake must be rejected')$$,
  '23514', 'only an approved trade-in can be physically intaken',
  'Duplicate physical intake is rejected'
);

reset role;
select is((select count(*)::integer from public.inventory_movements where metadata->>'trade_in_request_id' = current_setting('test.phase7_intake')), 1, 'Physical intake appends one attributed inventory movement');
select is((select count(*)::integer from public.audit_events where entity_id = current_setting('test.phase7_intake')::uuid and action = 'trade_in.physically_intaken'), 1, 'Physical intake appends one attributed trade-in audit event');
select is((select count(*)::integer from public.audit_events where action = 'inventory.trade_in_intake' and event_data->>'trade_in_request_id' = current_setting('test.phase7_intake')), 1, 'Physical intake appends inventory audit provenance');

-- Employees can see available stock but acquisition cost remains unavailable.
set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"17000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*)::integer from public.store_inventory where status = 'available'), 1, 'Employee existing inventory visibility includes physically received stock');
select throws_ok(
  $$select cost_pesewas from public.store_inventory limit 1$$,
  '42501', null,
  'Trade-in acquisition cost remains hidden from normal employees'
);

-- Serial-only requests are supported through approval but never fabricate an inventory IMEI.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"17000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select result from public.create_trade_in_draft('00000000-0000-4000-8000-000000000009')), 'created', 'Create serial-only draft');
select set_config('test.phase7_serial', (select id::text from public.trade_in_requests where requested_by_user_id = '17000000-0000-4000-8000-000000000001' and status = 'draft'), true);
select is(public.save_trade_in_customer(current_setting('test.phase7_serial')::uuid, 'Serial Customer', '055 999 0000', null), 2, 'Save serial customer');
select is(public.save_trade_in_device(current_setting('test.phase7_serial')::uuid, 'Apple', 'WiFi Tablet', 128, 'Silver', 'serial', ' sn-abc-123 '), 3, 'Supported serial identity is normalized and saved without an IMEI');
select is(public.save_trade_in_inspection(current_setting('test.phase7_serial')::uuid, 'good', 'pass', 'pass', 90, 'pass', 'pass', 'pass', 'not_applicable', 'pass', 'pass', null), 4, 'Save serial device inspection');
select is(public.submit_trade_in_request(current_setting('test.phase7_serial')::uuid, 150000, null), 'pending', 'Submit serial-only request');
select is((select serial_number from public.trade_in_requests where id = current_setting('test.phase7_serial')::uuid), 'SN-ABC-123', 'Serial is normalized without inventing an IMEI');
select is((select imei from public.trade_in_requests where id = current_setting('test.phase7_serial')::uuid), null::text, 'Serial-only request retains a null IMEI');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"17000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is(public.decide_trade_in_request(current_setting('test.phase7_serial')::uuid, 'approved', 'Serial identity approved for request workflow only'), 'approved', 'Manager can approve a serial-identity request');
select throws_ok(
  $$select * from public.intake_approved_trade_in(current_setting('test.phase7_serial')::uuid, 200000, true, true, 'Serial device physically presented without IMEI')$$,
  '23514', 'existing inventory requires a confirmed valid IMEI; serial-only devices remain outside inventory',
  'Serial-only request cannot fabricate an IMEI for existing sellable inventory'
);
select is((select count(*)::integer from public.store_inventory), 1, 'Rejected serial intake leaves all inventory unchanged');

-- Decline is terminal, audited, and also leaves inventory unchanged.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000006', true);
select set_config('request.jwt.claims', '{"sub":"17000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
select is(public.decide_trade_in_request(current_setting('test.phase7_self')::uuid, 'declined', 'Declined by a different authorized manager after review'), 'declined', 'A different manager can decline the manager-owned pending request');
select is((select count(*)::integer from public.store_inventory), 1, 'Decline leaves inventory untouched');

reset role;
select is((select count(*)::integer from public.audit_events where entity_id = current_setting('test.phase7_self')::uuid and action = 'trade_in.declined'), 1, 'Decline appends one attributed audit event');
select throws_ok(
  $$update public.trade_in_requests set decision_note = 'Decision rewritten after the fact' where id = current_setting('test.phase7_self')::uuid$$,
  'P0001', 'trade-in decision history is immutable',
  'Persisted decisions cannot be rewritten'
);

select * from finish();
rollback;
