begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Store, roles and memberships -------------------------------------------------
--
-- Two stores prove that a manager in store A can never retire a line in store B,
-- and the employee membership proves the permission gate still applies.

insert into public.stores (id, code, name)
values
  ('00000000-0000-4000-8000-000000000011', 'line-removal-a', 'Line Removal A'),
  ('00000000-0000-4000-8000-000000000012', 'line-removal-b', 'Line Removal B');

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('18000000-0000-4000-8000-000000000001', 'line.removal.manager.a@local.test', statement_timestamp(), '{"full_name":"Line Removal Manager A"}'),
  ('18000000-0000-4000-8000-000000000002', 'line.removal.employee@local.test', statement_timestamp(), '{"full_name":"Line Removal Employee"}'),
  ('18000000-0000-4000-8000-000000000003', 'line.removal.manager.b@local.test', statement_timestamp(), '{"full_name":"Line Removal Manager B"}');

insert into public.store_memberships (id, store_id, user_id, role_id, status, joined_at)
values
  ('28000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000011', '18000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000102', 'active', statement_timestamp()),
  ('28000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000011', '18000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000101', 'active', statement_timestamp()),
  ('28000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000012', '18000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000102', 'active', statement_timestamp());

create temp table line_removal_fixture_ids (id text primary key, value uuid not null);
grant select, insert on line_removal_fixture_ids to authenticated;

-- Structural guarantees --------------------------------------------------------

select has_function(
  'public', 'remove_supplier_invoice_line', array['uuid', 'text'],
  'The audited line-removal RPC exists'
);
select has_column(
  'public', 'supplier_invoice_lines', 'removed_at',
  'A retired line is marked rather than deleted, so the append-only ledger keeps its reference'
);
select has_column(
  'public', 'supplier_invoice_lines', 'removal_reason',
  'A removal always carries its reason'
);
select ok(
  not has_function_privilege('anon', 'public.remove_supplier_invoice_line(uuid, text)', 'execute'),
  'Anonymous callers cannot remove invoice lines'
);
select ok(
  has_function_privilege('authenticated', 'public.remove_supplier_invoice_line(uuid, text)', 'execute'),
  'Authenticated managers may call the removal RPC'
);
select ok(
  not has_table_privilege('authenticated', 'public.supplier_invoice_lines', 'delete'),
  'No client role holds a delete grant on invoice lines, so removal must go through the RPC'
);
-- `opening_stock_invoice_lines_view` is security_invoker, so its
-- `removed_at is null` predicate is evaluated with the caller's privileges. Without
-- this column grant every manager read of the line view fails with "permission
-- denied for table supplier_invoice_lines".
select ok(
  has_column_privilege('authenticated', 'public.supplier_invoice_lines', 'removed_at', 'select'),
  'Readers hold the column privilege the security_invoker line view needs for its own predicate'
);
select ok(
  not has_column_privilege('authenticated', 'public.supplier_invoice_lines', 'removal_reason', 'select'),
  'The removal reason is not readable straight off the table'
);
select ok(
  not has_column_privilege('authenticated', 'public.supplier_invoice_lines', 'unit_cost_pesewas', 'select'),
  'Granting the retirement marker does not widen access to purchase cost'
);

set constraints all immediate;
set constraints all deferred;

-- Manager of store A -----------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '18000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"18000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$insert into line_removal_fixture_ids (id, value)
    select 'model', model_catalogue_id
    from public.register_opening_stock_model('00000000-0000-4000-8000-000000000011', 'Removal Test iPhone', 256, 'RM-IPH-256')$$,
  'Manager registers a catalogue model'
);
select lives_ok(
  $$insert into line_removal_fixture_ids (id, value)
    select 'invoice', invoice_id
    from public.create_supplier_invoice('00000000-0000-4000-8000-000000000011', 'Removal Supplier', 'RM-001', date '2026-11-24', 1800000, 'Removal fixture')$$,
  'Manager creates an invoice declaring GHS 18,000'
);
select lives_ok(
  $$insert into line_removal_fixture_ids (id, value)
    select 'line_a', invoice_line_id
    from public.add_supplier_invoice_line((select value from line_removal_fixture_ids where id = 'invoice'), (select value from line_removal_fixture_ids where id = 'model'), 5, 200000, 'Line A')$$,
  'Manager adds line A: 5 units at GHS 2,000'
);
select lives_ok(
  $$insert into line_removal_fixture_ids (id, value)
    select 'line_b', invoice_line_id
    from public.add_supplier_invoice_line((select value from line_removal_fixture_ids where id = 'invoice'), (select value from line_removal_fixture_ids where id = 'model'), 2, 400000, 'Line B')$$,
  'Manager adds line B: 2 units at GHS 4,000'
);

