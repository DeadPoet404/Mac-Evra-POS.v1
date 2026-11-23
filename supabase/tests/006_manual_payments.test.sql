begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.stores (id, code, name)
values
  ('00000000-0000-4000-8000-000000000007', 'phase6-payment-a', 'Phase 6 Payment A'),
  ('00000000-0000-4000-8000-000000000008', 'phase6-payment-b', 'Phase 6 Payment B');

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('16000000-0000-4000-8000-000000000001', 'phase6.employee.a@local.test', statement_timestamp(), '{"full_name":"Phase 6 Employee A"}'),
  ('16000000-0000-4000-8000-000000000002', 'phase6.employee.other@local.test', statement_timestamp(), '{"full_name":"Phase 6 Employee Other"}'),
  ('16000000-0000-4000-8000-000000000003', 'phase6.manager.a@local.test', statement_timestamp(), '{"full_name":"Phase 6 Manager A"}'),
  ('16000000-0000-4000-8000-000000000004', 'phase6.employee.b@local.test', statement_timestamp(), '{"full_name":"Phase 6 Employee B"}');

insert into public.store_memberships (id, store_id, user_id, role_id, status, joined_at)
values
  ('26000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000007', '16000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', 'active', statement_timestamp()),
  ('26000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000007', '16000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000101', 'active', statement_timestamp()),
  ('26000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000007', '16000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000102', 'active', statement_timestamp()),
  ('26000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000008', '16000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000101', 'active', statement_timestamp());

insert into public.device_models (id, model_name, storage_gb)
values ('36000000-0000-4000-8000-000000000001', 'Phase 6 iPhone', 256);

insert into public.inventory_devices (id, device_model_id, imei, colour, condition, battery_health)
values
  ('46000000-0000-4000-8000-000000000001', '36000000-0000-4000-8000-000000000001', '358240051112001', 'Black', 'excellent', 99),
  ('46000000-0000-4000-8000-000000000002', '36000000-0000-4000-8000-000000000001', '358240051112019', 'Blue', 'excellent', 98),
  ('46000000-0000-4000-8000-000000000003', '36000000-0000-4000-8000-000000000001', '358240051112027', 'White', 'excellent', 97),
  ('46000000-0000-4000-8000-000000000004', '36000000-0000-4000-8000-000000000001', '358240051112035', 'Green', 'good', 90),
  ('46000000-0000-4000-8000-000000000005', '36000000-0000-4000-8000-000000000001', '358240051112043', 'Pink', 'good', 89),
  ('46000000-0000-4000-8000-000000000006', '36000000-0000-4000-8000-000000000001', '358240051112050', 'Silver', 'excellent', 96),
  ('46000000-0000-4000-8000-000000000007', '36000000-0000-4000-8000-000000000001', '358240051112068', 'Gold', 'excellent', 95),
  ('46000000-0000-4000-8000-000000000008', '36000000-0000-4000-8000-000000000001', '358240051112076', 'Red', 'good', 88);

insert into public.store_inventory (id, store_id, device_id, cost_pesewas, price_pesewas)
values
  ('56000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000007', '46000000-0000-4000-8000-000000000001', 700000, 850000),
  ('56000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000007', '46000000-0000-4000-8000-000000000002', 700000, 850000),
  ('56000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000007', '46000000-0000-4000-8000-000000000003', 700000, 850000),
  ('56000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000007', '46000000-0000-4000-8000-000000000004', 700000, 850000),
  ('56000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000007', '46000000-0000-4000-8000-000000000005', 700000, 850000),
  ('56000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000007', '46000000-0000-4000-8000-000000000006', 700000, 850000),
  ('56000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-000000000007', '46000000-0000-4000-8000-000000000007', 700000, 850000),
  ('56000000-0000-4000-8000-000000000008', '00000000-0000-4000-8000-000000000008', '46000000-0000-4000-8000-000000000008', 700000, 850000);
set constraints all immediate;
set constraints all deferred;

select has_table('public', 'sale_payments', 'Phase 6 creates a payment ledger');
select col_type_is('public', 'sale_payments', 'amount_pesewas', 'bigint', 'Payment uses exact integer pesewas');
select col_is_unique('public', 'sale_payments', 'sale_id', 'Only one payment is permitted per sale');
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.sale_payments'::regclass),
  'Payment RLS is enabled and forced'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"16000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$insert into public.sale_payments (sale_id,store_id,amount_pesewas,payment_method,manually_confirmed_received,confirmed_by_user_id,confirmed_by_membership_id,confirmed_by_display_name,confirmed_at)
    values ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000007',850000,'cash',true,'16000000-0000-4000-8000-000000000001','26000000-0000-4000-8000-000000000001','Bypass',statement_timestamp())$$,
  '42501', null,
  'Authenticated callers cannot bypass the payment RPC with a direct insert'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"16000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- Build six owned one-device drafts for the three successes and the amount,
