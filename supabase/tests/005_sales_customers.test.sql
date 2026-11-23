begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.stores (id, code, name)
values
  ('00000000-0000-4000-8000-000000000005', 'phase5-sales-a', 'Phase 5 Sales A'),
  ('00000000-0000-4000-8000-000000000006', 'phase5-sales-b', 'Phase 5 Sales B');

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('15000000-0000-4000-8000-000000000001', 'phase5.employee.a@local.test', statement_timestamp(), '{"full_name":"Phase 5 Employee A"}'),
  ('15000000-0000-4000-8000-000000000002', 'phase5.competitor.a@local.test', statement_timestamp(), '{"full_name":"Phase 5 Competitor A"}'),
  ('15000000-0000-4000-8000-000000000003', 'phase5.admin.a@local.test', statement_timestamp(), '{"full_name":"Phase 5 Administrator A"}'),
  ('15000000-0000-4000-8000-000000000004', 'phase5.employee.b@local.test', statement_timestamp(), '{"full_name":"Phase 5 Employee B"}');

insert into public.store_memberships (id, store_id, user_id, role_id, status, joined_at)
values
  ('25000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000005', '15000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', 'active', statement_timestamp()),
  ('25000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000005', '15000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000101', 'active', statement_timestamp()),
  ('25000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000005', '15000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000103', 'active', statement_timestamp()),
  ('25000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000006', '15000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000101', 'active', statement_timestamp());

insert into public.device_models (id, model_name, storage_gb)
values ('35000000-0000-4000-8000-000000000001', 'Phase 5 iPhone', 256);
insert into public.inventory_devices (id, device_model_id, imei, colour, condition, battery_health)
values
  ('45000000-0000-4000-8000-000000000001', '35000000-0000-4000-8000-000000000001', '358240051111110', 'Black', 'excellent', 95),
  ('45000000-0000-4000-8000-000000000002', '35000000-0000-4000-8000-000000000001', '358240051111128', 'Blue', 'good', 88),
  ('45000000-0000-4000-8000-000000000003', '35000000-0000-4000-8000-000000000001', '358240051111136', 'White', 'excellent', 99);
insert into public.store_inventory (id, store_id, device_id, cost_pesewas, price_pesewas)
values
  ('55000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000005', '45000000-0000-4000-8000-000000000001', 700000, 850000),
  ('55000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000005', '45000000-0000-4000-8000-000000000002', 600000, 725000),
  ('55000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000006', '45000000-0000-4000-8000-000000000003', 650000, 800000);
set constraints all immediate;
set constraints all deferred;

select is(private.normalize_customer_phone('024 123 4567'), '+233241234567', 'Ghana local phone format is normalized');
select is(private.normalize_customer_phone('+233 24 123 4567'), '+233241234567', 'Ghana international phone format is normalized');
select throws_ok(
  $$select private.normalize_customer_phone('not a phone')$$,
  '22023', null,
  'Invalid customer phone input is rejected without imposing one display format'
);
select col_type_is('public', 'sales', 'subtotal_pesewas', 'bigint', 'Sale subtotal uses integer pesewas');
select col_type_is('public', 'sale_items', 'unit_price_pesewas', 'bigint', 'Sale item price uses integer pesewas');

set local role authenticated;
select set_config('request.jwt.claim.sub', '15000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"15000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$select * from public.create_sale_draft('00000000-0000-4000-8000-000000000005')$$,
  'Employee can create a persistent draft in their active store'
);
select is(
  (select count(*)::integer from public.sales where status = 'draft'), 1,
  'Employee can read their own store-scoped draft'
);
select like(
  (select sale_number from public.sales limit 1), 'ME-%',
  'Sale receives a unique human-readable identifier'
);