-- 5 × 200,000 + 2 × 400,000 = 1,800,000 pesewas, matching the declared total.
select ok(
  private.opening_stock_invoice_reconciled((select value from line_removal_fixture_ids where id = 'invoice')),
  'The invoice reconciles before any line is removed'
);
select lives_ok(
  $$select * from public.confirm_supplier_invoice(
      (select value from line_removal_fixture_ids where id = 'invoice'),
      1800000, 2, 7, 1800000, true)$$,
  'Manager confirms the reconciled totals'
);
select ok(
  (select confirmed_at is not null from public.supplier_invoices where id = (select value from line_removal_fixture_ids where id = 'invoice')),
  'The invoice is confirmed and ready for receiving'
);

select throws_ok(
  $$select * from public.remove_supplier_invoice_line((select value from line_removal_fixture_ids where id = 'line_b'), 'x')$$,
  '22023', 'valid correction reason required',
  'A removal without a meaningful reason is rejected'
);
select lives_ok(
  $$select * from public.remove_supplier_invoice_line((select value from line_removal_fixture_ids where id = 'line_b'), '   Supplier withdrew the accessory line   ')$$,
  'A reason with surrounding whitespace is accepted once trimmed'
);
select ok(
  (select removed_at is not null from public.supplier_invoice_lines where id = (select value from line_removal_fixture_ids where id = 'line_b')),
  'The trimmed reason removed line B'
);

-- Reset the fixture so the remaining assertions run against a fresh invoice.
select lives_ok(
  $$insert into line_removal_fixture_ids (id, value)
    select 'invoice2', invoice_id
    from public.create_supplier_invoice('00000000-0000-4000-8000-000000000011', 'Removal Supplier', 'RM-002', date '2026-11-24', 1800000, 'Removal fixture two')$$,
  'Manager creates a second invoice for the main assertions'
);
select lives_ok(
  $$insert into line_removal_fixture_ids (id, value)
    select 'line_c', invoice_line_id
    from public.add_supplier_invoice_line((select value from line_removal_fixture_ids where id = 'invoice2'), (select value from line_removal_fixture_ids where id = 'model'), 5, 200000, 'Line C')$$,
  'Second invoice gets line C'
);
select lives_ok(
  $$insert into line_removal_fixture_ids (id, value)
    select 'line_d', invoice_line_id
    from public.add_supplier_invoice_line((select value from line_removal_fixture_ids where id = 'invoice2'), (select value from line_removal_fixture_ids where id = 'model'), 2, 400000, 'Line D')$$,
  'Second invoice gets line D'
);
select lives_ok(
  $$select * from public.confirm_supplier_invoice(
      (select value from line_removal_fixture_ids where id = 'invoice2'),
      1800000, 2, 7, 1800000, true)$$,
  'Second invoice is confirmed'
);

