begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.stores (id, code, name)
values ('00000000-0000-4000-8000-000000000002', 'phase-two-store-b', 'Phase Two Store B');

insert into auth.users (id, email, raw_user_meta_data)
values
  ('11000000-0000-4000-8000-000000000001', 'inventory.employee.a@local.test', '{"full_name":"Inventory Employee A"}'::jsonb),
  ('11000000-0000-4000-8000-000000000002', 'inventory.competitor.a@local.test', '{"full_name":"Inventory Competitor A"}'::jsonb),
  ('11000000-0000-4000-8000-000000000003', 'inventory.manager.a@local.test', '{"full_name":"Inventory Manager A"}'::jsonb),
  ('11000000-0000-4000-8000-000000000004', 'inventory.employee.b@local.test', '{"full_name":"Inventory Employee B"}'::jsonb);

insert into public.store_memberships (id, store_id, user_id, role_id, status, joined_at)
values
  (
    '21000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000101',
    'active',
    statement_timestamp()
  ),
  (
    '21000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000101',
    'active',
    statement_timestamp()
  ),
  (
    '21000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000102',
    'active',
    statement_timestamp()
  ),
  (
    '21000000-0000-4000-8000-000000000004',
    '00000000-0000-4000-8000-000000000002',
    '11000000-0000-4000-8000-000000000004',
    '00000000-0000-4000-8000-000000000101',
    'active',
    statement_timestamp()
  );

insert into public.device_models (id, model_name, storage_gb)
values
  ('31000000-0000-4000-8000-000000000001', 'iPhone 15 Pro', 256),
  ('31000000-0000-4000-8000-000000000002', 'iPhone 14', 128);

insert into public.inventory_devices (
  id,
  device_model_id,
  imei,
  colour,
  condition,
  battery_health
)
values
  ('41000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', '358240051111110', 'Natural Titanium', 'excellent', 95),
  ('41000000-0000-4000-8000-000000000002', '31000000-0000-4000-8000-000000000001', '358240051111128', 'Blue Titanium', 'excellent', 93),
  ('41000000-0000-4000-8000-000000000003', '31000000-0000-4000-8000-000000000002', '358240051111136', 'Midnight', 'good', 87),
  ('41000000-0000-4000-8000-000000000004', '31000000-0000-4000-8000-000000000002', '358240051111144', 'Purple', 'good', 85),
  ('41000000-0000-4000-8000-000000000005', '31000000-0000-4000-8000-000000000002', '358240051111151', 'Blue', 'fair', 79),
  ('41000000-0000-4000-8000-000000000006', '31000000-0000-4000-8000-000000000002', '358240051111169', 'Black', 'excellent', 98);

insert into public.store_inventory (
  id,
  store_id,
  device_id,
  cost_pesewas,
  price_pesewas
)
values
  ('51000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000001', 720000, 850000),
  ('51000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000002', 710000, 840000),
  ('51000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000003', 440000, 530000),
  ('51000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000004', 430000, 520000),
  ('51000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000005', 400000, 490000),
  ('51000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000002', '41000000-0000-4000-8000-000000000006', 450000, 550000);

set constraints all immediate;
set constraints all deferred;

