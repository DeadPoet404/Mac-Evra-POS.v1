begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.stores (id, code, name)
values
  ('00000000-0000-4000-8000-000000000009', 'opening-stock-a', 'Opening Stock A'),
  ('00000000-0000-4000-8000-000000000010', 'opening-stock-b', 'Opening Stock B');

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('17000000-0000-4000-8000-000000000001', 'opening.manager.a@local.test', statement_timestamp(), '{"full_name":"Opening Manager A"}'),
  ('17000000-0000-4000-8000-000000000002', 'opening.employee.viewer@local.test', statement_timestamp(), '{"full_name":"Opening Employee Viewer"}'),
  ('17000000-0000-4000-8000-000000000003', 'opening.employee.normal@local.test', statement_timestamp(), '{"full_name":"Opening Employee"}'),
  ('17000000-0000-4000-8000-000000000004', 'opening.manager.no.pricing@local.test', statement_timestamp(), '{"full_name":"No Pricing Manager"}'),
  ('17000000-0000-4000-8000-000000000005', 'opening.manager.viewer@local.test', statement_timestamp(), '{"full_name":"Cost Restricted Manager"}'),
  ('17000000-0000-4000-8000-000000000006', 'opening.manager.b@local.test', statement_timestamp(), '{"full_name":"Opening Manager B"}');

insert into public.store_memberships (id, store_id, user_id, role_id, status, joined_at)
values
  ('27000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000009', '17000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000102', 'active', statement_timestamp()),
  ('27000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000009', '17000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000101', 'active', statement_timestamp()),
  ('27000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000009', '17000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000101', 'active', statement_timestamp()),
  ('27000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000009', '17000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000102', 'active', statement_timestamp()),
  ('27000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000009', '17000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000102', 'active', statement_timestamp()),
  ('27000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000010', '17000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000102', 'active', statement_timestamp());

insert into public.membership_permission_overrides (membership_id, permission_id, allowed, reason, granted_by)
values
  ('27000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000206', true, 'Read-only opening-stock visibility test', '17000000-0000-4000-8000-000000000001'),
  ('27000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000214', false, 'Pricing approval removed for authorization test', '17000000-0000-4000-8000-000000000001'),
  ('27000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000207', false, 'Inventory management removed for cost test', '17000000-0000-4000-8000-000000000001');

create temp table opening_stock_fixture_ids (id text primary key, value uuid not null);
create temp table opening_stock_unit_fixture (label text primary key, unit_id uuid not null, imei text not null);
create temp table opening_stock_inspection_fixtures (name text primary key, doc jsonb not null);
create temp table opening_stock_reservation_fixture (
  result text,
  reservation_id uuid,
  inventory_id uuid,
  device_id uuid,
  reservation_status text,
  expires_at timestamptz
);
grant select, insert on opening_stock_fixture_ids to authenticated;
grant select, insert on opening_stock_unit_fixture to authenticated;
grant select on opening_stock_inspection_fixtures to authenticated;
grant select, insert on opening_stock_reservation_fixture to authenticated;

insert into opening_stock_inspection_fixtures (name, doc)
values
  ('valid', '{"imei_confirmed_physical":true,"identity_labels_match":true,"display_passed":true,"cameras_passed":true,"buttons_passed":true,"connectivity_passed":true,"charging_port_passed":true,"activation_lock_cleared":true,"notes":"Supplier sealed box"}'::jsonb),
  ('failed_camera', '{"imei_confirmed_physical":true,"identity_labels_match":true,"display_passed":true,"cameras_passed":false,"buttons_passed":true,"connectivity_passed":true,"charging_port_passed":true,"activation_lock_cleared":true,"notes":"Camera fault"}'::jsonb),
  ('extra_key', '{"imei_confirmed_physical":true,"identity_labels_match":true,"display_passed":true,"cameras_passed":true,"buttons_passed":true,"connectivity_passed":true,"charging_port_passed":true,"activation_lock_cleared":true,"notes":"Valid","unexpected":true}'::jsonb),
  ('control_note', '{"imei_confirmed_physical":true,"identity_labels_match":true,"display_passed":true,"cameras_passed":true,"buttons_passed":true,"connectivity_passed":true,"charging_port_passed":true,"activation_lock_cleared":true,"notes":"line\nbreak"}'::jsonb),
  ('valid_blue', '{"imei_confirmed_physical":true,"identity_labels_match":true,"display_passed":true,"cameras_passed":true,"buttons_passed":true,"connectivity_passed":true,"charging_port_passed":true,"activation_lock_cleared":true,"notes":"Blue device independently inspected"}'::jsonb),
  ('valid_white', '{"imei_confirmed_physical":true,"identity_labels_match":true,"display_passed":true,"cameras_passed":true,"buttons_passed":true,"connectivity_passed":true,"charging_port_passed":true,"activation_lock_cleared":true,"notes":"White device independently inspected"}'::jsonb);
set constraints all immediate;
set constraints all deferred;