select lives_ok(
  $$select * from public.remove_supplier_invoice_line(
      (select value from line_removal_fixture_ids where id = 'line_d'),
      'Supplier withdrew this model from the delivery')$$,
  'Manager removes unreceived line D with a reason'
);
select ok(
  (select confirmed_at is null from public.supplier_invoices where id = (select value from line_removal_fixture_ids where id = 'invoice2')),
  'Removing a line resets the invoice confirmation'
);
select is(
  (select count(*)::integer from public.opening_stock_invoice_lines_view
   where invoice_id = (select value from line_removal_fixture_ids where id = 'invoice2')),
  1,
  'The retired line disappears from the invoice line view'
);
select is(
  private.opening_stock_invoice_total((select value from line_removal_fixture_ids where id = 'invoice2')),
  1000000::numeric,
  'The invoice total excludes the retired line'
);
select is(
  (select unit_cost_pesewas from public.opening_stock_invoice_lines_view
   where id = (select value from line_removal_fixture_ids where id = 'line_c')),
  200000::bigint,
  'The surviving line keeps its integer-pesewa unit cost'
);
select is(
  (select count(*)::integer from public.supplier_invoice_corrections
   where invoice_id = (select value from line_removal_fixture_ids where id = 'invoice2')
     and reason = 'Supplier withdrew this model from the delivery'),
  1,
  'The removal is recorded in the append-only correction ledger with its reason'
);
select is(
  (select entity_type from public.supplier_invoice_corrections
   where invoice_id = (select value from line_removal_fixture_ids where id = 'invoice2')),
  'invoice_line',
  'The ledger entry is attributed to the removed line'
);
select is(
  (select (after_data ->> 'removed')::boolean from public.supplier_invoice_corrections
   where invoice_id = (select value from line_removal_fixture_ids where id = 'invoice2')),
  true,
  'The ledger entry records that the line was removed'
);
select is(
  (select (before_data ->> 'quantity_invoiced')::integer from public.supplier_invoice_corrections
   where invoice_id = (select value from line_removal_fixture_ids where id = 'invoice2')),
  2,
  'The ledger keeps the removed line snapshot for audit'
);
select is(
  (select actor_display_name from public.supplier_invoice_corrections
   where invoice_id = (select value from line_removal_fixture_ids where id = 'invoice2')),
  'Line Removal Manager A',
  'The ledger attributes the removal to the acting manager'
);
select is(
  (select count(*)::integer from public.audit_events
   where entity_type = 'supplier_invoice_line'
     and action = 'opening_stock.invoice_line_removed'
     and store_id = '00000000-0000-4000-8000-000000000011'),
  2,
  'A dedicated audit event is emitted for each removal'
);
-- The removal bookkeeping is deliberately not part of the column-level select
-- grant, so these two assertions run with the migrating role.
reset role;
select is(
  (select removal_reason from public.supplier_invoice_lines
   where id = (select value from line_removal_fixture_ids where id = 'line_d')),
  'Supplier withdrew this model from the delivery',
  'The retired row retains its own removal reason'
);
select is(
  (select line_number from public.supplier_invoice_lines
   where id = (select value from line_removal_fixture_ids where id = 'line_d')),
  2,
  'Stored line numbers are immutable, so a removal can never collide with the unique numbering constraint'
);
select is(
  (select line_number from public.opening_stock_invoice_lines_view
   where id = (select value from line_removal_fixture_ids where id = 'line_c')),
  1,
  'The view derives the displayed numbering, so a removal leaves no gap'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '18000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"18000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$select * from public.remove_supplier_invoice_line(
      (select value from line_removal_fixture_ids where id = 'line_d'),
      'Trying to remove the same line twice')$$,
  '23514', 'invoice line is already removed',
  'A retired line cannot be retired twice'
);
select throws_ok(
  $$select * from public.remove_supplier_invoice_line(
      (select value from line_removal_fixture_ids where id = 'line_c'),
      'Trying to remove the only remaining line')$$,
  '23514', 'the last invoice line cannot be removed; close the invoice instead',
  'An invoice can never be left with no lines'
);

