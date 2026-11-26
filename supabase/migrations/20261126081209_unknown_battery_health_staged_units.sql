begin;

-- Unknown battery health for staged units only.
--
-- A handset whose inspection screen reports `Battery Life: No Data` has no
-- measured battery health. Until now every intake path required an integer in
-- 1..100, so recording such a device meant inventing a number. This migration
-- lets a *staged* unit carry `battery_health = null` and nothing else change:
--
--   * staged rows may be null, or an integer in 1..100;
--   * activated rows must carry a measured integer in 1..100;
--   * sellable inventory (`inventory_devices.battery_health`) stays NOT NULL, so
--     activation cannot mint a device without a measurement;
--   * `receive_opening_stock_devices` records the measurement as unknown rather
--     than rejecting the batch;
--   * `record_opening_stock_unit_battery_health` is the only way to fill it in,
--     it is staged-only, it is audited, and it does not bypass any inspection
--     requirement.
--
-- The eight inspection attestations are unchanged and are still mandatory at
-- receiving time. This migration does not relax them.

-- Staged units may record an unknown measurement. Activated units may not.
alter table public.opening_stock_units
  alter column battery_health drop not null;

alter table public.opening_stock_units
  drop constraint opening_stock_units_battery_valid;

-- `battery_health between 1 and 100` is NULL when battery_health is NULL, and a
-- CHECK constraint treats NULL as satisfied. The coalesce is therefore load
-- bearing: without it an activated row could keep an unknown battery.
alter table public.opening_stock_units
  add constraint opening_stock_units_battery_valid check (
    coalesce(
      case status
        when 'staged' then battery_health is null or battery_health between 1 and 100
        when 'activated' then battery_health between 1 and 100
        else false
      end,
      false
    )
  );