select has_table('public', 'supplier_invoices', 'Opening stock creates supplier invoices');
select has_table('public', 'supplier_invoice_lines', 'Opening stock creates invoice lines');
select has_table('public', 'opening_stock_models', 'Opening stock creates a model catalogue');
select has_table('public', 'opening_stock_units', 'Opening stock creates staged physical units');
select has_table('public', 'supplier_invoice_corrections', 'Opening stock creates an immutable correction ledger');
select has_table('public', 'opening_stock_price_changes', 'Opening stock creates an immutable price-change ledger');
select has_view('public', 'opening_stock_invoice_lines_view', 'Opening stock exposes separate quantity columns through a view');
select col_type_is('public', 'supplier_invoice_lines', 'unit_cost_pesewas', 'bigint', 'Purchase cost uses integer pesewas');
select col_type_is('public', 'opening_stock_units', 'approved_price_pesewas', 'bigint', 'Approved price uses integer pesewas');
select col_type_is('public', 'supplier_invoices', 'declared_total_pesewas', 'bigint', 'Declared invoice total uses integer pesewas');
select col_type_is('public', 'supplier_invoice_lines', 'line_total_pesewas', 'bigint', 'Calculated line total uses integer pesewas');
select has_view('public', 'opening_stock_invoice_reconciliation_view', 'Opening stock exposes declared-total reconciliation through a view');
select ok(
  (select is_nullable = 'YES' from information_schema.columns
   where table_schema = 'public' and table_name = 'supplier_invoices'
     and column_name = 'supplier_invoice_number'),
  'Supplier invoice number/reference is optional'
);
select ok(
  (select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where oid = any (array[
    'public.supplier_invoices'::regclass,
    'public.supplier_invoice_lines'::regclass,
    'public.opening_stock_models'::regclass,
    'public.opening_stock_units'::regclass,
    'public.supplier_invoice_corrections'::regclass,
    'public.opening_stock_price_changes'::regclass
  ])),
  'Every opening-stock table has enabled and forced RLS'
);
select ok(
  not has_column_privilege('authenticated', 'public.supplier_invoice_lines', 'unit_cost_pesewas', 'SELECT')
  and not has_column_privilege('authenticated', 'public.supplier_invoice_lines', 'line_total_pesewas', 'SELECT')
  and not has_column_privilege('authenticated', 'public.supplier_invoices', 'declared_total_pesewas', 'SELECT')
  and not has_column_privilege('authenticated', 'public.opening_stock_units', 'unit_cost_pesewas', 'SELECT')
  and not has_column_privilege('authenticated', 'public.store_inventory', 'cost_pesewas', 'SELECT'),
  'Purchase cost, declared total, and calculated line total columns are not directly granted'
);

select ok(private.is_valid_opening_stock_imei('357000000000017'), 'A plausible Luhn-valid IMEI is accepted');
select ok(not private.is_valid_opening_stock_imei('357000000000018'), 'An invalid Luhn check digit is rejected');
select ok(not private.is_valid_opening_stock_imei('000000000000000'), 'The all-zero test IMEI is rejected');
select ok(not private.is_valid_opening_stock_imei('490154203237518'), 'A known sample IMEI is rejected');
select ok(not private.is_valid_opening_stock_imei('111111110001238'), 'A repeated TAC placeholder is rejected');
select ok(not private.is_valid_opening_stock_imei('012345678901234'), 'A sequential placeholder is rejected');
select ok(private.is_valid_opening_stock_inspection((select doc from opening_stock_inspection_fixtures where name = 'valid')), 'A complete passing inspection is accepted');
select ok(not private.is_valid_opening_stock_inspection((select doc from opening_stock_inspection_fixtures where name = 'failed_camera')), 'A failed inspection check is rejected');
select ok(not private.is_valid_opening_stock_inspection((select doc from opening_stock_inspection_fixtures where name = 'extra_key')), 'Unknown inspection fields are rejected');
select ok(not private.is_valid_opening_stock_inspection((select doc from opening_stock_inspection_fixtures where name = 'control_note')), 'Control characters in inspection notes are rejected');

set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"17000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$insert into opening_stock_fixture_ids (id, value)
    select 'model_catalogue', model_catalogue_id
    from public.register_opening_stock_model('00000000-0000-4000-8000-000000000009', 'Opening Stock iPhone', 256, 'OS-IPH-256')$$,
  'Manager registers a model catalogue entry'
);
select lives_ok(
  $$insert into opening_stock_fixture_ids (id, value)
    select 'device_model', device_model_id
    from public.register_opening_stock_model('00000000-0000-4000-8000-000000000009', 'Opening Stock iPhone', 256, 'OS-IPH-256')$$,
  'Re-registering the same model is idempotent'
);
select lives_ok(
  $$insert into opening_stock_fixture_ids (id, value)
    select 'invoice', invoice_id
    from public.create_supplier_invoice('00000000-0000-4000-8000-000000000009', 'Approved Supplier', 'OS-2026-001', date '2026-11-23', 4700000, 'Initial invoice')$$,
  'Manager creates a supplier invoice'
);
select lives_ok(
  $$insert into opening_stock_fixture_ids (id, value)
    select 'line1', invoice_line_id
    from public.add_supplier_invoice_line((select value from opening_stock_fixture_ids where id = 'invoice'), (select value from opening_stock_fixture_ids where id = 'model_catalogue'), 5, 700000, 'First model line')$$,
  'Manager adds a five-device invoice line'
);
select lives_ok(
  $$insert into opening_stock_fixture_ids (id, value)
    select 'line2', invoice_line_id
    from public.add_supplier_invoice_line((select value from opening_stock_fixture_ids where id = 'invoice'), (select value from opening_stock_fixture_ids where id = 'model_catalogue'), 2, 600000, 'Correction test line')$$,
  'Manager adds a second invoice line'
);
select is(
  (select quantity_invoiced from public.opening_stock_invoice_lines_view where id = (select value from opening_stock_fixture_ids where id = 'line1')),
  5, 'Invoiced quantity is separate and starts at the invoice-line quantity'
);
select is(
  (select quantity_outstanding from public.opening_stock_invoice_lines_view where id = (select value from opening_stock_fixture_ids where id = 'line1')),
  5, 'Outstanding quantity starts equal to invoiced quantity'
);
select is(
  (select unit_cost_pesewas from public.opening_stock_invoice_lines_view where id = (select value from opening_stock_fixture_ids where id = 'line1')),
  700000::bigint, 'An authorized manager sees purchase cost through the permission-masked view'
);
select throws_ok(
  $$select unit_cost_pesewas from public.supplier_invoice_lines where id = (select value from opening_stock_fixture_ids where id = 'line1')$$,
  '42501', null,
  'Even a manager cannot select the raw purchase-cost column directly'
);

