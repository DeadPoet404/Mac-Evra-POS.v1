begin;

-- Pending-inspection staging for opening-stock intake.
--
-- The intake workflow required all eight physical-inspection attestations and a
-- known cosmetic condition before a unit could be received at all. That forced
-- an operator to either lie about checks they had not performed or leave a
-- physically-present handset unrecorded. This migration lets a received unit be
-- *staged* while its inspection is genuinely incomplete, and keeps every gate
-- that matters for sellable stock exactly as strict as it was.
--
-- What changes:
--
--   * `condition` may be null on a staged unit, meaning "not yet assessed". The
--     vocabulary for a recorded value is unchanged (excellent/good/fair).
--   * `inspection` may be a partial attestation document on a staged unit. Only
--     keys from the fixed eight-plus-notes vocabulary are allowed, and any value
--     present must be a boolean or null -- so a check can be recorded `true`,
--     `false`, or left absent, but never faked with a truthy string.
--   * `receive_opening_stock_devices` stages such units and reports the missing
--     fields instead of aborting the batch.
--
-- What deliberately does NOT change:
--
--   * `private.is_valid_opening_stock_inspection` still requires all eight
--     attestations to be literally true. It is what activation calls.
--   * Activation still refuses: incomplete inspection, null/failed battery
--     health, and (via `inventory_devices.condition` NOT NULL + its CHECK) a
--     unit whose cosmetic condition was never recorded.
--   * IMEI validation, invoice reconciliation, line capacity, duplicate-IMEI
--     rejection, audit logging and append-only ledger rules are untouched.
--   * Activation also requires `condition` to be recorded, added here, because a
--     staged row can now legitimately carry null and the partial inspection
--     contract alone would not catch it.

-- Staged units may record an assessment that has not happened yet. Activated
-- units must carry a real value; the `opening_stock_units_activation_consistent`
-- constraint and the activation trigger enforce the status-dependent shape.
alter table public.opening_stock_units
  alter column condition drop not null;

alter table public.opening_stock_units
  drop constraint opening_stock_units_condition_valid;

alter table public.opening_stock_units
  add constraint opening_stock_units_condition_valid check (
    coalesce(
      case status
        when 'staged' then condition is null or condition in ('excellent', 'good', 'fair')
        when 'activated' then condition in ('excellent', 'good', 'fair')
        else false
      end,
      false
    )
  );

-- Structural validation for a partial inspection document. This says only that
-- the document is well formed; it says nothing about whether the checks passed.
-- `private.is_valid_opening_stock_inspection` remains the activation contract.
-- The table-level CHECK has to move to this weaker predicate or a partially
-- inspected row can never be inserted in the first place.
create or replace function private.is_well_formed_opening_stock_inspection(inspection jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce((
    inspection is not null
    and jsonb_typeof(inspection) = 'object'
    and not exists (
      select 1
      from jsonb_object_keys(inspection) as inspection_key(field_name)
      where inspection_key.field_name not in (
        'imei_confirmed_physical',
        'identity_labels_match',
        'display_passed',
        'cameras_passed',
        'buttons_passed',
        'connectivity_passed',
        'charging_port_passed',
        'activation_lock_cleared',
        'notes'
      )
    )
    and not exists (
      select 1
      from jsonb_each(inspection) as inspection_field(field_name, field_value)
      where inspection_field.field_name <> 'notes'
        and jsonb_typeof(inspection_field.field_value) not in ('boolean', 'null')
    )
    and (
      not inspection ? 'notes'
      or jsonb_typeof(inspection -> 'notes') in ('string', 'null')
    )
    and (
      not inspection ? 'notes'
      or inspection -> 'notes' = 'null'::jsonb
      or (
        jsonb_typeof(inspection -> 'notes') = 'string'
        and length(inspection ->> 'notes') <= 500
        and (inspection ->> 'notes') !~ '[[:cntrl:]]'
      )
    )
  ), false);
$$;

-- The table CHECK must accept a partially inspected staged row. It validates
-- structure only; the eight-attestation contract is enforced by activation via
-- `private.is_valid_opening_stock_inspection`, and by receiving for any device
-- that claims to be fully inspected.
alter table public.opening_stock_units
  drop constraint opening_stock_units_inspection_valid;

alter table public.opening_stock_units
  add constraint opening_stock_units_inspection_valid check (
    coalesce(
      case status
        when 'staged' then private.is_well_formed_opening_stock_inspection(inspection)
        when 'activated' then private.is_valid_opening_stock_inspection(inspection)
        else false
      end,
      false
    )
  );

-- Receiving accepts a partial inspection and an unassessed cosmetic condition.
-- A device that *does* report everything passing is checked with the strict
-- validator, so the fully-inspected path is byte-for-byte as strict as before.
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
  caller_membership_id uuid := private.opening_stock_recipient_membership(
    p_invoice_line_id
  );
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
        'condition', nullif(lower(btrim(coalesce(batch_item.value ->> 'condition', ''))), ''),
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

  -- Identity, colour and measurement are still hard requirements. Condition and
  -- inspection are allowed to be incomplete, but whatever *is* supplied must be
  -- structurally valid, and a device claiming a complete inspection must
  -- actually satisfy the full activation contract.
  if exists (
    select 1
    from jsonb_array_elements(normalized_devices) as normalized_item(value)
    where coalesce(private.is_valid_opening_stock_imei(normalized_item.value ->> 'imei'), false) is not true
      or length(normalized_item.value ->> 'colour') not between 2 and 60
      or (normalized_item.value ->> 'colour') ~ '[[:cntrl:]]'
      or (
        normalized_item.value ->> 'condition' is not null
        and normalized_item.value ->> 'condition' not in ('excellent', 'good', 'fair')
      )
      or (
        coalesce(normalized_item.value ->> 'battery_health', '') <> ''
        and (normalized_item.value ->> 'battery_health')::integer not between 1 and 100
      )
      or coalesce(
        private.is_well_formed_opening_stock_inspection(normalized_item.value -> 'inspection'),
        false
      ) is not true
      or (
        coalesce(
          private.is_valid_opening_stock_inspection(normalized_item.value -> 'inspection'),
          false
        ) is not true
        and exists (
          select 1
          from jsonb_each(normalized_item.value -> 'inspection') as inspection_field(field_name, field_value)
          where inspection_field.field_value = 'false'::jsonb
        )
      )
  ) then
    raise exception using errcode = '22023', message = 'real IMEI, valid colour and a well-formed inspection document are required; a failed check cannot be recorded as passing';
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

  -- The receipt is attributed to a real person, not a synthetic one. An
  -- authenticated caller already has an id; the temporary import path has no
  -- JWT, so it inherits the resolved membership's owner. `received_by_user_id`
  -- is NOT NULL with a composite FK to `store_memberships`, so a null id here
  -- would fail the insert rather than record an anonymous receipt.
  if caller_user_id is null and caller_membership_id is not null then
    select membership.user_id into caller_user_id
    from public.store_memberships membership
    where membership.id = caller_membership_id;
  end if;

  caller_display_name := private.opening_stock_actor_name(caller_user_id);

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
      ),
      'unknown_condition_count', (
        select count(*)
        from jsonb_array_elements(normalized_devices) as normalized_item(value)
        where normalized_item.value ->> 'condition' is null
      ),
      'pending_inspection_count', (
        select count(*)
        from jsonb_array_elements(normalized_devices) as normalized_item(value)
        where coalesce(
          private.is_valid_opening_stock_inspection(normalized_item.value -> 'inspection'),
          false
        ) is not true
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

commit;
