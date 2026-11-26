begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Unknown battery health for staged units only.
--
-- A physical inspection that reports "Battery Life: No Data" has no measurable
-- value. These tests pin the boundary: an unmeasured handset may be staged and
-- inspected, but it may not be activated, may not reach sellable inventory, and
-- may not have its reading revised once it has been recorded.

insert into public.stores (id, code, name)
values ('00000000-0000-4000-8000-000000000081', 'unknown-battery-store', 'Unknown Battery Store');

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('18000000-0000-4000-8000-000000000001', 'battery.manager@local.test', statement_timestamp(), '{"full_name":"Battery Manager"}'),
  ('18000000-0000-4000-8000-000000000002', 'battery.employee@local.test', statement_timestamp(), '{"full_name":"Battery Employee"}');

insert into public.store_memberships (id, store_id, user_id, role_id, status, joined_at)
values
  ('28000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000081', '18000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000102', 'active', statement_timestamp()),
  ('28000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000081', '18000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000101', 'active', statement_timestamp());

create temp table battery_fixture_ids (id text primary key, value uuid not null);
create temp table battery_inspection_fixtures (name text primary key, doc jsonb not null);
grant select, insert on battery_fixture_ids to authenticated;
grant select on battery_inspection_fixtures to authenticated;

insert into battery_inspection_fixtures (name, doc)
values
  ('valid', '{"imei_confirmed_physical":true,"identity_labels_match":true,"display_passed":true,"cameras_passed":true,"buttons_passed":true,"connectivity_passed":true,"charging_port_passed":true,"activation_lock_cleared":true,"notes":"Battery health reported No Data"}'::jsonb),
  ('failed_camera', '{"imei_confirmed_physical":true,"identity_labels_match":true,"display_passed":true,"cameras_passed":false,"buttons_passed":true,"connectivity_passed":true,"charging_port_passed":true,"activation_lock_cleared":true,"notes":"Camera fault"}'::jsonb);

/* ------------------------------------------------------------------ *
 * Schema: only the staged column relaxes
 * ------------------------------------------------------------------ */

select ok(
  (select is_nullable = 'YES' from information_schema.columns
   where table_schema = 'public' and table_name = 'opening_stock_units'
     and column_name = 'battery_health'),
  'A staged opening-stock unit may record an unknown battery health'
);
select ok(
  (select is_nullable = 'NO' from information_schema.columns
   where table_schema = 'public' and table_name = 'inventory_devices'
     and column_name = 'battery_health'),
  'Sellable inventory still requires a measured battery health'
);
select has_function(
  'public', 'record_opening_stock_unit_battery_health', array['uuid', 'integer'],
  'The measurement can be recorded through a dedicated RPC'
);
select ok(
  private.is_valid_opening_stock_inspection((select doc from battery_inspection_fixtures where name = 'valid')),
  'An unknown battery does not change the inspection contract'
);
select ok(
  not private.is_valid_opening_stock_inspection((select doc from battery_inspection_fixtures where name = 'failed_camera')),
  'A failed inspection is still rejected regardless of battery state'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '18000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"18000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$insert into battery_fixture_ids (id, value)
    select 'model_catalogue', model_catalogue_id
    from public.register_opening_stock_model('00000000-0000-4000-8000-000000000081', 'Battery Test iPhone', 128, 'BAT-128')$$,
  'Manager registers the model to receive against'
);
select lives_ok(
  $$insert into battery_fixture_ids (id, value)
    select 'invoice', invoice_id
    from public.create_supplier_invoice('00000000-0000-4000-8000-000000000081', 'Battery Supplier', 'BAT-2026-001', date '2026-11-25', 400000, 'Unknown battery batch')$$,
  'Manager creates a supplier invoice'
);
select lives_ok(
  $$insert into battery_fixture_ids (id, value)
    select 'line', invoice_line_id
    from public.add_supplier_invoice_line(
      (select value from battery_fixture_ids where id = 'invoice'),
      (select value from battery_fixture_ids where id = 'model_catalogue'), 4, 100000, 'Unmeasured handsets')$$,
  'Manager adds the invoice line'
);
select lives_ok(
  $$select public.confirm_supplier_invoice(
      (select value from battery_fixture_ids where id = 'invoice'), 400000, 1, 4, 400000, true)$$,
  'Manager confirms the invoice totals before receiving'
);

/* ------------------------------------------------------------------ *
 * Receiving an unmeasured device
 * ------------------------------------------------------------------ */