-- Receiving accepts an absent measurement. The inspection contract is untouched:
-- `private.is_valid_opening_stock_inspection` still requires all eight passing
-- attestations, and the remaining device fields are still validated exactly as
-- before.
create or replace function public.receive_opening_stock_devices(
  p_invoice_line_id uuid,
  p_devices jsonb
)
returns table (
  unit_id uuid,
  imei text,
  status text,
  quantity_received integer,
  quantity_outstanding integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  caller_membership_id uuid;
  caller_display_name text;
  invoice_record public.supplier_invoices%rowtype;
  line_record public.supplier_invoice_lines%rowtype;
  catalogue_record public.opening_stock_models%rowtype;
  allowed_device_keys text[] := array[
    'imei', 'colour', 'condition', 'battery_health', 'inspection'
  ];
  normalized_devices jsonb;
  device_count integer;
  existing_received integer;
  new_received_count integer;
  new_outstanding integer;
  locked_imei text;
  device_record record;
  new_unit_id uuid;
  new_unit_ids uuid[] := '{}'::uuid[];
  imei_suffixes text[] := '{}'::text[];
  observed_at timestamptz := statement_timestamp();
begin
  if p_devices is null or jsonb_typeof(p_devices) <> 'array' then
    raise exception using errcode = '22023', message = 'device batch must be a JSON array';
  end if;
  device_count := jsonb_array_length(p_devices);
  if device_count not between 1 and 100 then
    raise exception using errcode = '22023', message = 'device batch must contain between 1 and 100 devices';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_devices) as batch_item(value)
    where jsonb_typeof(batch_item.value) <> 'object'
  ) then
    raise exception using errcode = '22023', message = 'each device must be a JSON object';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_devices) as batch_item(value)
    cross join lateral jsonb_object_keys(batch_item.value) as device_key(field_name)
    where not (device_key.field_name = any (allowed_device_keys))
  ) then
    raise exception using errcode = '22023', message = 'device batch contains unsupported fields';
  end if;

  -- An absent, null, blank, or JSON-null measurement becomes SQL null. Anything
  -- else must be a whole number, and out-of-range values are rejected below
  -- rather than silently discarded.
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'imei', private.normalize_opening_stock_imei(batch_item.value ->> 'imei'),
        'colour', btrim(coalesce(batch_item.value ->> 'colour', '')),
        'condition', lower(btrim(coalesce(batch_item.value ->> 'condition', ''))),
        'battery_health', case
          when coalesce(batch_item.value -> 'battery_health', 'null'::jsonb) = 'null'::jsonb
            or btrim(coalesce(batch_item.value ->> 'battery_health', '')) = ''
            then null
          when (batch_item.value ->> 'battery_health') ~ '^[0-9]{1,3}$'
            then (batch_item.value ->> 'battery_health')::integer
          else null
        end,
        'inspection', batch_item.value -> 'inspection'
      )
      order by private.normalize_opening_stock_imei(batch_item.value ->> 'imei')
    ),
    '[]'::jsonb
  )
  into normalized_devices
  from jsonb_array_elements(p_devices) as batch_item(value);

  if (
    select count(*) from jsonb_array_elements(normalized_devices)
  ) <> (
    select count(distinct normalized_item.value ->> 'imei')
    from jsonb_array_elements(normalized_devices) as normalized_item(value)
  ) then
    raise exception using errcode = '23505', message = 'batch contains a duplicate IMEI';
  end if;

  -- A supplied but unparseable measurement is an error; only a genuinely absent
  -- measurement is allowed to mean "unknown".
  if exists (
    select 1
    from jsonb_array_elements(p_devices) as batch_item(value)
    where coalesce(batch_item.value -> 'battery_health', 'null'::jsonb) <> 'null'::jsonb
      and btrim(coalesce(batch_item.value ->> 'battery_health', '')) <> ''
      and (batch_item.value ->> 'battery_health') !~ '^[0-9]{1,3}$'
  ) then
    raise exception using errcode = '22023', message = 'battery health must be a whole percentage or unknown';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(normalized_devices) as normalized_item(value)
    where coalesce(private.is_valid_opening_stock_imei(normalized_item.value ->> 'imei'), false) is not true
      or length(normalized_item.value ->> 'colour') not between 2 and 60
      or (normalized_item.value ->> 'colour') ~ '[[:cntrl:]]'
      or normalized_item.value ->> 'condition' not in ('excellent', 'good', 'fair')
      or (
        coalesce(normalized_item.value ->> 'battery_health', '') <> ''
        and (normalized_item.value ->> 'battery_health')::integer not between 1 and 100
      )
      or coalesce(private.is_valid_opening_stock_inspection(normalized_item.value -> 'inspection'), false) is not true
  ) then
    raise exception using errcode = '22023', message = 'real IMEI and complete passing inspection required';
  end if;

  select line.* into line_record
  from public.supplier_invoice_lines line
  where line.id = p_invoice_line_id;

  if not found then
    raise exception using errcode = '42501', message = 'supplier invoice line not found';
  end if;

  select invoice.* into invoice_record
  from public.supplier_invoices invoice
  where invoice.id = line_record.invoice_id
  for update;

  if not found or invoice_record.store_id <> line_record.store_id then
    raise exception using errcode = '42501', message = 'supplier invoice line store is inconsistent';
  end if;

  select line.* into line_record
  from public.supplier_invoice_lines line
  where line.id = p_invoice_line_id
  for update;

  caller_membership_id := private.opening_stock_actor_membership(line_record.store_id, false);
  caller_display_name := private.opening_stock_actor_name(caller_user_id);

  if invoice_record.status <> 'open' then
    raise exception using errcode = '23514', message = 'closed invoice cannot receive devices';
  end if;

  if invoice_record.confirmed_at is null
    or not private.opening_stock_invoice_reconciled(invoice_record.id) then
    raise exception using errcode = '23514', message = 'supplier invoice totals must be confirmed before receiving devices';
  end if;

  select catalogue.* into catalogue_record
  from public.opening_stock_models catalogue
  where catalogue.id = line_record.model_catalogue_id
    and catalogue.store_id = line_record.store_id;

  if not found or catalogue_record.status <> 'active' then
    raise exception using errcode = '23514', message = 'active model registration required for receiving';
  end if;

  select count(*)::integer into existing_received
  from public.opening_stock_units opening_unit
  where opening_unit.invoice_line_id = line_record.id;

  if existing_received + device_count > line_record.quantity_invoiced then
    raise exception using errcode = '23514', message = 'received quantity cannot exceed invoiced quantity';
  end if;

  -- Lock every IMEI in a deterministic order so concurrent batches and
  -- activations serialize before the cross-table availability check.
  for locked_imei in
    select distinct normalized_item.value ->> 'imei'
    from jsonb_array_elements(normalized_devices) as normalized_item(value)
    order by 1
  loop
    perform private.opening_stock_lock_imei(locked_imei);
    if not private.opening_stock_imei_available(locked_imei) then
      raise exception using errcode = '23505', message = 'IMEI is already recorded';
    end if;
  end loop;

  for device_record in
    select
      normalized_item.value ->> 'imei' as normalized_imei,
      normalized_item.value ->> 'colour' as device_colour,
      normalized_item.value ->> 'condition' as device_condition,
      nullif(normalized_item.value ->> 'battery_health', '')::integer as device_battery_health,
      normalized_item.value -> 'inspection' as inspection_document
    from jsonb_array_elements(normalized_devices) as normalized_item(value)
    order by normalized_item.value ->> 'imei'
  loop
    insert into public.opening_stock_units (
      id, store_id, invoice_line_id, device_model_id, imei, colour, condition,
      battery_health, inspection, unit_cost_pesewas, status,
      received_by_user_id, received_by_membership_id, received_by_display_name,
      received_at, created_at, updated_at
    )
    values (
      gen_random_uuid(), line_record.store_id, line_record.id,
      line_record.device_model_id, device_record.normalized_imei,
      device_record.device_colour, device_record.device_condition,
      device_record.device_battery_health, device_record.inspection_document,
      line_record.unit_cost_pesewas, 'staged',
      caller_user_id, caller_membership_id, caller_display_name,
      observed_at, observed_at, observed_at
    )
    returning id into new_unit_id;

    new_unit_ids := array_append(new_unit_ids, new_unit_id);
    imei_suffixes := array_append(imei_suffixes, right(device_record.normalized_imei, 4));
  end loop;

  new_received_count := existing_received + device_count;
  new_outstanding := line_record.quantity_invoiced - new_received_count;

  perform private.opening_stock_audit(
    line_record.store_id, caller_user_id, caller_membership_id,
    'opening_stock.devices_received', 'supplier_invoice_line', line_record.id,
    jsonb_build_object(
      'invoice_id', line_record.invoice_id,
      'device_count', device_count,
      'quantity_received', new_received_count,
      'quantity_outstanding', new_outstanding,
      'imei_suffixes', to_jsonb(imei_suffixes),
      'unknown_battery_health_count', (
        select count(*)
        from jsonb_array_elements(normalized_devices) as normalized_item(value)
        where coalesce(normalized_item.value ->> 'battery_health', '') = ''
      )
    ),
    observed_at
  );

  return query
  select
    opening_unit.id,
    opening_unit.imei,
    opening_unit.status,
    new_received_count,
    new_outstanding
  from public.opening_stock_units opening_unit
  where opening_unit.id = any (new_unit_ids)
  order by opening_unit.imei;