select is(
  (select line_total_pesewas from public.opening_stock_invoice_lines_view where id = (select value from opening_stock_fixture_ids where id = 'line1')),
  3500000::bigint, 'A line total is calculated from quantity × integer-pesewa unit cost'
);
select throws_ok(
  $$select line_total_pesewas from public.supplier_invoice_lines where id = (select value from opening_stock_fixture_ids where id = 'line1')$$,
  '42501', null,
  'Even a manager cannot select the raw calculated line total directly'
);
select throws_ok(
  $$select declared_total_pesewas from public.supplier_invoices where id = (select value from opening_stock_fixture_ids where id = 'invoice')$$,
  '42501', null,
  'Even a manager cannot select the raw declared invoice total directly'
);

-- A 15-line, 48-unit, GHS 146,550 fixture verifies reconciliation without any
-- application constant. The declared total is 14,655,000 integer pesewas.
select lives_ok(
  $recon$insert into opening_stock_fixture_ids (id, value)
    select 'reconciliation_invoice', invoice_id
    from public.create_supplier_invoice('00000000-0000-4000-8000-000000000009', 'Fixture Supplier', null, date '2026-11-23', 14655000, 'Declared total reconciliation fixture')$recon$,
  'Manager creates an accurately described invoice without a supplier reference'
);
select is(
  (select supplier_invoice_number from public.opening_stock_invoices_view where id = (select value from opening_stock_fixture_ids where id = 'reconciliation_invoice')),
  null::text, 'The optional supplier invoice reference is stored as null'
);
select lives_ok(
  $recon$insert into opening_stock_fixture_ids (id, value)
    select 'optional_invoice_second', invoice_id
    from public.create_supplier_invoice('00000000-0000-4000-8000-000000000009', 'Second Fixture Supplier', null, date '2026-11-23', 100000, null)$recon$,
  'More than one invoice without a supplier reference is allowed'
);
select throws_ok(
  $recon$select * from public.create_supplier_invoice('00000000-0000-4000-8000-000000000009', 'Invalid Reference Supplier', 'x', date '2026-11-23', 100000, null)$recon$,
  '22023', null,
  'A nonblank but invalid optional supplier reference is rejected'
);
select lives_ok(
  $recon$with added_lines as (
    select added.invoice_line_id
    from generate_series(1, 15) as series(n)
    cross join lateral public.add_supplier_invoice_line(
      (select value from opening_stock_fixture_ids where id = 'reconciliation_invoice'),
      (select value from opening_stock_fixture_ids where id = 'model_catalogue'),
      case when series.n <= 14 then 3 else 6 end,
      case when series.n <= 14 then 300000 else 342500 end,
      null
    ) as added
  )
  select count(*) from added_lines$recon$,
  'Manager adds fifteen invoice lines with forty-eight total units'
);
select is(
  (select line_count from public.opening_stock_invoice_reconciliation_view where invoice_id = (select value from opening_stock_fixture_ids where id = 'reconciliation_invoice')),
  15, 'The reconciliation view reports fifteen invoice lines'
);
select is(
  (select quantity_invoiced from public.opening_stock_invoice_reconciliation_view where invoice_id = (select value from opening_stock_fixture_ids where id = 'reconciliation_invoice')),
  48, 'The reconciliation view reports forty-eight invoiced units'
);
select is(
  (select declared_total_pesewas from public.opening_stock_invoice_reconciliation_view where invoice_id = (select value from opening_stock_fixture_ids where id = 'reconciliation_invoice')),
  14655000::bigint, 'The manager sees the stored GHS 146,550 declared total as integer pesewas'
);
select is(
  (select calculated_total_pesewas from public.opening_stock_invoice_reconciliation_view where invoice_id = (select value from opening_stock_fixture_ids where id = 'reconciliation_invoice')),
  14655000::numeric, 'The manager sees the sum of fifteen calculated line totals before confirmation'
);
select is(
  (select difference_pesewas from public.opening_stock_invoice_reconciliation_view where invoice_id = (select value from opening_stock_fixture_ids where id = 'reconciliation_invoice')),
  0::numeric, 'The calculated and declared totals have zero difference'
);
select ok(
  (select reconciled from public.opening_stock_invoice_reconciliation_view where invoice_id = (select value from opening_stock_fixture_ids where id = 'reconciliation_invoice')),
  'The declared total reconciles with the persisted line totals'
);
select is(
  (select sum(line_total_pesewas) from public.opening_stock_invoice_lines_view where invoice_id = (select value from opening_stock_fixture_ids where id = 'reconciliation_invoice')),
  14655000::numeric, 'Every displayed line total contributes to the calculated invoice total'
);
select throws_ok(
  $recon$select * from public.confirm_supplier_invoice((select value from opening_stock_fixture_ids where id = 'reconciliation_invoice'), 14655000, 15, 48, 14654999, true)$recon$,
  '23514', null,
  'Confirmation rejects an expected calculated total that does not equal persisted line totals'
);
select lives_ok(
  $recon$select * from public.confirm_supplier_invoice((select value from opening_stock_fixture_ids where id = 'reconciliation_invoice'), 14655000, 15, 48, 14655000, true)$recon$,
  'Manager confirms the invoice only after the displayed line totals match its declared total'
);
select ok(
  (select confirmed_at is not null from public.opening_stock_invoice_reconciliation_view where invoice_id = (select value from opening_stock_fixture_ids where id = 'reconciliation_invoice')),
  'Invoice confirmation is persisted and attributed'
);
select is(
  (select count(*)::integer from public.audit_events where action = 'opening_stock.invoice_totals_confirmed' and entity_id = (select value from opening_stock_fixture_ids where id = 'reconciliation_invoice')),
  1, 'Invoice confirmation appends one attributed audit event'
);
select throws_ok(
  $recon$select * from public.confirm_supplier_invoice((select value from opening_stock_fixture_ids where id = 'reconciliation_invoice'), 14655000, 15, 48, 14655000, true)$recon$,
  '23514', null,
  'The same invoice confirmation cannot be replayed'
);
select lives_ok(
  $recon$select * from public.add_supplier_invoice_line((select value from opening_stock_fixture_ids where id = 'reconciliation_invoice'), (select value from opening_stock_fixture_ids where id = 'model_catalogue'), 1, 1, null)$recon$,
  'Adding a line after confirmation remains an audited workflow change'
);
select is(
  (select confirmed_at from public.opening_stock_invoice_reconciliation_view where invoice_id = (select value from opening_stock_fixture_ids where id = 'reconciliation_invoice')),
  null::timestamptz, 'A later line change clears the prior totals confirmation'
);
select ok(
  (select not reconciled from public.opening_stock_invoice_reconciliation_view where invoice_id = (select value from opening_stock_fixture_ids where id = 'reconciliation_invoice')),
  'A later line change requires a fresh declared-total review'
);
select throws_ok(
  $$select cost_pesewas from public.store_inventory limit 1$$,
  '42501', null,
  'Existing inventory acquisition cost remains ungranted'
);