-- attestation and method rejection cases.
select lives_ok($$select * from public.create_sale_draft('00000000-0000-4000-8000-000000000007')$$, 'Create Mobile Money draft');
select lives_ok($$select * from public.create_sale_draft('00000000-0000-4000-8000-000000000007')$$, 'Create cash draft');
select lives_ok($$select * from public.create_sale_draft('00000000-0000-4000-8000-000000000007')$$, 'Create bank-transfer draft');
select lives_ok($$select * from public.create_sale_draft('00000000-0000-4000-8000-000000000007')$$, 'Create wrong-amount draft');
select lives_ok($$select * from public.create_sale_draft('00000000-0000-4000-8000-000000000007')$$, 'Create no-attestation draft');
select lives_ok($$select * from public.create_sale_draft('00000000-0000-4000-8000-000000000007')$$, 'Create unsupported-method draft');

with ranked as (
  select id, row_number() over (order by created_at, id) as position
  from public.sales
  where created_by_user_id = '16000000-0000-4000-8000-000000000001'
)
select is(
  (select result from public.add_sale_item((select id from ranked where position = 1), '46000000-0000-4000-8000-000000000001')),
  'added', 'Reserve Mobile Money sale device'
);
with ranked as (
  select id, row_number() over (order by created_at, id) as position from public.sales
  where created_by_user_id = '16000000-0000-4000-8000-000000000001'
)
select is((select result from public.add_sale_item((select id from ranked where position = 2), '46000000-0000-4000-8000-000000000002')), 'added', 'Reserve cash sale device');
with ranked as (
  select id, row_number() over (order by created_at, id) as position from public.sales
  where created_by_user_id = '16000000-0000-4000-8000-000000000001'
)
select is((select result from public.add_sale_item((select id from ranked where position = 3), '46000000-0000-4000-8000-000000000003')), 'added', 'Reserve bank-transfer sale device');
with ranked as (
  select id, row_number() over (order by created_at, id) as position from public.sales
  where created_by_user_id = '16000000-0000-4000-8000-000000000001'
)
select is((select result from public.add_sale_item((select id from ranked where position = 4), '46000000-0000-4000-8000-000000000004')), 'added', 'Reserve wrong-amount sale device');
with ranked as (
  select id, row_number() over (order by created_at, id) as position from public.sales
  where created_by_user_id = '16000000-0000-4000-8000-000000000001'
)
select is((select result from public.add_sale_item((select id from ranked where position = 5), '46000000-0000-4000-8000-000000000005')), 'added', 'Reserve no-attestation sale device');
with ranked as (
  select id, row_number() over (order by created_at, id) as position from public.sales
  where created_by_user_id = '16000000-0000-4000-8000-000000000001'
)
select is((select result from public.add_sale_item((select id from ranked where position = 6), '46000000-0000-4000-8000-000000000006')), 'added', 'Reserve unsupported-method sale device');

with ranked as (
  select id, row_number() over (order by created_at, id) as position from public.sales
  where created_by_user_id = '16000000-0000-4000-8000-000000000001'
)
select is(
  (select sale_status from public.confirm_sale_payment((select id from ranked where position = 1), 'mobile_money', 850000, ' MOMO-001 ', true)),
  'completed', 'Exact Mobile Money confirmation completes its sale'
);
with ranked as (
  select id, row_number() over (order by created_at, id) as position from public.sales
  where created_by_user_id = '16000000-0000-4000-8000-000000000001'
)
select is(
  (select sale_status from public.confirm_sale_payment((select id from ranked where position = 2), 'cash', 850000, null, true)),
  'completed', 'Exact cash confirmation completes its sale'
);
with ranked as (
  select id, row_number() over (order by created_at, id) as position from public.sales
  where created_by_user_id = '16000000-0000-4000-8000-000000000001'
)
select is(
  (select sale_status from public.confirm_sale_payment((select id from ranked where position = 3), 'bank_transfer', 850000, 'BANK-001', true)),
  'completed', 'Exact bank transfer confirmation completes its sale'
);
select is(
  (select count(*)::integer from public.sale_payments where payment_method in ('mobile_money','cash','bank_transfer')),
  3,
  'All and only the three supported methods are persisted'
);
select ok(
  (select bool_and(status = 'completed' and completed_at is not null) from public.sales where status = 'completed'),
  'Paid sales persist a genuine completed state and timestamp'
);
select ok(
  (select bool_and(status = 'sold') from public.store_inventory where id in (
    '56000000-0000-4000-8000-000000000001','56000000-0000-4000-8000-000000000002','56000000-0000-4000-8000-000000000003'
  )),
  'Payment completion marks each physical inventory row sold'
);
select ok(
  (select bool_and(status = 'fulfilled') from public.inventory_reservations where store_inventory_id in (
    '56000000-0000-4000-8000-000000000001','56000000-0000-4000-8000-000000000002','56000000-0000-4000-8000-000000000003'
  )),
  'Payment completion fulfils each active reservation'
);
select is(
  (select count(*)::integer from public.inventory_movements where movement_type = 'sold' and store_inventory_id in (
    '56000000-0000-4000-8000-000000000001','56000000-0000-4000-8000-000000000002','56000000-0000-4000-8000-000000000003'
  )),
  3,
  'Payment completion appends one sold movement per completed sale'
);
select is(
  (select count(*)::integer from public.audit_events where action in ('payment.manually_confirmed','inventory.sold','sale.completed')),
  9,
  'Payment, sold-inventory and sale-completion attribution are audited'
);