end;
$$;

-- The single-device wrapper now forwards an absent measurement as unknown.
create or replace function public.receive_opening_stock_device(
  p_invoice_line_id uuid,
  p_imei text,
  p_colour text,
  p_condition text,
  p_battery_health integer,
  p_inspection jsonb
)
returns table (
  unit_id uuid,
  imei text,
  status text,
  quantity_received integer,
  quantity_outstanding integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select *
  from public.receive_opening_stock_devices(
    p_invoice_line_id,
    jsonb_build_array(
      jsonb_build_object(
        'imei', p_imei,
        'colour', p_colour,
        'condition', p_condition,
        'battery_health', p_battery_health,
        'inspection', p_inspection
      )
    )
  );
end;
$$;

-- Activation now proves a measured battery health before it creates sellable
-- inventory. Every other activation guard is unchanged.
create or replace function public.activate_opening_stock_unit(
  p_unit_id uuid,
  p_approved_price_pesewas bigint,
  p_price_confirmed boolean
)
returns table (
  unit_id uuid,
  store_inventory_id uuid,
  status text,
  price_pesewas bigint,
  activated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  caller_membership_id uuid;
  caller_display_name text;
  target_unit public.opening_stock_units%rowtype;
  invoice_record public.supplier_invoices%rowtype;
  line_record public.supplier_invoice_lines%rowtype;
  new_device_id uuid := gen_random_uuid();
  new_inventory_id uuid := gen_random_uuid();
  observed_at timestamptz := statement_timestamp();
begin
  if p_price_confirmed is distinct from true then
    raise exception using errcode = '22023', message = 'manager must confirm approved pricing';
  end if;
  if p_approved_price_pesewas is null
    or p_approved_price_pesewas <= 0
    or p_approved_price_pesewas > 100000000000000 then
    raise exception using errcode = '22023', message = 'approved price must be positive integer pesewas';
  end if;

  select opening_unit.* into target_unit
  from public.opening_stock_units opening_unit
  where opening_unit.id = p_unit_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'opening-stock unit not found';
  end if;

  caller_membership_id := private.opening_stock_actor_membership(target_unit.store_id, true);
  caller_display_name := private.opening_stock_actor_name(caller_user_id);

  if target_unit.status <> 'staged' then
    raise exception using errcode = '23514', message = 'only staged units can be activated';
  end if;
  if coalesce(private.is_valid_opening_stock_inspection(target_unit.inspection), false) is not true
    or coalesce(private.is_valid_opening_stock_imei(target_unit.imei), false) is not true then
    raise exception using errcode = '23514', message = 'stored IMEI or inspection is not eligible for activation';
  end if;

  -- Unknown battery health cannot reach sellable inventory: `inventory_devices`
  -- requires a measurement and employees read it before a sale.
  if target_unit.battery_health is null
    or target_unit.battery_health not between 1 and 100 then
    raise exception using errcode = '23514', message = 'record the measured battery health before activation';
  end if;

  select line.* into line_record
  from public.supplier_invoice_lines line
  where line.id = target_unit.invoice_line_id;

  if not found or line_record.store_id <> target_unit.store_id then
    raise exception using errcode = '42501', message = 'unit invoice line is inconsistent';
  end if;

  select invoice.* into invoice_record
  from public.supplier_invoices invoice
  where invoice.id = line_record.invoice_id
  for share;

  if not found or invoice_record.store_id <> target_unit.store_id then
    raise exception using errcode = '42501', message = 'unit invoice is inconsistent';
  end if;

  select line.* into line_record
  from public.supplier_invoice_lines line
  where line.id = target_unit.invoice_line_id
  for share;

  if not found or line_record.store_id <> target_unit.store_id then
    raise exception using errcode = '42501', message = 'unit invoice line is inconsistent';
  end if;

  perform private.opening_stock_lock_imei(target_unit.imei);
  if not private.opening_stock_imei_available(target_unit.imei, target_unit.id) then
    raise exception using errcode = '23505', message = 'IMEI is already in sellable inventory';
  end if;

  insert into public.inventory_devices (
    id, device_model_id, imei, colour, condition, battery_health,
    created_at, updated_at
  )
  values (
    new_device_id, target_unit.device_model_id, target_unit.imei,
    target_unit.colour, target_unit.condition, target_unit.battery_health,
    observed_at, observed_at
  );

  insert into public.store_inventory (
    id, store_id, device_id, status, cost_pesewas, price_pesewas,
    received_at, created_at, updated_at
  )
  values (
    new_inventory_id, target_unit.store_id, new_device_id, 'available',
    target_unit.unit_cost_pesewas, p_approved_price_pesewas,
    target_unit.received_at, observed_at, observed_at
  );

  insert into public.inventory_movements (
    store_id, store_inventory_id, device_id, movement_type,
    from_status, to_status, actor_user_id, actor_membership_id,
    reason, metadata, occurred_at
  )
  values (
    target_unit.store_id, new_inventory_id, new_device_id, 'intake',
    null, 'available', caller_user_id, caller_membership_id,
    'opening stock activation after approved pricing',
    jsonb_build_object(
      'opening_stock_unit_id', target_unit.id,
      'supplier_invoice_id', invoice_record.id,
      'supplier_invoice_line_id', line_record.id,
      'approved_price_pesewas', p_approved_price_pesewas
    ),
    observed_at
  );

  update public.opening_stock_units
  set status = 'activated',
      approved_price_pesewas = p_approved_price_pesewas,
      inventory_device_id = new_device_id,
      store_inventory_id = new_inventory_id,
      activated_by_user_id = caller_user_id,
      activated_by_membership_id = caller_membership_id,
      activated_by_display_name = caller_display_name,
      activated_at = observed_at,
      updated_at = observed_at
  where id = target_unit.id;

  perform private.opening_stock_audit(
    target_unit.store_id, caller_user_id, caller_membership_id,
    'opening_stock.unit_activated', 'opening_stock_unit', target_unit.id,
    jsonb_build_object(
      'store_inventory_id', new_inventory_id,
      'supplier_invoice_id', invoice_record.id,
      'approved_price_pesewas', p_approved_price_pesewas,
      'imei_suffix', right(target_unit.imei, 4)
    ),
    observed_at
  );

  return query
  select target_unit.id, new_inventory_id, 'activated'::text, p_approved_price_pesewas, observed_at;
end;
$$;

-- The post-receipt immutability trigger treats every physical fact, battery
-- health included, as frozen. A measurement that was unknown at receiving time
-- has to be fillable exactly once, and only while the unit is still staged, so
-- the trigger now permits that single unknown -> measured transition. Every
-- other immutability rule, and every revision of an existing measurement, is
-- unchanged.
create or replace function private.validate_opening_stock_unit_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.store_id is distinct from old.store_id
    or new.invoice_line_id is distinct from old.invoice_line_id
    or new.device_model_id is distinct from old.device_model_id
    or new.imei is distinct from old.imei
    or new.colour is distinct from old.colour
    or new.condition is distinct from old.condition
    or new.inspection is distinct from old.inspection
    or new.unit_cost_pesewas is distinct from old.unit_cost_pesewas
    or new.received_by_user_id is distinct from old.received_by_user_id
    or new.received_by_membership_id is distinct from old.received_by_membership_id
    or new.received_by_display_name is distinct from old.received_by_display_name
    or new.received_at is distinct from old.received_at
    or new.created_at is distinct from old.created_at then
    raise exception using errcode = '23514', message = 'received opening-stock identity is immutable';
  end if;

  -- Battery health is immutable once measured, and always immutable on an
  -- activated unit. The only permitted change is recording the measurement that
  -- receiving recorded as unknown.
  if new.battery_health is distinct from old.battery_health
    and not (
      old.status = 'staged'
      and new.status = 'staged'
      and old.battery_health is null
      and new.battery_health is not null
      and new.battery_health between 1 and 100
    ) then
    raise exception using errcode = '23514', message = 'received opening-stock battery health is immutable once measured';
  end if;

  if old.status = 'staged' and new.status = 'activated' then
    if new.approved_price_pesewas is null
      or new.approved_price_pesewas <= 0
      or new.inventory_device_id is null
      or new.store_inventory_id is null
      or new.activated_by_user_id is null
      or new.activated_by_membership_id is null
      or new.activated_by_display_name is null
      or new.activated_at is null then
      raise exception using errcode = '23514', message = 'activation requires approved pricing and inventory identity';
    end if;
    if new.battery_health is null or new.battery_health not between 1 and 100 then
      raise exception using errcode = '23514', message = 'activation requires a measured battery health';
    end if;
    return new;
  end if;

  if old.status = 'activated' and new.status = 'activated' then
    if new.approved_price_pesewas is null
      or new.approved_price_pesewas <= 0
      or new.approved_price_pesewas = old.approved_price_pesewas then
      raise exception using errcode = '23514', message = 'repricing must record a new positive approved price';
    end if;
    if new.inventory_device_id is distinct from old.inventory_device_id
      or new.store_inventory_id is distinct from old.store_inventory_id
      or new.activated_by_user_id is distinct from old.activated_by_user_id
      or new.activated_by_membership_id is distinct from old.activated_by_membership_id
      or new.activated_by_display_name is distinct from old.activated_by_display_name
      or new.activated_at is distinct from old.activated_at then
      raise exception using errcode = '23514', message = 'activation identity is immutable after repricing';
    end if;
    return new;
  end if;

  -- A staged unit may otherwise only be updated by recording its measurement.
  if old.status = 'staged' and new.status = 'staged' then
    if new.approved_price_pesewas is distinct from old.approved_price_pesewas
      or new.inventory_device_id is distinct from old.inventory_device_id
      or new.store_inventory_id is distinct from old.store_inventory_id
      or new.activated_by_user_id is distinct from old.activated_by_user_id
      or new.activated_by_membership_id is distinct from old.activated_by_membership_id
      or new.activated_by_display_name is distinct from old.activated_by_display_name
      or new.activated_at is distinct from old.activated_at then
      raise exception using errcode = '23514', message = 'staged unit cannot claim activation identity';
    end if;
    return new;
  end if;

  raise exception using errcode = '23514', message = 'invalid opening-stock unit status transition';
end;
$$;

-- Fills in a measurement that was unknown at receiving time.
--
-- This is deliberately narrow: staged units only, one unit per call, and the
-- stored value may only move from unknown to a measured 1..100. It cannot be
-- used to revise an existing measurement, cannot touch an activated unit, and
-- cannot be combined with activation (pricing approval is required separately).
create or replace function public.record_opening_stock_unit_battery_health(
  p_unit_id uuid,
  p_battery_health integer
)
returns table (
  unit_id uuid,
  battery_health integer,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  caller_membership_id uuid;
  target_unit public.opening_stock_units%rowtype;
  observed_at timestamptz := statement_timestamp();
begin
  if p_battery_health is null or p_battery_health not between 1 and 100 then
    raise exception using errcode = '22023', message = 'battery health must be a whole percentage between 1 and 100';
  end if;

  select opening_unit.* into target_unit
  from public.opening_stock_units opening_unit
  where opening_unit.id = p_unit_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'opening-stock unit not found';
  end if;

  caller_membership_id := private.opening_stock_actor_membership(target_unit.store_id, false);

  if target_unit.status <> 'staged' then
    raise exception using errcode = '23514', message = 'battery health can only be recorded on a staged unit';
  end if;
  if target_unit.battery_health is not null then
    raise exception using errcode = '23514', message = 'battery health is already recorded for this unit';
  end if;

  update public.opening_stock_units
  set battery_health = p_battery_health,
      updated_at = observed_at
  where id = target_unit.id;

  perform private.opening_stock_audit(
    target_unit.store_id, caller_user_id, caller_membership_id,
    'opening_stock.unit_battery_health_recorded', 'opening_stock_unit', target_unit.id,
    jsonb_build_object(
      'battery_health', p_battery_health,
      'previous_battery_health', null,
      'imei_suffix', right(target_unit.imei, 4)
    ),
    observed_at
  );

  return query
  select target_unit.id, p_battery_health, target_unit.status;
end;
$$;

revoke all on function public.receive_opening_stock_devices(uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.receive_opening_stock_device(uuid, text, text, text, integer, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.activate_opening_stock_unit(uuid, bigint, boolean) from public, anon, authenticated, service_role;
revoke all on function public.record_opening_stock_unit_battery_health(uuid, integer) from public, anon, authenticated, service_role;

grant execute on function public.receive_opening_stock_devices(uuid, jsonb) to authenticated;
grant execute on function public.receive_opening_stock_device(uuid, text, text, text, integer, jsonb) to authenticated;
grant execute on function public.activate_opening_stock_unit(uuid, bigint, boolean) to authenticated;
grant execute on function public.record_opening_stock_unit_battery_health(uuid, integer) to authenticated;

commit;