select throws_ok(
  $$select * from public.receive_opening_stock_device((select value from opening_stock_fixture_ids where id = 'line1'), '357000000000017', 'Natural Titanium', 'excellent', 99, (select doc from opening_stock_inspection_fixtures where name = 'valid'))$$,
  '23514', null,
  'Single-device receiving rejects an unconfirmed supplier invoice'
);
select throws_ok(
  $$select * from public.receive_opening_stock_devices((select value from opening_stock_fixture_ids where id = 'line1'), jsonb_build_array(jsonb_build_object('imei','357000000000025','colour','Blue','condition','excellent','battery_health',98,'inspection',(select doc from opening_stock_inspection_fixtures where name = 'valid'))))$$,
  '23514', null,
  'Batch receiving rejects an unconfirmed supplier invoice'
);
select lives_ok(
  $confirm$select * from public.confirm_supplier_invoice((select value from opening_stock_fixture_ids where id = 'invoice'), 4700000, 2, 7, 4700000, true)$confirm$,
  'Confirm supplier invoice totals before receiving devices'
);

select throws_ok(
  $$select * from public.receive_opening_stock_device((select value from opening_stock_fixture_ids where id = 'line1'), '357000000000018', 'Black', 'excellent', 99, (select doc from opening_stock_inspection_fixtures where name = 'valid'))$$,
  '22023', null,
  'Receiving rejects an invalid Luhn check digit'
);
select throws_ok(
  $$select * from public.receive_opening_stock_device((select value from opening_stock_fixture_ids where id = 'line1'), '000000000000000', 'Black', 'excellent', 99, (select doc from opening_stock_inspection_fixtures where name = 'valid'))$$,
  '22023', null,
  'Receiving rejects a Luhn-valid placeholder IMEI'
);
select throws_ok(
  $$select * from public.receive_opening_stock_device((select value from opening_stock_fixture_ids where id = 'line1'), '357000000000025', 'Black', 'excellent', 99, (select doc from opening_stock_inspection_fixtures where name = 'failed_camera'))$$,
  '22023', null,
  'Receiving rejects an incomplete or failed structured inspection'
);
select is((select count(*)::integer from public.opening_stock_units), 0, 'Invalid individual receiving attempts create no staged unit');

select lives_ok(
  $$insert into opening_stock_unit_fixture (label, unit_id, imei)
    select 'individual', unit_id, imei
    from public.receive_opening_stock_device((select value from opening_stock_fixture_ids where id = 'line1'), '357000000000017', 'Natural Titanium', 'excellent', 99, (select doc from opening_stock_inspection_fixtures where name = 'valid'))$$,
  'Manager receives one real inspected device individually'
);
select is((select status from public.opening_stock_units_view where id = (select unit_id from opening_stock_unit_fixture where label = 'individual')), 'staged', 'Received devices are staged');
select is(
  (select count(*)::integer from public.store_inventory inventory join public.inventory_devices device on device.id = inventory.device_id where device.imei = '357000000000017'),
  0, 'Staged devices create no sellable inventory row'
);
select is(
  (select quantity_received from public.opening_stock_invoice_lines_view where id = (select value from opening_stock_fixture_ids where id = 'line1')),
  1, 'Received quantity is separate from invoiced quantity'
);
select is(
  (select quantity_staged from public.opening_stock_invoice_lines_view where id = (select value from opening_stock_fixture_ids where id = 'line1')),
  1, 'Staged quantity is separate from received quantity'
);
select is(
  (select quantity_outstanding from public.opening_stock_invoice_lines_view where id = (select value from opening_stock_fixture_ids where id = 'line1')),
  4, 'Outstanding quantity is invoiced minus physically received'
);