select ok(private.is_valid_imei('490154203237518'), 'A 15-digit IMEI with a valid Luhn check digit is accepted');
select ok(not private.is_valid_imei('490154203237519'), 'An IMEI with an invalid Luhn check digit is rejected');
select ok(not private.is_valid_imei('not-an-imei'), 'An arbitrary string is not a valid IMEI');
select throws_ok(
  $$
    insert into public.inventory_devices (
      id, device_model_id, imei, colour, condition, battery_health
    ) values (
      '41000000-0000-4000-8000-000000000099',
      '31000000-0000-4000-8000-000000000001',
      '490154203237519',
      'Invalid',
      'good',
      80
    )
  $$,
  '23514',
  null,
  'The database rejects an invalid IMEI check digit'
);
select throws_ok(
  $$
    insert into public.inventory_devices (
      id, device_model_id, imei, colour, condition, battery_health
    ) values (
      '41000000-0000-4000-8000-000000000098',
      '31000000-0000-4000-8000-000000000001',
      '358240051111110',
      'Duplicate',
      'good',
      80
    )
  $$,
  '23505',
  null,
  'A physical device IMEI is globally unique'
);
select col_type_is('public', 'store_inventory', 'cost_pesewas', 'bigint', 'Inventory cost is stored as integer pesewas');
select col_type_is('public', 'store_inventory', 'price_pesewas', 'bigint', 'Inventory price is stored as integer pesewas');
select throws_ok(
  $$update public.store_inventory set status = 'sold' where id = '51000000-0000-4000-8000-000000000005'$$,
  '23514',
  'invalid inventory status transition: available to sold',
  'An available device cannot skip reservation and transition directly to sold'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is((select count(*)::integer from public.store_inventory), 5, 'Store A employee sees only Store A inventory');
select is((select count(*)::integer from public.inventory_devices), 5, 'Store A employee sees only physical devices assigned to Store A');
select is((select count(*)::integer from public.store_inventory where store_id = '00000000-0000-4000-8000-000000000002'), 0, 'Store A employee cannot read Store B stock');
select throws_ok(
  $$select cost_pesewas from public.store_inventory limit 1$$,
  '42501',
  null,
  'Normal employees cannot read acquisition cost'
);
select throws_ok(
  $$update public.store_inventory set status = 'reserved' where id = '51000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'Employees cannot bypass the reservation RPC with a direct stock update'
);
select throws_ok(
  $$
    insert into public.inventory_reservations (
      store_id, store_inventory_id, device_id, employee_user_id,
      employee_membership_id, expires_at
    ) values (
      '00000000-0000-4000-8000-000000000001',
      '51000000-0000-4000-8000-000000000001',
      '41000000-0000-4000-8000-000000000001',
      '11000000-0000-4000-8000-000000000001',
      '21000000-0000-4000-8000-000000000001',
      statement_timestamp() + interval '15 minutes'
    )
  $$,
  '42501',
  null,
  'Employees cannot insert reservations directly'
);
select is((select count(*)::integer from public.inventory_movements), 0, 'Employees cannot read manager-only inventory history');

select is(
  (
    select result
    from public.reserve_inventory_device(
      '00000000-0000-4000-8000-000000000001',
      '41000000-0000-4000-8000-000000000001',
      15
    )
  ),
  'reserved',
  'An authorized employee can reserve an available device'
);
select is(
  (select status from public.store_inventory where id = '51000000-0000-4000-8000-000000000001'),
  'reserved',
  'Successful reservation changes current stock state to reserved'
);
select is(
  (select count(*)::integer from public.inventory_reservations where device_id = '41000000-0000-4000-8000-000000000001' and status = 'active'),
  1,
  'Successful reservation creates one active reservation owned by the employee'
);

select is(
  (
    select result
    from public.reserve_inventory_device(
      '00000000-0000-4000-8000-000000000001',
      '41000000-0000-4000-8000-000000000002',
      15
    )
  ),
  'reserved',
  'The first competing employee reserves the second device'
);

reset role;
create temporary table phase_two_test_context (
  key text primary key,
  value uuid not null
);
insert into phase_two_test_context (key, value)
select 'reservation_one', id
from public.inventory_reservations
where device_id = '41000000-0000-4000-8000-000000000001'
  and status = 'active';
grant select on phase_two_test_context to authenticated;
set constraints all immediate;
set constraints all deferred;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(
  (
    select result
    from public.reserve_inventory_device(
      '00000000-0000-4000-8000-000000000001',
      '41000000-0000-4000-8000-000000000002',
      15
    )
  ),
  'already_reserved',
  'A competing reservation attempt receives an already-reserved result'
);
select is(
  (select count(*)::integer from public.inventory_reservations where device_id = '41000000-0000-4000-8000-000000000002'),
  0,
  'RLS does not reveal another employee reservation to the competing employee'
);
select throws_ok(
  format(
    'select * from public.release_inventory_reservation(%L::uuid, %L)',
    (select value from phase_two_test_context where key = 'reservation_one'),
    'competitor release attempt'
  ),
  '42501',
  null,
  'An employee cannot release another employee reservation'
);

reset role;
select is(
  (select count(*)::integer from public.inventory_reservations where device_id = '41000000-0000-4000-8000-000000000002' and status = 'active'),
  1,
  'Only one active reservation exists after two competing attempts'
);
select is(
  (select employee_user_id from public.inventory_reservations where device_id = '41000000-0000-4000-8000-000000000002' and status = 'active'),
  '11000000-0000-4000-8000-000000000001'::uuid,
  'The first employee remains the reservation owner'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(
  (
    select result
    from public.reserve_inventory_device(
      '00000000-0000-4000-8000-000000000001',
      '41000000-0000-4000-8000-000000000002',
      15
    )
  ),
  'already_reserved_by_caller',
  'Retrying the same reservation is idempotent for its owner'
);

select is(
  (
    select result
    from public.reserve_inventory_device(
      '00000000-0000-4000-8000-000000000001',
      '41000000-0000-4000-8000-000000000003',
      15
    )
  ),
  'reserved',
  'An expiry test reservation is created through the trusted RPC'
);

reset role;
update public.inventory_reservations
set created_at = clock_timestamp() - interval '2 minutes',
    expires_at = clock_timestamp() - interval '1 minute'
where device_id = '41000000-0000-4000-8000-000000000003'
  and status = 'active';

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(
  public.expire_inventory_reservations('00000000-0000-4000-8000-000000000001', 10),
  1,
  'An authorized store member can expire one elapsed reservation'
);
select is(
  (select status from public.store_inventory where id = '51000000-0000-4000-8000-000000000003'),
  'available',
  'Expiring a reservation atomically returns the device to available'
);

select is(
  (
    select result
    from public.reserve_inventory_device(
      '00000000-0000-4000-8000-000000000001',
      '41000000-0000-4000-8000-000000000005',
      15
    )
  ),
  'reserved',
  'An employee can reserve a device before releasing it'
);
select is(
  (
    select result
    from public.release_inventory_reservation(
      (
        select id
        from public.inventory_reservations
        where device_id = '41000000-0000-4000-8000-000000000005'
          and status = 'active'
      ),
      'customer selected another device'
    )
  ),
  'released',
  'An employee can release their own active reservation'
);
select is(
  (select status from public.store_inventory where id = '51000000-0000-4000-8000-000000000005'),
  'available',
  'Releasing a reservation atomically returns the device to available'
);

reset role;
insert into public.inventory_reservations (
  id,
  store_id,
  store_inventory_id,
  device_id,
  employee_user_id,
  employee_membership_id,
  status,
  created_at,
  expires_at
)
values (
  '61000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000004',
  '41000000-0000-4000-8000-000000000004',
  '11000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  'active',
  clock_timestamp() - interval '5 minutes',
  clock_timestamp() + interval '10 minutes'
);
update public.store_inventory
set status = 'reserved'
where id = '51000000-0000-4000-8000-000000000004';
insert into public.inventory_movements (
  store_id, store_inventory_id, device_id, reservation_id, movement_type,
  from_status, to_status, actor_user_id, actor_membership_id, reason
)
values (
  '00000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000004',
  '41000000-0000-4000-8000-000000000004',
  '61000000-0000-4000-8000-000000000004',
  'reserved',
  'available',
  'reserved',
  '11000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  'sold-state fixture reservation'
);
update public.inventory_reservations
set status = 'fulfilled',
    ended_at = clock_timestamp(),
    ended_by_user_id = '11000000-0000-4000-8000-000000000003',
    ended_by_membership_id = '21000000-0000-4000-8000-000000000003',
    end_reason = 'sold-state fixture fulfilled'
where id = '61000000-0000-4000-8000-000000000004';
update public.store_inventory
set status = 'sold'
where id = '51000000-0000-4000-8000-000000000004';
insert into public.inventory_movements (
  store_id, store_inventory_id, device_id, reservation_id, movement_type,
  from_status, to_status, actor_user_id, actor_membership_id, reason
)
values (
  '00000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000004',
  '41000000-0000-4000-8000-000000000004',
  '61000000-0000-4000-8000-000000000004',
  'sold',
  'reserved',
  'sold',
  '11000000-0000-4000-8000-000000000003',
  '21000000-0000-4000-8000-000000000003',
  'sold-state fixture completed'
);
set constraints all immediate;
set constraints all deferred;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(
  (
    select result
    from public.reserve_inventory_device(
      '00000000-0000-4000-8000-000000000001',
      '41000000-0000-4000-8000-000000000004',
      15
    )
  ),
  'sold',
  'A sold device returns a clear sold result and cannot be reserved'
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
  '21000000-0000-4000-8000-000000000002',
  permission.id,
  false,
  'Phase two denied reservation test',
  '11000000-0000-4000-8000-000000000003'
from public.permissions permission
where permission.code = 'reserve_inventory';

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$
    select *
    from public.reserve_inventory_device(
      '00000000-0000-4000-8000-000000000001',
      '41000000-0000-4000-8000-000000000003',
      15
    )
  $$,
  '42501',
  null,
  'An explicit permission denial blocks reservation'
);

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is((select count(*)::integer from public.store_inventory), 1, 'Store B employee sees only Store B inventory');
select throws_ok(
  $$
    select *
    from public.reserve_inventory_device(
      '00000000-0000-4000-8000-000000000001',
      '41000000-0000-4000-8000-000000000003',
      15
    )
  $$,
  '42501',
  null,
  'A Store B employee cannot reserve Store A inventory'
);

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select ok((select count(*) from public.inventory_movements) >= 7, 'Inventory managers can read append-only store movement history');
select is(
  (
    select result
    from public.release_inventory_reservation(
      (select value from phase_two_test_context where key = 'reservation_one'),
      'manager released employee reservation'
    )
  ),
  'released',
  'A manager with manage_inventory can release another employee reservation'
);

reset role;
set constraints all immediate;
set constraints all deferred;
select is(
  (select status from public.store_inventory where id = '51000000-0000-4000-8000-000000000001'),
  'available',
  'Manager release keeps reservation and inventory status consistent'
);
select throws_ok(
  $$update public.inventory_movements set reason = 'rewritten history' where id = (select id from public.inventory_movements limit 1)$$,
  'P0001',
  'inventory movements are append-only',
  'Inventory history cannot be silently updated'
);
select throws_ok(
  $$delete from public.inventory_movements where id = (select id from public.inventory_movements limit 1)$$,
  'P0001',
  'inventory movements are append-only',
  'Inventory history cannot be deleted'
);
select throws_ok(
  $$delete from public.inventory_reservations where id = (select id from public.inventory_reservations limit 1)$$,
  'P0001',
  'inventory reservations cannot be deleted',
  'Reservation lifecycle records cannot be deleted'
);
select ok(
  (select count(*) from public.audit_events where action in (
    'inventory.reserved',
    'inventory.reservation_released',
    'inventory.reservation_expired'
  )) >= 6,
  'Reservation lifecycle operations append actor-attributed audit events'
);
select ok(
  not exists (
    select 1
    from public.store_inventory inventory
    left join public.inventory_reservations reservation
      on reservation.store_inventory_id = inventory.id
     and reservation.status = 'active'
    group by inventory.id, inventory.status
    having
      (inventory.status = 'reserved' and count(reservation.id) <> 1)
      or (inventory.status <> 'reserved' and count(reservation.id) <> 0)
  ),
  'Final inventory status and active reservation state are consistent'
);

select * from finish();
rollback;