with ranked as (
  select id, row_number() over (order by created_at, id) as position from public.sales
  where created_by_user_id = '16000000-0000-4000-8000-000000000001'
)
select throws_ok(
  format($$select * from public.confirm_sale_payment('%s', 'cash', 849999, null, true)$$, (select id from ranked where position = 4)),
  '22023', 'payment amount must equal the authoritative sale total',
  'Underpayment is rejected'
);
with ranked as (
  select id, row_number() over (order by created_at, id) as position from public.sales
  where created_by_user_id = '16000000-0000-4000-8000-000000000001'
)
select throws_ok(
  format($$select * from public.confirm_sale_payment('%s', 'cash', 850001, null, true)$$, (select id from ranked where position = 4)),
  '22023', 'payment amount must equal the authoritative sale total',
  'Overpayment is rejected'
);
with ranked as (
  select id, row_number() over (order by created_at, id) as position from public.sales
  where created_by_user_id = '16000000-0000-4000-8000-000000000001'
)
select throws_ok(
  format($$select * from public.confirm_sale_payment('%s', 'cash', 0, null, true)$$, (select id from ranked where position = 4)),
  '22023', 'payment amount must be positive integer pesewas',
  'Zero payment is rejected'
);
with ranked as (
  select id, row_number() over (order by created_at, id) as position from public.sales
  where created_by_user_id = '16000000-0000-4000-8000-000000000001'
)
select throws_ok(
  format($$select * from public.confirm_sale_payment('%s', 'cash', -1, null, true)$$, (select id from ranked where position = 4)),
  '22023', 'payment amount must be positive integer pesewas',
  'Negative payment is rejected'
);
with ranked as (
  select id, row_number() over (order by created_at, id) as position from public.sales
  where created_by_user_id = '16000000-0000-4000-8000-000000000001'
)
select throws_ok(
  format($$select * from public.confirm_sale_payment('%s', 'cash', 850000, null, false)$$, (select id from ranked where position = 5)),
  '22023', 'employee must confirm that full payment was received',
  'Missing employee attestation is rejected'
);
with ranked as (
  select id, row_number() over (order by created_at, id) as position from public.sales
  where created_by_user_id = '16000000-0000-4000-8000-000000000001'
)
select throws_ok(
  format($$select * from public.confirm_sale_payment('%s', 'card', 850000, null, true)$$, (select id from ranked where position = 6)),
  '22023', 'unsupported payment method',
  'Unsupported methods are rejected'
);
with ranked as (
  select id, row_number() over (order by created_at, id) as position from public.sales
  where created_by_user_id = '16000000-0000-4000-8000-000000000001'
)
select throws_ok(
  format($$select * from public.confirm_sale_payment('%s', 'cash', 850000, null, true)$$, (select id from ranked where position = 1)),
  '23505', 'payment already confirmed for sale',
  'Duplicate/replayed confirmation is rejected'
);
select is((select count(*)::integer from public.sale_payments), 3, 'Rejected attempts do not create payment rows');
with ranked as (
  select id, row_number() over (order by created_at, id) as position from public.sales
  where created_by_user_id = '16000000-0000-4000-8000-000000000001'
)
select throws_ok(
  format($$select * from public.create_completed_sale_customer('%s', 'Too Early', '024 000 0000', null)$$, (select id from ranked where position = 4)),
  '23514', 'customer details require a completed paid sale',
  'Post-payment customer RPC rejects an unpaid sale'
);
select throws_ok(
  $$update public.sale_payments set transaction_reference = 'rewritten' where payment_method = 'cash'$$,
  'P0001', 'sale payments are immutable',
  'Confirmed payments cannot be updated'
);
select throws_ok(
  $$delete from public.sale_payments where payment_method = 'cash'$$,
  'P0001', 'sale payments are immutable',
  'Confirmed payments cannot be deleted'
);
select set_config(
  'test.phase6_foreign_sale',
  (select id::text from public.sales where status = 'draft' order by created_at, id limit 1),
  true
);