select throws_ok(
  $$select * from public.receive_opening_stock_devices((select value from opening_stock_fixture_ids where id = 'line1'), jsonb_build_array(jsonb_build_object('imei','357000000000025','colour','Blue','condition','excellent','battery_health',98,'inspection',(select doc from opening_stock_inspection_fixtures where name = 'valid')), jsonb_build_object('imei','357000000000034','colour','Blue','condition','excellent','battery_health',98,'inspection',(select doc from opening_stock_inspection_fixtures where name = 'valid'))))$$,
  '22023', null,
  'A batch with one invalid IMEI fails atomically'
);
select throws_ok(
  $$select * from public.receive_opening_stock_devices((select value from opening_stock_fixture_ids where id = 'line1'), jsonb_build_array(jsonb_build_object('imei','357000000000025','colour','Blue','condition','excellent','battery_health',98,'inspection',(select doc from opening_stock_inspection_fixtures where name = 'valid')), jsonb_build_object('imei','357000000000025','colour','Blue','condition','excellent','battery_health',98,'inspection',(select doc from opening_stock_inspection_fixtures where name = 'valid'))))$$,
  '23505', null,
  'A batch with duplicate IMEIs fails atomically'
);
select throws_ok(
  $$select * from public.receive_opening_stock_devices((select value from opening_stock_fixture_ids where id = 'line2'), jsonb_build_array(jsonb_build_object('imei','357000000000058','colour','Blue','condition','excellent','battery_health',98,'inspection',(select doc from opening_stock_inspection_fixtures where name = 'valid')), jsonb_build_object('imei','357000000000066','colour','Blue','condition','excellent','battery_health',98,'inspection',(select doc from opening_stock_inspection_fixtures where name = 'valid')), jsonb_build_object('imei','357000000000074','colour','Blue','condition','excellent','battery_health',98,'inspection',(select doc from opening_stock_inspection_fixtures where name = 'valid'))))$$,
  '23514', null,
  'A batch cannot exceed the outstanding invoice quantity'
);
select throws_ok(
  $$select * from public.receive_opening_stock_devices((select value from opening_stock_fixture_ids where id = 'line1'), jsonb_build_array(jsonb_build_object('imei','357000000000900','colour','Blue','condition','excellent','battery_health',98,'inspection',(select doc from opening_stock_inspection_fixtures where name = 'valid')), jsonb_build_object('imei','357000000001080','colour','White','condition','good','battery_health',91)))$$,
  '22023', null,
  'A batch with one device missing its own inspection fails atomically'
);
select is((select count(*)::integer from public.opening_stock_units), 1, 'Rejected batches leave no partial device rows');

select lives_ok(
  $$insert into opening_stock_unit_fixture (label, unit_id, imei)
    select 'batch_' || row_number() over (order by imei)::text, unit_id, imei
    from public.receive_opening_stock_devices((select value from opening_stock_fixture_ids where id = 'line1'), jsonb_build_array(jsonb_build_object('imei','357000000000025','colour','Blue','condition','excellent','battery_health',98,'inspection',(select doc from opening_stock_inspection_fixtures where name = 'valid_blue')), jsonb_build_object('imei','357000000000033','colour','White','condition','good','battery_health',91,'inspection',(select doc from opening_stock_inspection_fixtures where name = 'valid_white')), jsonb_build_object('imei','357000000000041','colour','Black','condition','excellent','battery_health',96,'inspection',(select doc from opening_stock_inspection_fixtures where name = 'valid'))))$$,
  'Manager receives a valid three-device batch atomically with device-specific details'
);
select is(
  (select colour from public.opening_stock_units_view where imei = '357000000000025'),
  'Blue', 'The first batch device keeps its own colour'
);
select is(
  (select condition from public.opening_stock_units_view where imei = '357000000000033'),
  'good', 'The second batch device keeps its own condition'
);
select is(
  (select battery_health from public.opening_stock_units_view where imei = '357000000000041'),
  96, 'The third batch device keeps its own battery health'
);
select is(
  (select inspection ->> 'notes' from public.opening_stock_units_view where imei = '357000000000025'),
  'Blue device independently inspected', 'The first batch device keeps its own inspection attestation'
);
select is(
  (select inspection ->> 'notes' from public.opening_stock_units_view where imei = '357000000000033'),
  'White device independently inspected', 'The second batch device keeps a different inspection attestation'
);
select is(
  (select quantity_received from public.opening_stock_invoice_lines_view where id = (select value from opening_stock_fixture_ids where id = 'line1')),
  4, 'Received, staged, and outstanding quantities reconcile after batch receipt'
);
select is(
  (select quantity_outstanding from public.opening_stock_invoice_lines_view where id = (select value from opening_stock_fixture_ids where id = 'line1')),
  1, 'One invoiced device remains outstanding after individual and batch receipt'
);

select lives_ok(
  $$select * from public.correct_supplier_invoice_line((select value from opening_stock_fixture_ids where id = 'line2'), 3, 610000, 'Supplier corrected quantity and unit cost')$$,
  'An unreceived invoice line can be corrected with an audited reason'
);
select is(
  (select quantity_invoiced from public.opening_stock_invoice_lines_view where id = (select value from opening_stock_fixture_ids where id = 'line2')),
  3, 'Corrected invoiced quantity is reflected in the progress view'
);
select throws_ok(
  $$select * from public.correct_supplier_invoice_line((select value from opening_stock_fixture_ids where id = 'line2'), 3, 610000, 'No actual changed values')$$,
  '22023', null,
  'A no-op invoice-line correction is rejected'
);
select throws_ok(
  $$select * from public.correct_supplier_invoice_line((select value from opening_stock_fixture_ids where id = 'line2'), 4, 620000, 'x')$$,
  '22023', null,
  'A short correction reason is rejected'
);
select lives_ok(
  $$select * from public.correct_supplier_invoice((select value from opening_stock_fixture_ids where id = 'invoice'), 'Approved Supplier GH', 'OS-2026-001A', date '2026-11-23', 5330000, 'Reissued invoice', 'Supplier reissued invoice with corrected identity')$$,
  'Invoice identity correction is audited'
);
select throws_ok(
  $$select * from public.correct_supplier_invoice((select value from opening_stock_fixture_ids where id = 'invoice'), 'Approved Supplier', 'OS-2026-001A', date '2026-11-23', 5330000, 'Reissued invoice', 'x')$$,
  '22023', null,
  'A short invoice correction reason is rejected'
);
select throws_ok(
  $$select * from public.receive_opening_stock_device((select value from opening_stock_fixture_ids where id = 'line2'), '357000000000058', 'Blue', 'excellent', 98, (select doc from opening_stock_inspection_fixtures where name = 'valid'))$$,
  '23514', null,
  'Receiving is blocked after invoice correction resets confirmation'
);
select lives_ok(
  $confirm$select * from public.confirm_supplier_invoice((select value from opening_stock_fixture_ids where id = 'invoice'), 5330000, 2, 8, 5330000, true)$confirm$,
  'Re-confirm supplier invoice totals after correction before receiving line-two devices'
);