--------------------------------------------------------------------------------
-- A line with physical devices can never be retired.
--------------------------------------------------------------------------------
select lives_ok(
  $$insert into line_removal_fixture_ids (id, value)
    select 'invoice3', invoice_id
    from public.create_supplier_invoice('00000000-0000-4000-8000-000000000011', 'Removal Supplier', 'RM-003', date '2026-11-24', 800000, 'Receipt guard fixture')$$,
  'Manager creates the receipt-guard invoice'
);
select lives_ok(
  $$insert into line_removal_fixture_ids (id, value)
    select 'line_e', invoice_line_id
    from public.add_supplier_invoice_line((select value from line_removal_fixture_ids where id = 'invoice3'), (select value from line_removal_fixture_ids where id = 'model'), 1, 400000, 'Line E')$$,
  'Receipt-guard invoice gets a single line'
);
select lives_ok(
  $$insert into line_removal_fixture_ids (id, value)
    select 'line_f', invoice_line_id
    from public.add_supplier_invoice_line((select value from line_removal_fixture_ids where id = 'invoice3'), (select value from line_removal_fixture_ids where id = 'model'), 1, 400000, 'Line F')$$,
  'Receipt-guard invoice gets a second line'
);
-- Declared total is 800,000 pesewas: two lines at 400,000.
select lives_ok(
  $$select * from public.confirm_supplier_invoice(
      (select value from line_removal_fixture_ids where id = 'invoice3'),
      800000, 2, 2, 800000, true)$$,
  'Receipt-guard invoice totals are confirmed'
);
select lives_ok(
  $$select * from public.receive_opening_stock_devices(
      (select value from line_removal_fixture_ids where id = 'line_e'),
      jsonb_build_array(jsonb_build_object(
        'imei', '352099104567819',
        'colour', 'Midnight',
        'condition', 'good',
        'battery_health', 91,
        'inspection', '{"imei_confirmed_physical":true,"identity_labels_match":true,"display_passed":true,"cameras_passed":true,"buttons_passed":true,"connectivity_passed":true,"charging_port_passed":true,"activation_lock_cleared":true,"notes":"Independently inspected"}'::jsonb
      )))$$,
  'A real device is received against line E'
);
select throws_ok(
  $$select * from public.remove_supplier_invoice_line(
      (select value from line_removal_fixture_ids where id = 'line_e'),
      'Trying to remove a line that already holds a device')$$,
  '23514', 'invoice line cannot be removed after devices are received',
  'Physical stock prevents the line from being retired'
);

--------------------------------------------------------------------------------
-- Cross-store isolation: a manager in store B cannot touch store A's line.
--------------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '18000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"18000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

select throws_ok(
  $$select * from public.remove_supplier_invoice_line(
      (select value from line_removal_fixture_ids where id = 'line_c'),
      'Manager from another store attempting removal')$$,
  '42501', null,
  'A manager in another store cannot retire this line'
);

--------------------------------------------------------------------------------
-- Role isolation: an employee cannot remove a line.
--------------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '18000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"18000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select throws_ok(
  $$select * from public.remove_supplier_invoice_line(
      (select value from line_removal_fixture_ids where id = 'line_c'),
      'Employee attempting an unpermitted removal')$$,
  '42501', null,
  'An employee without inventory authority cannot retire a line'
);

--------------------------------------------------------------------------------
-- Closed invoices are read-only.
--------------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '18000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"18000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

reset role;
update public.supplier_invoices
set status = 'closed', closed_at = statement_timestamp()
where id = (select value from line_removal_fixture_ids where id = 'invoice2');
set local role authenticated;

select throws_ok(
  $$select * from public.remove_supplier_invoice_line(
      (select value from line_removal_fixture_ids where id = 'line_c'),
      'Attempting a removal on a closed invoice')$$,
  '23514', 'closed invoice line cannot be removed',
  'A closed invoice is immutable'
);

--------------------------------------------------------------------------------
-- The append-only ledger cannot be rewritten to hide a removal.
--------------------------------------------------------------------------------
reset role;
select throws_ok(
  $$update public.supplier_invoice_corrections
    set reason = 'Rewritten reason'
    where invoice_id = (select value from line_removal_fixture_ids where id = 'invoice2')$$,
  null, null,
  'The correction ledger stays append-only'
);
select throws_ok(
  $$delete from public.supplier_invoice_corrections
    where invoice_id = (select value from line_removal_fixture_ids where id = 'invoice2')$$,
  null, null,
  'A correction row can never be deleted'
);

select * from finish();
rollback;