select is(
  (
    select result from public.create_sale_customer(
      (select id from public.sales limit 1),
      'Ama Customer', '024 123 4567', 'AMA@EXAMPLE.COM', 'Prefers WhatsApp'
    )
  ),
  'created',
  'Customer is created atomically during a sale'
);
select is(
  (select phone_normalized from public.customers limit 1), '+233241234567',
  'Customer stores a canonical duplicate-matching phone'
);
select is(
  (select email from public.customers limit 1), 'ama@example.com',
  'Customer email is normalized when supplied'
);
select ok(
  (select customer_id is not null from public.sales limit 1),
  'Created customer is associated with the sale in the same RPC'
);
select is(
  (
    select result from public.create_sale_customer(
      (select id from public.sales limit 1),
      'Duplicate Attempt', '+233 24 123 4567', null, null
    )
  ),
  'existing',
  'Canonical phone matching reuses an existing same-store customer'
);
select is((select count(*)::integer from public.customers), 1, 'Duplicate customer attempt creates no second row');

select is(
  (
    select result from public.add_sale_item(
      (select id from public.sales limit 1),
      '45000000-0000-4000-8000-000000000001'
    )
  ),
  'added',
  'Trusted sale item creation reserves an available device'
);
select is(
  (select status from public.store_inventory where id = '55000000-0000-4000-8000-000000000001'),
  'reserved',
  'Adding a sale item uses the existing reservation lifecycle'
);
select is(
  (select subtotal_pesewas from public.sales limit 1), 850000::bigint,
  'Sale subtotal is calculated from the trusted inventory price'
);
select is(
  (select total_pesewas from public.sales limit 1), 850000::bigint,
  'Generated sale total cannot be supplied by the browser'
);
select is(
  (
    select result from public.add_sale_item(
      (select id from public.sales limit 1),
      '45000000-0000-4000-8000-000000000001'
    )
  ),
  'already_added',
  'The same physical device cannot be duplicated in one draft'
);
select is(
  (select count(*)::integer from public.sale_items where status = 'active'), 1,
  'Duplicate item attempt leaves one active snapshot'
);
select is(
  (
    select result from public.remove_sale_item(
      (select id from public.sales limit 1),
      (select id from public.sale_items where status = 'active' limit 1)
    )
  ),
  'removed',
  'Removing a draft item preserves the snapshot and releases its reservation'
);
select is((select total_pesewas from public.sales limit 1), 0::bigint, 'Removing the only active item recalculates the draft total');
select is(
  (select status from public.store_inventory where id = '55000000-0000-4000-8000-000000000001'),
  'available',
  'Removing an item returns the physical device to available inventory'
);
select is(
  (
    select result from public.add_sale_item(
      (select id from public.sales limit 1),
      '45000000-0000-4000-8000-000000000001'
    )
  ),
  'added',
  'A released device can be reserved again in the same unfinished draft'
);
select is(
  (
    select result from public.add_sale_item(
      (select id from public.sales limit 1),
      '45000000-0000-4000-8000-000000000003'
    )
  ),
  'not_found',
  'A cross-store inventory reference is rejected without a partial item write'
);
select is(
  (select subtotal_pesewas from public.sales limit 1), 850000::bigint,
  'Failed inventory addition leaves totals unchanged atomically'
);
select throws_ok(
  $$update public.sales set subtotal_pesewas = 1$$,
  '42501', null,
  'Employee cannot directly submit an invalid total'
);
select throws_ok(
  $$insert into public.customers (store_id,full_name,phone,phone_normalized,created_by_user_id,created_by_membership_id)
    values ('00000000-0000-4000-8000-000000000005','Direct Write','0200000000','+233200000000','15000000-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000001')$$,
  '42501', null,
  'Employee cannot bypass customer RPCs with a direct insert'
);
select throws_ok(
  $$select * from public.set_sale_item_discount(
      (select id from public.sales limit 1),
      (select id from public.sale_items where status='active' limit 1),
      10000
    )$$,
  '42501', null,
  'Employee cannot apply an unauthorised discount'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '15000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"15000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$select * from public.create_sale_draft('00000000-0000-4000-8000-000000000005')$$,
  'Competing employee can create a separate draft'
);
select is(
  (
    select result from public.add_sale_item(
      (select id from public.sales where created_by_user_id = '15000000-0000-4000-8000-000000000002' limit 1),
      '45000000-0000-4000-8000-000000000001'
    )
  ),
  'already_reserved',
  'A competing draft cannot take the reserved physical device'
);
select is(
  (select count(*)::integer from public.customers), 1,
  'Same-store employee can search existing customers'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '15000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"15000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is((select count(*)::integer from public.customers), 0, 'Customer RLS prevents cross-store disclosure');
select is((select count(*)::integer from public.sales), 0, 'Sale RLS prevents cross-store disclosure');
select throws_ok(
  $$select * from public.create_sale_customer(
      '00000000-0000-4000-8000-000000000001',
      'Cross Store', '0550000000', null, null
    )$$,
  '42501', null,
  'Cross-store customer association is rejected'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '15000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"15000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select lives_ok(
  $$select * from public.create_sale_draft('00000000-0000-4000-8000-000000000005')$$,
  'Administrator can create a sale draft'
);
select is(
  (
    select result from public.add_sale_item(
      (select id from public.sales where created_by_user_id = '15000000-0000-4000-8000-000000000003' limit 1),
      '45000000-0000-4000-8000-000000000002'
    )
  ),
  'added',
  'Administrator draft can reserve a different available device'
);
select lives_ok(
  $$select * from public.set_sale_item_discount(
      (select id from public.sales where created_by_user_id = '15000000-0000-4000-8000-000000000003' limit 1),
      (select id from public.sale_items where device_id = '45000000-0000-4000-8000-000000000002' and status = 'active'),
      25000
    )$$,
  'Administrator can record an authorised item discount'
);
select is(
  (select total_pesewas from public.sales where created_by_user_id = '15000000-0000-4000-8000-000000000003'),
  700000::bigint,
  'Authorised discount updates the generated trusted total'
);
select is(
  (
    select sale_status from public.submit_sale_for_payment(
      (select id from public.sales where created_by_user_id = '15000000-0000-4000-8000-000000000003')
    )
  ),
  'awaiting_payment',
  'Checkout moves sale only to awaiting payment'
);
select is(
  (select status from public.store_inventory where id = '55000000-0000-4000-8000-000000000002'),
  'reserved',
  'Awaiting-payment checkout does not mark inventory sold'
);
select is(
  (
    select public.cancel_sale_draft(
      (select id from public.sales where created_by_user_id = '15000000-0000-4000-8000-000000000003'),
      'customer cancelled before payment'
    )
  ),
  'cancelled',
  'Awaiting-payment sale can be safely cancelled'
);
select is(
  (select status from public.store_inventory where id = '55000000-0000-4000-8000-000000000002'),
  'available',
  'Cancelling a sale releases its active reservation'
);
select is(
  (select count(*)::integer from public.audit_events where action in (
    'sale.draft_created','customer.created','sale.customer_associated','sale.item_added',
    'sale.item_removed','sale.discount_updated','sale.awaiting_payment','sale.cancelled'
  )),
  12,
  'Important customer, draft, item, discount, checkout and cancellation actions are audited'
);

reset role;
select throws_ok(
  $$update public.sale_items set product_description = 'Changed history' where device_id = '45000000-0000-4000-8000-000000000002'$$,
  'P0001', 'sale item identity and price snapshot are immutable',
  'Sale item historical snapshots cannot be rewritten even by a trusted table writer'
);
select throws_ok(
  $$update public.sales set discount_pesewas = subtotal_pesewas + 1 where created_by_user_id = '15000000-0000-4000-8000-000000000001'$$,
  '23514', null,
  'Database rejects totals with discount greater than subtotal'
);

select * from finish();
rollback;