select lives_ok(
  $$insert into opening_stock_unit_fixture (label, unit_id, imei)
    select 'line2_a', unit_id, imei
    from public.receive_opening_stock_device((select value from opening_stock_fixture_ids where id = 'line2'), '357000000000058', 'Blue', 'excellent', 98, (select doc from opening_stock_inspection_fixtures where name = 'valid'))$$,
  'Receive first line-two device'
);
select lives_ok(
  $$insert into opening_stock_unit_fixture (label, unit_id, imei)
    select 'line2_b', unit_id, imei
    from public.receive_opening_stock_device((select value from opening_stock_fixture_ids where id = 'line2'), '357000000000066', 'Blue', 'excellent', 98, (select doc from opening_stock_inspection_fixtures where name = 'valid'))$$,
  'Receive second line-two device'
);
select throws_ok(
  $$select * from public.correct_supplier_invoice_line((select value from opening_stock_fixture_ids where id = 'line2'), 4, 620000, 'Cost correction after physical receipt')$$,
  '23514', null,
  'Purchase cost is immutable after any physical device is received'
);
select throws_ok(
  $$select * from public.correct_supplier_invoice_line((select value from opening_stock_fixture_ids where id = 'line2'), 1, 610000, 'Quantity below received count')$$,
  '23514', null,
  'Corrected quantity cannot drop below physically received devices'
);
select lives_ok(
  $$select * from public.correct_supplier_invoice_line((select value from opening_stock_fixture_ids where id = 'line2'), 4, 610000, 'Supplier added one further device')$$,
  'A quantity increase above received count is allowed and audited'
);
select lives_ok(
  $$select * from public.correct_supplier_invoice((select value from opening_stock_fixture_ids where id = 'invoice'), 'Approved Supplier GH', 'OS-2026-001A', date '2026-11-23', 5940000, 'Reissued invoice', 'Supplier updated declared total for added device')$$,
  'Update declared total after quantity increase'
);
select lives_ok(
  $confirm$select * from public.confirm_supplier_invoice((select value from opening_stock_fixture_ids where id = 'invoice'), 5940000, 2, 9, 5940000, true)$confirm$,
  'Re-confirm supplier invoice totals after quantity increase'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"17000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(
  (select cost_visible from public.opening_stock_invoice_lines_view where id = (select value from opening_stock_fixture_ids where id = 'line1')),
  false, 'A manager-workspace viewer without manage_inventory cannot see purchase cost'
);
select is(
  (select unit_cost_pesewas from public.opening_stock_invoice_lines_view where id = (select value from opening_stock_fixture_ids where id = 'line1')),
  null::bigint, 'The permission-masked view returns null cost to an employee viewer'
);
select is(
  (select line_total_pesewas from public.opening_stock_invoice_lines_view where id = (select value from opening_stock_fixture_ids where id = 'line1')),
  null::bigint, 'The permission-masked view returns null line total without manage_inventory'
);
select is(
  (select declared_total_pesewas from public.opening_stock_invoice_reconciliation_view where invoice_id = (select value from opening_stock_fixture_ids where id = 'reconciliation_invoice')),
  null::bigint, 'The reconciliation view masks the declared total without manage_inventory'
);
select is(
  (select calculated_total_pesewas from public.opening_stock_invoice_reconciliation_view where invoice_id = (select value from opening_stock_fixture_ids where id = 'reconciliation_invoice')),
  null::numeric, 'The reconciliation view masks the calculated total without manage_inventory'
);
select ok(
  (select not reconciled from public.opening_stock_invoice_reconciliation_view where invoice_id = (select value from opening_stock_fixture_ids where id = 'reconciliation_invoice')),
  'The reconciliation view does not expose reconciliation to cost-restricted viewers'
);
select is(
  (select count(*)::integer from public.opening_stock_corrections_view),
  0, 'Correction history containing cost is hidden without manage_inventory'
);
select throws_ok(
  $$select unit_cost_pesewas from public.opening_stock_units limit 1$$,
  '42501', null,
  'Employees cannot select the staged-unit cost column'
);
select throws_ok(
  $$insert into public.supplier_invoices (store_id, supplier_name, supplier_invoice_number, invoice_date, declared_total_pesewas, created_by_user_id, created_by_membership_id, created_by_display_name) values ('00000000-0000-4000-8000-000000000009','Bypass','BYPASS',date '2026-11-23',100000,'17000000-0000-4000-8000-000000000002','27000000-0000-4000-8000-000000000002','Bypass')$$,
  '42501', null,
  'Direct browser-style invoice inserts are denied'
);
select throws_ok(
  $$update public.opening_stock_units set status = 'activated' where id = (select unit_id from opening_stock_unit_fixture where label = 'individual')$$,
  '42501', null,
  'Direct staged-unit activation is denied'
);
select throws_ok(
  $$select * from public.receive_opening_stock_device((select value from opening_stock_fixture_ids where id = 'line1'), '357000000000082', 'Blue', 'excellent', 98, (select doc from opening_stock_inspection_fixtures where name = 'valid'))$$,
  '42501', null,
  'Read-only viewers cannot receive devices'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"17000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*)::integer from public.opening_stock_invoice_lines_view), 0, 'Normal employees see no manager opening-stock rows');
select throws_ok(
  $$select * from public.register_opening_stock_model('00000000-0000-4000-8000-000000000009', 'Employee Bypass', 128, null)$$,
  '42501', null,
  'Normal employees cannot register catalogue models'
);
select throws_ok(
  $$select * from public.activate_opening_stock_unit((select unit_id from opening_stock_unit_fixture where label = 'individual'), 850000, true)$$,
  '42501', null,
  'Normal employees cannot activate staged inventory'
);

set local role anon;
select throws_ok(
  $$select * from public.opening_stock_units_view limit 1$$,
  '42501', null,
  'Anonymous callers cannot read opening-stock views'
);
select throws_ok(
  $$select * from public.opening_stock_invoice_reconciliation_view limit 1$$,
  '42501', null,
  'Anonymous callers cannot read invoice reconciliation'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000006', true);
select set_config('request.jwt.claims', '{"sub":"17000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
select is((select count(*)::integer from public.opening_stock_invoice_lines_view), 0, 'A cross-store manager cannot see store A invoice-line progress');
select is((select count(*)::integer from public.opening_stock_invoice_reconciliation_view), 0, 'A cross-store manager cannot see store A invoice reconciliation');
select throws_ok(
  $$select * from public.activate_opening_stock_unit((select unit_id from opening_stock_unit_fixture where label = 'individual'), 850000, true)$$,
  '42501', null,
  'A cross-store manager cannot activate another store staged unit'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"17000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select lives_ok(
  $$insert into opening_stock_unit_fixture (label, unit_id, imei)
    select 'no_pricing', unit_id, imei
    from public.receive_opening_stock_device((select value from opening_stock_fixture_ids where id = 'line1'), '357000000000074', 'Blue', 'excellent', 98, (select doc from opening_stock_inspection_fixtures where name = 'valid'))$$,
  'A manager without pricing approval can still receive devices'
);
select throws_ok(
  $$select * from public.activate_opening_stock_unit((select unit_id from opening_stock_unit_fixture where label = 'no_pricing'), 850000, true)$$,
  '42501', null,
  'Activation requires effective pricing-approval permission'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claims', '{"sub":"17000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select is(
  (select cost_visible from public.opening_stock_invoice_lines_view where id = (select value from opening_stock_fixture_ids where id = 'line1')),
  false, 'A manager with manage_inventory explicitly overridden off cannot see cost'
);
select throws_ok(
  $$select * from public.receive_opening_stock_device((select value from opening_stock_fixture_ids where id = 'line2'), '357000000000082', 'Blue', 'excellent', 98, (select doc from opening_stock_inspection_fixtures where name = 'valid'))$$,
  '42501', null,
  'A permission override that removes manage_inventory blocks receiving'
);
select throws_ok(
  $recon$select * from public.confirm_supplier_invoice((select value from opening_stock_fixture_ids where id = 'reconciliation_invoice'), 14655000, 16, 49, 14655001, true)$recon$,
  '42501', null,
  'A permission override that removes manage_inventory blocks invoice confirmation'
);

reset role;
insert into public.inventory_devices (device_model_id, imei, colour, condition, battery_health)
values ((select value from opening_stock_fixture_ids where id = 'device_model'), '357000000000025', 'Blue', 'excellent', 98);
select is((select count(*)::integer from public.supplier_invoice_corrections), 4, 'Only successful audited corrections are persisted');
select is((select count(*)::integer from public.audit_events where action in ('opening_stock.invoice_corrected', 'opening_stock.invoice_line_corrected')), 4, 'Every successful correction appends an audit event');
select throws_ok(
  $$update public.supplier_invoice_corrections set reason = 'tampered' where id = (select id from public.supplier_invoice_corrections limit 1)$$,
  'P0001', null,
  'Correction history is append-only'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"17000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.activate_opening_stock_unit((select unit_id from opening_stock_unit_fixture where label = 'batch_1'), 850000, true)$$,
  '23505', null,
  'Activation rejects an IMEI that already exists in physical inventory'
);
select is(
  (select status from public.opening_stock_units_view where id = (select unit_id from opening_stock_unit_fixture where label = 'batch_1')),
  'staged', 'A duplicate IMEI activation leaves its unit staged'
);
select throws_ok(
  $$select * from public.activate_opening_stock_unit((select unit_id from opening_stock_unit_fixture where label = 'individual'), 850000, false)$$,
  '22023', null,
  'Activation requires explicit pricing confirmation'
);
select throws_ok(
  $$select * from public.activate_opening_stock_unit((select unit_id from opening_stock_unit_fixture where label = 'individual'), 0, true)$$,
  '22023', null,
  'Activation requires a positive approved price'
);
select lives_ok(
  $$insert into opening_stock_fixture_ids (id, value)
    select 'inventory', store_inventory_id
    from public.activate_opening_stock_unit((select unit_id from opening_stock_unit_fixture where label = 'individual'), 850000, true)$$,
  'An authorized pricing approver activates one staged unit'
);
select throws_ok(
  $$select * from public.activate_opening_stock_unit((select unit_id from opening_stock_unit_fixture where label = 'individual'), 860000, true)$$,
  '23514', null,
  'Activation cannot be replayed'
);
select is(
  (select status from public.opening_stock_units_view where id = (select unit_id from opening_stock_unit_fixture where label = 'individual')),
  'activated', 'Successful activation persists the activated state'
);
select is(
  (select approved_price_pesewas from public.opening_stock_units_view where id = (select unit_id from opening_stock_unit_fixture where label = 'individual')),
  850000::bigint, 'Successful activation persists the approved selling price'
);
select is(
  (select quantity_activated from public.opening_stock_invoice_lines_view where id = (select value from opening_stock_fixture_ids where id = 'line1')),
  1, 'Activated quantity is separate from received and staged quantities'
);
select is(
  (select quantity_staged from public.opening_stock_invoice_lines_view where id = (select value from opening_stock_fixture_ids where id = 'line1')),
  4, 'Staged quantity excludes activated units'
);
select is(
  (select quantity_outstanding from public.opening_stock_invoice_lines_view where id = (select value from opening_stock_fixture_ids where id = 'line1')),
  0, 'Outstanding quantity is zero when every invoiced device is received'
);

reset role;
insert into opening_stock_fixture_ids (id, value)
select 'inventory_device', device_id from public.store_inventory where id = (select value from opening_stock_fixture_ids where id = 'inventory');
select is(
  (select count(*)::integer from public.inventory_devices where imei = '357000000000017'),
  1, 'Activation creates exactly one physical inventory device'
);
select is(
  (select count(*)::integer from public.store_inventory where id = (select value from opening_stock_fixture_ids where id = 'inventory')),
  1, 'Activation creates exactly one sellable inventory row'
);
select is(
  (select price_pesewas from public.store_inventory where id = (select value from opening_stock_fixture_ids where id = 'inventory')),
  850000::bigint, 'Activated inventory uses the manager-approved price'
);
select is(
  (select cost_pesewas from public.store_inventory where id = (select value from opening_stock_fixture_ids where id = 'inventory')),
  700000::bigint, 'Activated inventory carries the immutable invoice-line purchase cost'
);
select is(
  (select count(*)::integer from public.inventory_movements where store_inventory_id = (select value from opening_stock_fixture_ids where id = 'inventory') and movement_type = 'intake'),
  1, 'Activation appends one intake movement'
);
select is(
  (select count(*)::integer from public.audit_events where entity_id = (select unit_id from opening_stock_unit_fixture where label = 'individual') and action = 'opening_stock.unit_activated'),
  1, 'Activation appends one attributed audit event'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"17000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$insert into opening_stock_reservation_fixture
    select * from public.reserve_inventory_device('00000000-0000-4000-8000-000000000009', (select value from opening_stock_fixture_ids where id = 'inventory_device'), 15)$$,
  'Reserve activated inventory for a repricing-safety test'
);
select is((select result from opening_stock_reservation_fixture), 'reserved', 'The activated device can enter the existing reservation lifecycle');
select throws_ok(
  $$select * from public.reprice_opening_stock_unit((select unit_id from opening_stock_unit_fixture where label = 'individual'), 850000, 875000, 'Approved competitor market adjustment', true)$$,
  '23514', null,
  'Reserved inventory cannot be repriced'
);
select lives_ok(
  $$select * from public.release_inventory_reservation((select reservation_id from opening_stock_reservation_fixture), 'opening stock repricing safety test')$$,
  'Release the test reservation before valid repricing'
);
select throws_ok(
  $$select * from public.reprice_opening_stock_unit((select unit_id from opening_stock_unit_fixture where label = 'individual'), 850000, 850000, 'No actual price change', true)$$,
  '22023', null,
  'Repricing rejects an unchanged price'
);
select throws_ok(
  $$select * from public.reprice_opening_stock_unit((select unit_id from opening_stock_unit_fixture where label = 'individual'), 850000, 875000, 'x', true)$$,
  '22023', null,
  'Repricing requires a meaningful reason'
);
select throws_ok(
  $$select * from public.reprice_opening_stock_unit((select unit_id from opening_stock_unit_fixture where label = 'individual'), 849999, 875000, 'Stale expected price', true)$$,
  '23514', null,
  'Repricing rejects a stale expected price'
);
select throws_ok(
  $$select * from public.reprice_opening_stock_unit((select unit_id from opening_stock_unit_fixture where label = 'individual'), 850000, 875000, 'Approved competitor market adjustment', false)$$,
  '22023', null,
  'Repricing requires explicit approval confirmation'
);
select lives_ok(
  $$insert into opening_stock_fixture_ids (id, value)
    select 'price_change', price_change_id
    from public.reprice_opening_stock_unit((select unit_id from opening_stock_unit_fixture where label = 'individual'), 850000, 875000, 'Approved competitor market adjustment', true)$$,
  'An authorized manager records one approved repricing'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"17000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.reprice_opening_stock_unit((select unit_id from opening_stock_unit_fixture where label = 'individual'), 875000, 900000, 'Employee repricing bypass', true)$$,
  '42501', null,
  'Employees cannot reprice activated inventory'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"17000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.reprice_opening_stock_unit((select unit_id from opening_stock_unit_fixture where label = 'individual'), 875000, 900000, 'Manager without pricing approval', true)$$,
  '42501', null,
  'Managers without pricing approval cannot reprice'
);

reset role;
select is(
  (select price_pesewas from public.store_inventory where id = (select value from opening_stock_fixture_ids where id = 'inventory')),
  875000::bigint, 'Valid repricing updates the existing listed inventory price'
);
select is(
  (select approved_price_pesewas from public.opening_stock_units where id = (select unit_id from opening_stock_unit_fixture where label = 'individual')),
  875000::bigint, 'Valid repricing updates the staged-unit approved price'
);
select is(
  (select cost_pesewas from public.store_inventory where id = (select value from opening_stock_fixture_ids where id = 'inventory')),
  700000::bigint, 'Repricing never changes acquisition cost'
);
select is(
  (select count(*)::integer from public.opening_stock_price_changes where unit_id = (select unit_id from opening_stock_unit_fixture where label = 'individual')),
  1, 'Exactly one immutable price-change record is written'
);
select is(
  (select new_price_pesewas from public.opening_stock_price_changes where unit_id = (select unit_id from opening_stock_unit_fixture where label = 'individual')),
  875000::bigint, 'The price-change ledger records the approved replacement price'
);
select is(
  (select count(*)::integer from public.inventory_movements where store_inventory_id = (select value from opening_stock_fixture_ids where id = 'inventory') and movement_type = 'adjustment'),
  1, 'Repricing appends one adjustment movement'
);
select is(
  (select count(*)::integer from public.audit_events where entity_id = (select unit_id from opening_stock_unit_fixture where label = 'individual') and action = 'opening_stock.unit_repriced'),
  1, 'Repricing appends one attributed audit event'
);
select throws_ok(
  $$update public.opening_stock_price_changes set reason = 'tampered' where id = (select value from opening_stock_fixture_ids where id = 'price_change')$$,
  'P0001', null,
  'Price-change history is append-only'
);
select throws_ok(
  $$delete from public.opening_stock_units where id = (select unit_id from opening_stock_unit_fixture where label = 'individual')$$,
  'P0001', null,
  'Opening-stock units cannot be deleted'
);

select * from finish();
rollback;