select lives_ok(
  $$insert into battery_fixture_ids (id, value)
    select 'unit_unmeasured', unit_id
    from public.receive_opening_stock_devices(
      (select value from battery_fixture_ids where id = 'line'),
      jsonb_build_array(jsonb_build_object(
        'imei', '351887639266605', 'colour', 'Green', 'condition', 'good',
        'battery_health', null,
        'inspection', (select doc from battery_inspection_fixtures where name = 'valid'))))$$,
  'An explicit null battery health can be received'
);
select is(
  (select battery_health from public.opening_stock_units_view
   where id = (select value from battery_fixture_ids where id = 'unit_unmeasured')),
  null::integer,
  'The unknown measurement is stored as null, never as zero or full health'
);
select is(
  (select status from public.opening_stock_units_view
   where id = (select value from battery_fixture_ids where id = 'unit_unmeasured')),
  'staged',
  'An unmeasured device is staged and never sellable'
);
select is(
  (select count(*)::integer from public.store_inventory where store_id = '00000000-0000-4000-8000-000000000081'),
  0,
  'Receiving an unmeasured device creates no sellable inventory'
);

select lives_ok(
  $$insert into battery_fixture_ids (id, value)
    select 'unit_measured', unit_id
    from public.receive_opening_stock_devices(
      (select value from battery_fixture_ids where id = 'line'),
      jsonb_build_array(jsonb_build_object(
        'imei', '351062823645416', 'colour', 'Starlight', 'condition', 'excellent',
        'battery_health', 100,
        'inspection', (select doc from battery_inspection_fixtures where name = 'valid'))))$$,
  'A supplied battery health is still accepted unchanged'
);
select is(
  (select battery_health from public.opening_stock_units_view
   where id = (select value from battery_fixture_ids where id = 'unit_measured')),
  100,
  'A confirmed measurement is stored exactly as supplied'
);

/* ------------------------------------------------------------------ *
 * Receiving still enforces every other rule
 * ------------------------------------------------------------------ */

select throws_ok(
  $$select * from public.receive_opening_stock_devices(
      (select value from battery_fixture_ids where id = 'line'),
      jsonb_build_array(jsonb_build_object(
        'imei', '354032283872880', 'colour', 'Black', 'condition', 'good', 'battery_health', null,
        'inspection', (select doc from battery_inspection_fixtures where name = 'failed_camera'))))$$,
  '22023', 'real IMEI and complete passing inspection required',
  'An unknown battery never waives a failed inspection attestation'
);
select throws_ok(
  $$select * from public.receive_opening_stock_devices(
      (select value from battery_fixture_ids where id = 'line'),
      jsonb_build_array(jsonb_build_object(
        'imei', '354032283872880', 'colour', 'Black', 'condition', 'good', 'battery_health', null)))$$,
  '22023', 'real IMEI and complete passing inspection required',
  'An unknown battery never waives the inspection document itself'
);
select throws_ok(
  $$select * from public.receive_opening_stock_devices(
      (select value from battery_fixture_ids where id = 'line'),
      jsonb_build_array(jsonb_build_object(
        'imei', '354032283872880', 'colour', 'Black', 'condition', 'good', 'battery_health', 101,
        'inspection', (select doc from battery_inspection_fixtures where name = 'valid'))))$$,
  '22023', 'real IMEI and complete passing inspection required',
  'An out-of-range battery health is rejected'
);
select throws_ok(
  $$select * from public.receive_opening_stock_devices(
      (select value from battery_fixture_ids where id = 'line'),
      jsonb_build_array(jsonb_build_object(
        'imei', '354032283872880', 'colour', 'Black', 'condition', 'good', 'battery_health', 'n/a',
        'inspection', (select doc from battery_inspection_fixtures where name = 'valid'))))$$,
  '22023', 'battery health must be a whole percentage or unknown',
  'A typo in the battery field is rejected rather than silently recorded as unknown'
);

/* ------------------------------------------------------------------ *
 * Activation is blocked until a measurement exists
 * ------------------------------------------------------------------ */

select throws_ok(
  format(
    $$select * from public.activate_opening_stock_unit(%L, 450000, true)$$,
    (select value from battery_fixture_ids where id = 'unit_unmeasured')
  ),
  '23514', 'record the measured battery health before activation',
  'An unmeasured device cannot be activated into sellable inventory'
);
select is(
  (select count(*)::integer from public.inventory_devices where imei = '351887639266605'),
  0,
  'The refused activation created no physical device'
);

/* ------------------------------------------------------------------ *
 * Recording the measurement
 * ------------------------------------------------------------------ */