-- Post-payment customer capture is limited to the owner and genuinely paid sale.
with first_completed as (
  select id from public.sales
  where created_by_user_id = '16000000-0000-4000-8000-000000000001' and status = 'completed'
  order by created_at, id limit 1
)
select is(
  (select result from public.create_completed_sale_customer((select id from first_completed), 'Ama Paid', '024 123 9876', 'AMA.PAID@EXAMPLE.COM')),
  'created',
  'Customer details can be created and associated after successful payment'
);
select ok(
  (select customer_id is not null from public.sales where status = 'completed' order by created_at, id limit 1),
  'Completed sale persists its post-payment customer association'
);

-- Another same-store employee cannot confirm or inspect an owner sale payment.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"16000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*)::integer from public.sale_payments), 0, 'Payment RLS hides another employee payment');
with owner_unpaid as (
  select id from public.sales
  where created_by_user_id = '16000000-0000-4000-8000-000000000001' and status = 'draft'
  order by created_at, id limit 1
)
select throws_ok(
  format($$select * from public.confirm_sale_payment('%s', 'cash', 850000, null, true)$$, (select id from owner_unpaid)),
  '42501', 'only the sale owner can confirm payment',
  'Same-store employee cannot confirm another employee sale'
);

-- Manager visibility is store-scoped; manager receives no write shortcut.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"16000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*)::integer from public.sale_payments), 3, 'Same-store manager can read all completed payment records');
select throws_ok(
  $$select * from public.confirm_sale_payment(current_setting('test.phase6_foreign_sale')::uuid, 'cash', 850000, null, true)$$,
  '42501', 'only the sale owner can confirm payment',
  'Manager visibility does not permit confirming another employee sale'
);

-- Other-store employee sees none and cannot target a foreign sale.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"16000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is((select count(*)::integer from public.sale_payments), 0, 'Payment RLS prevents cross-store disclosure');
select throws_ok(
  $$select * from public.confirm_sale_payment(current_setting('test.phase6_foreign_sale')::uuid, 'cash', 850000, null, true)$$,
  '42501', 'active store permission required',
  'A caller cannot use a known identifier to cross store boundaries'
);

-- Expired and cancelled reservations/sales cannot be completed.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"16000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($$select * from public.create_sale_draft('00000000-0000-4000-8000-000000000007')$$, 'Create cancellation test sale');
with newest as (
  select id from public.sales where created_by_user_id = '16000000-0000-4000-8000-000000000001' order by created_at desc, id desc limit 1
)
select is((select result from public.add_sale_item((select id from newest), '46000000-0000-4000-8000-000000000007')), 'added', 'Reserve cancellation test device');
with newest as (
  select id from public.sales where created_by_user_id = '16000000-0000-4000-8000-000000000001' order by created_at desc, id desc limit 1
)
select is((select public.cancel_sale_draft((select id from newest), 'customer cancelled before payment')), 'cancelled', 'Cancel the test sale');
with cancelled as (
  select id from public.sales where created_by_user_id = '16000000-0000-4000-8000-000000000001' and status = 'cancelled' limit 1
)
select throws_ok(
  format($$select * from public.confirm_sale_payment('%s', 'cash', 850000, null, true)$$, (select id from cancelled)),
  '23514', 'cancelled sale cannot receive payment',
  'Cancelled sale cannot receive a payment'
);

select lives_ok($$select * from public.create_sale_draft('00000000-0000-4000-8000-000000000007')$$, 'Create expired-reservation test sale');
select set_config(
  'test.phase6_expired_sale',
  (select id::text from public.sales where created_by_user_id = '16000000-0000-4000-8000-000000000001' and status = 'draft' order by created_at desc, id desc limit 1),
  true
);
select is(
  (select result from public.add_sale_item(current_setting('test.phase6_expired_sale')::uuid, '46000000-0000-4000-8000-000000000007')),
  'added',
  'Reserve expired-reservation test device'
);
reset role;
update public.inventory_reservations
set created_at = created_at - interval '2 hours',
    expires_at = clock_timestamp() - interval '1 hour'
where id = (
  select reservation_id from public.sale_items
  where sale_id = current_setting('test.phase6_expired_sale')::uuid and status = 'active'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"16000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.confirm_sale_payment(current_setting('test.phase6_expired_sale')::uuid, 'cash', 850000, null, true)$$,
  '23514', 'sale reservation is not active and unexpired',
  'Expired reservation prevents payment and sale completion'
);
select is((select count(*)::integer from public.sale_payments), 3, 'Cancelled and expired rejection paths append no payment');

select * from finish();
rollback;