select lives_ok(
  format(
    $$select * from public.record_opening_stock_unit_battery_health(%L, 87)$$,
    (select value from battery_fixture_ids where id = 'unit_unmeasured')
  ),
  'A manager can record the measurement that was unknown'
);
select is(
  (select battery_health from public.opening_stock_units_view
   where id = (select value from battery_fixture_ids where id = 'unit_unmeasured')),
  87,
  'The recorded measurement is persisted'
);
select is(
  (select status from public.opening_stock_units_view
   where id = (select value from battery_fixture_ids where id = 'unit_unmeasured')),
  'staged',
  'Recording a measurement does not activate the device'
);
select is(
  (select count(*)::integer from public.store_inventory where store_id = '00000000-0000-4000-8000-000000000081'),
  0,
  'Recording a measurement does not create sellable inventory'
);

select throws_ok(
  format(
    $$select * from public.record_opening_stock_unit_battery_health(%L, 64)$$,
    (select value from battery_fixture_ids where id = 'unit_unmeasured')
  ),
  '23514', 'battery health is already recorded for this unit',
  'A recorded measurement cannot be revised through the recording RPC'
);
select throws_ok(
  format(
    $$select * from public.record_opening_stock_unit_battery_health(%L, 0)$$,
    (select value from battery_fixture_ids where id = 'unit_unmeasured')
  ),
  '22023', 'battery health must be a whole percentage between 1 and 100',
  'A recorded measurement must be a whole percentage in range'
);

/* ------------------------------------------------------------------ *
 * Activation succeeds once measured, then the value is frozen
 * ------------------------------------------------------------------ */

select lives_ok(
  format(
    $$select * from public.activate_opening_stock_unit(%L, 450000, true)$$,
    (select value from battery_fixture_ids where id = 'unit_unmeasured')
  ),
  'A measured device activates once a sale price is approved'
);
select is(
  (select battery_health from public.inventory_devices where imei = '351887639266605'),
  87,
  'Sellable inventory carries the measured battery health'
);
select throws_ok(
  format(
    $$select * from public.record_opening_stock_unit_battery_health(%L, 90)$$,
    (select value from battery_fixture_ids where id = 'unit_unmeasured')
  ),
  '23514', 'battery health can only be recorded on a staged unit',
  'A sellable unit can never have its battery health recorded again'
);

/* ------------------------------------------------------------------ *
 * Database-level guards
 * ------------------------------------------------------------------ */

reset role;

select throws_ok(
  $$insert into public.opening_stock_units (
      store_id, invoice_line_id, device_model_id, imei, colour, condition,
      battery_health, inspection, unit_cost_pesewas, status,
      received_by_user_id, received_by_membership_id, received_by_display_name,
      approved_price_pesewas, inventory_device_id, store_inventory_id,
      activated_by_user_id, activated_by_membership_id, activated_by_display_name, activated_at)
    values (
      '00000000-0000-4000-8000-000000000081',
      (select value from battery_fixture_ids where id = 'line'),
      (select device_model_id from public.supplier_invoice_lines where id = (select value from battery_fixture_ids where id = 'line')),
      '357215264665590', 'Sierra Blue', 'good', null,
      (select doc from battery_inspection_fixtures where name = 'valid'), 100000, 'activated',
      '18000000-0000-4000-8000-000000000001', '28000000-0000-4000-8000-000000000001', 'Battery Manager',
      450000, gen_random_uuid(), gen_random_uuid(),
      '18000000-0000-4000-8000-000000000001', '28000000-0000-4000-8000-000000000001', 'Battery Manager', statement_timestamp())$$,
  '23514',
  'new row for relation "opening_stock_units" violates check constraint "opening_stock_units_battery_valid"',
  'An activated unit can never hold an unknown battery, even by direct insert'
);
select throws_ok(
  $$insert into public.inventory_devices (device_model_id, imei, colour, condition, battery_health)
    values (
      (select device_model_id from public.supplier_invoice_lines where id = (select value from battery_fixture_ids where id = 'line')),
      '357215264665590', 'Sierra Blue', 'good', null)$$,
  '23502',
  'null value in column "battery_health" of relation "inventory_devices" violates not-null constraint',
  'Sellable inventory refuses an unknown battery'
);
select throws_ok(
  $$update public.opening_stock_units set battery_health = null
    where id = (select value from battery_fixture_ids where id = 'unit_measured')$$,
  '23514', 'received opening-stock battery health is immutable once measured',
  'A confirmed measurement can never be cleared back to unknown'
);

select is(
  (select count(*)::integer from public.opening_stock_units
   where battery_health is null and status = 'staged'),
  0,
  'No staged row is left unmeasured after the measurement was recorded'
);
select is(
  (select count(*)::integer from public.opening_stock_units
   where battery_health is null and status = 'activated'),
  0,
  'No sellable row can hold an unknown battery'
);
select is(
  (select count(*)::integer from public.store_inventory
   where store_id = '00000000-0000-4000-8000-000000000081' and status = 'available'),
  1,
  'Exactly one sellable inventory row exists after activation'
);

select * from finish();
rollback;
