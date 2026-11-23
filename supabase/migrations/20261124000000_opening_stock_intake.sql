begin;

-- Opening-stock intake is a forward-only workflow built on Phases 1–6. Received
-- devices live in this staged ledger until a pricing approver activates them
-- into the existing IMEI-level sellable inventory. All money is integer GHS
-- pesewas and all browser writes go through fixed-search-path RPCs.

create or replace function private.normalize_opening_stock_imei(candidate text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select regexp_replace(btrim(candidate), '[[:space:]-]', '', 'g');
$$;

create or replace function private.is_valid_opening_stock_imei(candidate text)
returns boolean
language plpgsql
immutable
strict
security definer
set search_path = ''
as $$
declare
  current_digit integer;
  previous_digit integer;
  ascending_digits boolean := true;
  descending_digits boolean := true;
begin
  if not private.is_valid_imei(candidate) then
    return false;
  end if;

  -- Reject all-zero/all-identical Type Allocation Codes and well-known test
  -- values. A real physical-device IMEI is still required at inspection.
  if substring(candidate from 1 for 8) = '00000000'
    or substring(candidate from 1 for 8) = repeat(substring(candidate from 1 for 1), 8)
    or candidate in ('000000000000000', '490154203237518', '356789104567890') then
    return false;
  end if;

  for digit_position in 2..15 loop
    current_digit := substring(candidate from digit_position for 1)::integer;
    previous_digit := substring(candidate from digit_position - 1 for 1)::integer;
    if current_digit <> previous_digit + 1 then
      ascending_digits := false;
    end if;
    if current_digit <> previous_digit - 1 then
      descending_digits := false;
    end if;
  end loop;

  return not ascending_digits and not descending_digits;
end;
$$;

create or replace function private.is_valid_opening_stock_inspection(inspection jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  allowed_keys text[] := array[
    'imei_confirmed_physical',
    'identity_labels_match',
    'display_passed',
    'cameras_passed',
    'buttons_passed',
    'connectivity_passed',
    'charging_port_passed',
    'activation_lock_cleared',
    'notes'
  ];
  notes_value text;
begin
  if inspection is null or jsonb_typeof(inspection) <> 'object' then
    return false;
  end if;

  if exists (
    select 1
    from jsonb_object_keys(inspection) as inspection_key(field_name)
    where not (inspection_key.field_name = any (allowed_keys))
  ) then
    return false;
  end if;

  for required_index in 1..8 loop
    if coalesce(inspection -> allowed_keys[required_index] = 'true'::jsonb, false) is not true then
      return false;
    end if;
  end loop;

  if inspection ? 'notes' then
    if jsonb_typeof(inspection -> 'notes') = 'string' then
      notes_value := inspection ->> 'notes';
      if length(notes_value) > 500 or notes_value ~ '[[:cntrl:]]' then
        return false;
      end if;
    elsif jsonb_typeof(inspection -> 'notes') <> 'null' then
      return false;
    end if;
  end if;

  return true;
end;
$$;

create or replace function private.opening_stock_cost_visible(target_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.is_active_store_member(target_store_id)
    and private.has_store_permission(target_store_id, 'access_manager_workspace')
    and private.has_store_permission(target_store_id, 'manage_inventory'),
    false
  );
$$;

create or replace function private.opening_stock_actor_membership(
  target_store_id uuid,
  require_pricing_approval boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  caller_membership_id uuid;
begin
  if caller_user_id is null then
    raise exception using errcode = '28000', message = 'authentication required';
  end if;

  -- Reuse the Phase 5 membership lock and effective-permission check, then
  -- require the manager workspace and, for pricing changes, approval authority.
  caller_membership_id := private.sale_actor_membership(target_store_id, 'manage_inventory');

  if not private.has_store_permission(target_store_id, 'access_manager_workspace') then
    raise exception using errcode = '42501', message = 'manager workspace permission required';
  end if;

  if require_pricing_approval
    and not private.has_store_permission(target_store_id, 'approve_inventory_adjustments') then
    raise exception using errcode = '42501', message = 'inventory pricing approval permission required';
  end if;

  return caller_membership_id;
end;
$$;

create or replace function private.opening_stock_actor_name(target_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select display_name from public.profiles where id = target_user_id),
    'Team member'
  );
$$;

create or replace function private.opening_stock_audit(
  target_store_id uuid,
  actor_user_id uuid,
  actor_membership_id uuid,
  action text,
  entity_type text,
  entity_id uuid,
  event_data jsonb,
  occurred_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_events (
    store_id, actor_user_id, actor_membership_id, action,
    entity_type, entity_id, event_data, occurred_at
  )
  values (
    target_store_id, actor_user_id, actor_membership_id, action,
    entity_type, entity_id, event_data, occurred_at
  );
end;
$$;

create or replace function private.opening_stock_lock_imei(candidate text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(candidate)::bigint);
end;
$$;

-- Small forward-only unique constraints support store-scoped composite FKs.
alter table public.store_inventory
  add constraint store_inventory_id_store_unique unique (id, store_id);
alter table public.inventory_devices
  add constraint inventory_devices_id_model_unique unique (id, device_model_id);

create table public.opening_stock_models (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on update cascade on delete restrict,
  device_model_id uuid not null references public.device_models(id) on update cascade on delete restrict,
  supplier_sku text,
  status text not null default 'active',
  created_by_user_id uuid not null references public.profiles(id) on update cascade on delete restrict,
  created_by_membership_id uuid not null,
  created_by_display_name text not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint opening_stock_models_identity_store_unique unique (id, store_id),
  constraint opening_stock_models_identity_model_unique unique (id, store_id, device_model_id),
  constraint opening_stock_models_store_model_unique unique (store_id, device_model_id),
  constraint opening_stock_models_creator_membership_fk
    foreign key (created_by_membership_id, store_id, created_by_user_id)
    references public.store_memberships(id, store_id, user_id)
    on update cascade on delete restrict,
  constraint opening_stock_models_sku_valid check (
    supplier_sku is null
    or (
      supplier_sku = upper(btrim(supplier_sku))
      and length(supplier_sku) between 1 and 80
      and supplier_sku ~ '^[A-Z0-9][A-Z0-9._/-]*$'
      and supplier_sku !~ '[[:cntrl:]]'
    )
  ),
  constraint opening_stock_models_status_valid check (status in ('active', 'inactive')),
  constraint opening_stock_models_creator_name_valid check (
    length(btrim(created_by_display_name)) between 1 and 160
  )
);

create unique index opening_stock_models_active_sku_unique
  on public.opening_stock_models (store_id, lower(supplier_sku))
  where supplier_sku is not null and status = 'active';

create table public.supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on update cascade on delete restrict,
  supplier_name text not null,
  supplier_invoice_number text,
  declared_total_pesewas bigint not null,
  invoice_date date not null,
  currency text not null default 'GHS',
  status text not null default 'open',
  notes text,
  created_by_user_id uuid not null references public.profiles(id) on update cascade on delete restrict,
  created_by_membership_id uuid not null,
  created_by_display_name text not null,
  closed_at timestamptz,
  confirmed_at timestamptz,
  confirmed_by_user_id uuid references public.profiles(id) on update cascade on delete restrict,
  confirmed_by_membership_id uuid,
  confirmed_by_display_name text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint supplier_invoices_identity_store_unique unique (id, store_id),
  constraint supplier_invoices_creator_membership_fk
    foreign key (created_by_membership_id, store_id, created_by_user_id)
    references public.store_memberships(id, store_id, user_id)
    on update cascade on delete restrict,
  constraint supplier_invoices_confirmation_membership_fk
    foreign key (confirmed_by_membership_id, store_id, confirmed_by_user_id)
    references public.store_memberships(id, store_id, user_id)
    on update cascade on delete restrict,
  constraint supplier_invoices_supplier_name_valid check (
    supplier_name = btrim(supplier_name)
    and length(supplier_name) between 2 and 160
    and supplier_name !~ '[[:cntrl:]]'
  ),
  constraint supplier_invoices_number_valid check (
    supplier_invoice_number is null
    or (
      supplier_invoice_number = btrim(supplier_invoice_number)
      and length(supplier_invoice_number) between 2 and 80
      and supplier_invoice_number ~ '^[A-Za-z0-9][A-Za-z0-9._/ -]*$'
      and supplier_invoice_number !~ '[[:cntrl:]]'
    )
  ),
  constraint supplier_invoices_declared_total_valid check (
    declared_total_pesewas > 0 and declared_total_pesewas <= 100000000000000
  ),
  constraint supplier_invoices_currency_ghs check (currency = 'GHS'),
  constraint supplier_invoices_status_valid check (status in ('open', 'closed')),
  constraint supplier_invoices_notes_valid check (
    notes is null or (length(notes) <= 1000 and notes !~ '[[:cntrl:]]')
  ),
  constraint supplier_invoices_creator_name_valid check (
    length(btrim(created_by_display_name)) between 1 and 160
  ),
  constraint supplier_invoices_closed_consistent check (
    (status = 'open' and closed_at is null)
    or (status = 'closed' and closed_at is not null)
  ),
  constraint supplier_invoices_confirmation_consistent check (
    (
      confirmed_at is null
      and confirmed_by_user_id is null
      and confirmed_by_membership_id is null
      and confirmed_by_display_name is null
    )
    or
    (
      confirmed_at is not null
      and confirmed_by_user_id is not null
      and confirmed_by_membership_id is not null
      and length(btrim(confirmed_by_display_name)) between 1 and 160
    )
  )
);

create unique index supplier_invoices_store_number_unique
  on public.supplier_invoices (store_id, lower(supplier_invoice_number))
  where supplier_invoice_number is not null;
create index supplier_invoices_store_status_date_idx
  on public.supplier_invoices (store_id, status, invoice_date desc);

create table public.supplier_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null,
  store_id uuid not null references public.stores(id) on update cascade on delete restrict,
  line_number integer not null,
  model_catalogue_id uuid not null,
  device_model_id uuid not null references public.device_models(id) on update cascade on delete restrict,
  quantity_invoiced integer not null,
  unit_cost_pesewas bigint not null,
  line_total_pesewas bigint generated always as (quantity_invoiced::bigint * unit_cost_pesewas) stored,
  currency text not null default 'GHS',
  notes text,
  created_by_user_id uuid not null references public.profiles(id) on update cascade on delete restrict,
  created_by_membership_id uuid not null,
  created_by_display_name text not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint supplier_invoice_lines_identity_store_unique unique (id, store_id),
  constraint supplier_invoice_lines_identity_invoice_unique unique (id, invoice_id, store_id),
  constraint supplier_invoice_lines_identity_model_unique unique (id, store_id, device_model_id),
  constraint supplier_invoice_lines_invoice_fk
    foreign key (invoice_id, store_id)
    references public.supplier_invoices(id, store_id)
    on update cascade on delete restrict,
  constraint supplier_invoice_lines_model_catalogue_fk
    foreign key (model_catalogue_id, store_id, device_model_id)
    references public.opening_stock_models(id, store_id, device_model_id)
    on update cascade on delete restrict,
  constraint supplier_invoice_lines_creator_membership_fk
    foreign key (created_by_membership_id, store_id, created_by_user_id)
    references public.store_memberships(id, store_id, user_id)
    on update cascade on delete restrict,
  constraint supplier_invoice_lines_number_valid check (line_number > 0),
  constraint supplier_invoice_lines_number_unique unique (invoice_id, line_number),
  constraint supplier_invoice_lines_quantity_valid check (quantity_invoiced between 1 and 1000),
  constraint supplier_invoice_lines_cost_valid check (
    unit_cost_pesewas > 0 and unit_cost_pesewas <= 100000000000000
  ),
  constraint supplier_invoice_lines_line_total_valid check (
    line_total_pesewas > 0 and line_total_pesewas <= 100000000000000000
  ),
  constraint supplier_invoice_lines_currency_ghs check (currency = 'GHS'),
  constraint supplier_invoice_lines_notes_valid check (
    notes is null or (length(notes) <= 1000 and notes !~ '[[:cntrl:]]')
  ),
  constraint supplier_invoice_lines_creator_name_valid check (
    length(btrim(created_by_display_name)) between 1 and 160
  )
);

create index supplier_invoice_lines_store_invoice_idx
  on public.supplier_invoice_lines (store_id, invoice_id, line_number);

create table public.opening_stock_units (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on update cascade on delete restrict,
  invoice_line_id uuid not null,
  device_model_id uuid not null references public.device_models(id) on update cascade on delete restrict,
  imei text not null,
  colour text not null,
  condition text not null,
  battery_health integer not null,
  inspection jsonb not null,
  unit_cost_pesewas bigint not null,
  status text not null default 'staged',
  approved_price_pesewas bigint,
  inventory_device_id uuid,
  store_inventory_id uuid,
  received_by_user_id uuid not null references public.profiles(id) on update cascade on delete restrict,
  received_by_membership_id uuid not null,
  received_by_display_name text not null,
  received_at timestamptz not null default statement_timestamp(),
  activated_by_user_id uuid references public.profiles(id) on update cascade on delete restrict,
  activated_by_membership_id uuid,
  activated_by_display_name text,
  activated_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint opening_stock_units_identity_store_unique unique (id, store_id),
  constraint opening_stock_units_line_fk
    foreign key (invoice_line_id, store_id, device_model_id)
    references public.supplier_invoice_lines(id, store_id, device_model_id)
    on update cascade on delete restrict,
  constraint opening_stock_units_inventory_fk
    foreign key (store_inventory_id, store_id, inventory_device_id)
    references public.store_inventory(id, store_id, device_id)
    on update cascade on delete restrict,
  constraint opening_stock_units_device_model_fk
    foreign key (inventory_device_id, device_model_id)
    references public.inventory_devices(id, device_model_id)
    on update cascade on delete restrict,
  constraint opening_stock_units_receiver_membership_fk
    foreign key (received_by_membership_id, store_id, received_by_user_id)
    references public.store_memberships(id, store_id, user_id)
    on update cascade on delete restrict,
  constraint opening_stock_units_activator_membership_fk
    foreign key (activated_by_membership_id, store_id, activated_by_user_id)
    references public.store_memberships(id, store_id, user_id)
    on update cascade on delete restrict,
  constraint opening_stock_units_imei_unique unique (imei),
  constraint opening_stock_units_inventory_unique unique (store_inventory_id),
  constraint opening_stock_units_device_unique unique (inventory_device_id),
  constraint opening_stock_units_imei_valid check (private.is_valid_opening_stock_imei(imei)),
  constraint opening_stock_units_colour_valid check (
    colour = btrim(colour) and length(colour) between 2 and 60 and colour !~ '[[:cntrl:]]'
  ),
  constraint opening_stock_units_condition_valid check (condition in ('excellent', 'good', 'fair')),
  constraint opening_stock_units_battery_valid check (battery_health between 1 and 100),
  constraint opening_stock_units_inspection_valid check (
    private.is_valid_opening_stock_inspection(inspection)
  ),
  constraint opening_stock_units_cost_valid check (
    unit_cost_pesewas > 0 and unit_cost_pesewas <= 100000000000000
  ),
  constraint opening_stock_units_status_valid check (status in ('staged', 'activated')),
  constraint opening_stock_units_price_valid check (
    approved_price_pesewas is null
    or (approved_price_pesewas > 0 and approved_price_pesewas <= 100000000000000)
  ),
  constraint opening_stock_units_receiver_name_valid check (
    length(btrim(received_by_display_name)) between 1 and 160
  ),
  constraint opening_stock_units_activation_consistent check (
    (
      status = 'staged'
      and approved_price_pesewas is null
      and inventory_device_id is null
      and store_inventory_id is null
      and activated_by_user_id is null
      and activated_by_membership_id is null
      and activated_by_display_name is null
      and activated_at is null
    )
    or
    (
      status = 'activated'
      and approved_price_pesewas > 0
      and inventory_device_id is not null
      and store_inventory_id is not null
      and activated_by_user_id is not null
      and activated_by_membership_id is not null
      and length(btrim(activated_by_display_name)) between 1 and 160
      and activated_at is not null
    )
  )
);

create index opening_stock_units_store_line_status_idx
  on public.opening_stock_units (store_id, invoice_line_id, status, received_at desc);
create index opening_stock_units_imei_idx
  on public.opening_stock_units (imei);

create table public.supplier_invoice_corrections (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on update cascade on delete restrict,
  invoice_id uuid not null,
  line_id uuid,
  entity_type text not null,
  before_data jsonb not null,
  after_data jsonb not null,
  reason text not null,
  actor_user_id uuid not null references public.profiles(id) on update cascade on delete restrict,
  actor_membership_id uuid not null,
  actor_display_name text not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint supplier_invoice_corrections_invoice_fk
    foreign key (invoice_id, store_id)
    references public.supplier_invoices(id, store_id)
    on update cascade on delete restrict,
  constraint supplier_invoice_corrections_line_fk
    foreign key (line_id, invoice_id, store_id)
    references public.supplier_invoice_lines(id, invoice_id, store_id)
    on update cascade on delete restrict,
  constraint supplier_invoice_corrections_actor_membership_fk
    foreign key (actor_membership_id, store_id, actor_user_id)
    references public.store_memberships(id, store_id, user_id)
    on update cascade on delete restrict,
  constraint supplier_invoice_corrections_entity_valid check (
    (entity_type = 'invoice' and line_id is null)
    or (entity_type = 'invoice_line' and line_id is not null)
  ),
  constraint supplier_invoice_corrections_before_object check (jsonb_typeof(before_data) = 'object'),
  constraint supplier_invoice_corrections_after_object check (jsonb_typeof(after_data) = 'object'),
  constraint supplier_invoice_corrections_reason_valid check (
    reason = btrim(reason) and length(reason) between 5 and 500 and reason !~ '[[:cntrl:]]'
  ),
  constraint supplier_invoice_corrections_actor_name_valid check (
    length(btrim(actor_display_name)) between 1 and 160
  )
);

create index supplier_invoice_corrections_store_time_idx
  on public.supplier_invoice_corrections (store_id, created_at desc);

create table public.opening_stock_price_changes (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on update cascade on delete restrict,
  unit_id uuid not null,
  store_inventory_id uuid not null,
  old_price_pesewas bigint not null,
  new_price_pesewas bigint not null,
  reason text not null,
  actor_user_id uuid not null references public.profiles(id) on update cascade on delete restrict,
  actor_membership_id uuid not null,
  actor_display_name text not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint opening_stock_price_changes_identity_store_unique unique (id, store_id),
  constraint opening_stock_price_changes_unit_fk
    foreign key (unit_id, store_id)
    references public.opening_stock_units(id, store_id)
    on update cascade on delete restrict,
  constraint opening_stock_price_changes_inventory_fk
    foreign key (store_inventory_id, store_id)
    references public.store_inventory(id, store_id)
    on update cascade on delete restrict,
  constraint opening_stock_price_changes_actor_membership_fk
    foreign key (actor_membership_id, store_id, actor_user_id)
    references public.store_memberships(id, store_id, user_id)
    on update cascade on delete restrict,
  constraint opening_stock_price_changes_old_valid check (
    old_price_pesewas > 0 and old_price_pesewas <= 100000000000000
  ),
  constraint opening_stock_price_changes_new_valid check (
    new_price_pesewas > 0 and new_price_pesewas <= 100000000000000
  ),
  constraint opening_stock_price_changes_changed check (old_price_pesewas <> new_price_pesewas),
  constraint opening_stock_price_changes_reason_valid check (
    reason = btrim(reason) and length(reason) between 5 and 500 and reason !~ '[[:cntrl:]]'
  ),
  constraint opening_stock_price_changes_actor_name_valid check (
    length(btrim(actor_display_name)) between 1 and 160
  )
);

create index opening_stock_price_changes_store_time_idx
  on public.opening_stock_price_changes (store_id, created_at desc);

create or replace function private.opening_stock_imei_available(
  candidate text,
  excluded_unit_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    not exists (
      select 1 from public.inventory_devices inventory_device
      where inventory_device.imei = candidate
    )
    and not exists (
      select 1 from public.opening_stock_units opening_unit
      where opening_unit.imei = candidate
        and (excluded_unit_id is null or opening_unit.id <> excluded_unit_id)
    );
$$;

create or replace function private.opening_stock_line_cost(target_line_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.opening_stock_cost_visible(invoice_line.store_id)
      then invoice_line.unit_cost_pesewas
    else null
  end
  from public.supplier_invoice_lines invoice_line
  where invoice_line.id = target_line_id;
$$;

create or replace function private.opening_stock_unit_cost(target_unit_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.opening_stock_cost_visible(opening_unit.store_id)
      then opening_unit.unit_cost_pesewas
    else null
  end
  from public.opening_stock_units opening_unit
  where opening_unit.id = target_unit_id;
$$;

create or replace function private.opening_stock_line_total(target_line_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.opening_stock_cost_visible(invoice_line.store_id)
      then invoice_line.line_total_pesewas
    else null
  end
  from public.supplier_invoice_lines invoice_line
  where invoice_line.id = target_line_id;
$$;

create or replace function private.opening_stock_invoice_declared_total(target_invoice_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.opening_stock_cost_visible(invoice.store_id)
      then invoice.declared_total_pesewas
    else null
  end
  from public.supplier_invoices invoice
  where invoice.id = target_invoice_id;
$$;

create or replace function private.opening_stock_invoice_total(target_invoice_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.opening_stock_cost_visible(invoice.store_id)
      then coalesce((
        select sum(invoice_line.line_total_pesewas::numeric)
        from public.supplier_invoice_lines invoice_line
        where invoice_line.invoice_id = invoice.id
      ), 0::numeric)
    else null
  end
  from public.supplier_invoices invoice
  where invoice.id = target_invoice_id;
$$;

create or replace function private.opening_stock_invoice_reconciled(target_invoice_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.opening_stock_cost_visible(invoice.store_id)
    and exists (
      select 1
      from public.supplier_invoice_lines invoice_line
      where invoice_line.invoice_id = invoice.id
    )
    and coalesce((
      select sum(invoice_line.line_total_pesewas::numeric)
      from public.supplier_invoice_lines invoice_line
      where invoice_line.invoice_id = invoice.id
    ), 0::numeric) = invoice.declared_total_pesewas::numeric,
    false
  )
  from public.supplier_invoices invoice
  where invoice.id = target_invoice_id;
$$;

create or replace function private.prevent_opening_stock_ledger_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'opening-stock ledger rows are append-only';
end;
$$;

create or replace function private.prevent_opening_stock_unit_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'opening-stock units cannot be deleted';
end;
$$;

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
    or new.battery_health is distinct from old.battery_health
    or new.inspection is distinct from old.inspection
    or new.unit_cost_pesewas is distinct from old.unit_cost_pesewas
    or new.received_by_user_id is distinct from old.received_by_user_id
    or new.received_by_membership_id is distinct from old.received_by_membership_id
    or new.received_by_display_name is distinct from old.received_by_display_name
    or new.received_at is distinct from old.received_at
    or new.created_at is distinct from old.created_at then
    raise exception using errcode = '23514', message = 'received opening-stock identity is immutable';
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

  raise exception using errcode = '23514', message = 'invalid opening-stock unit status transition';
end;
$$;

create trigger opening_stock_models_set_updated_at
before update on public.opening_stock_models
for each row execute function private.set_updated_at();
create trigger supplier_invoices_set_updated_at
before update on public.supplier_invoices
for each row execute function private.set_updated_at();
create trigger supplier_invoice_lines_set_updated_at
before update on public.supplier_invoice_lines
for each row execute function private.set_updated_at();
create trigger opening_stock_units_set_updated_at
before update on public.opening_stock_units
for each row execute function private.set_updated_at();
create trigger opening_stock_units_validate_update
before update on public.opening_stock_units
for each row execute function private.validate_opening_stock_unit_update();
create trigger opening_stock_units_no_delete
before delete on public.opening_stock_units
for each row execute function private.prevent_opening_stock_unit_delete();

create trigger supplier_invoice_corrections_append_only
before update or delete on public.supplier_invoice_corrections
for each row execute function private.prevent_opening_stock_ledger_mutation();
create trigger opening_stock_price_changes_append_only
before update or delete on public.opening_stock_price_changes
for each row execute function private.prevent_opening_stock_ledger_mutation();

alter table public.opening_stock_models enable row level security;
alter table public.opening_stock_models force row level security;
alter table public.supplier_invoices enable row level security;
alter table public.supplier_invoices force row level security;
alter table public.supplier_invoice_lines enable row level security;
alter table public.supplier_invoice_lines force row level security;
alter table public.opening_stock_units enable row level security;
alter table public.opening_stock_units force row level security;
alter table public.supplier_invoice_corrections enable row level security;
alter table public.supplier_invoice_corrections force row level security;
alter table public.opening_stock_price_changes enable row level security;
alter table public.opening_stock_price_changes force row level security;

create policy opening_stock_models_select_manager_workspace
on public.opening_stock_models for select to authenticated
using (
  private.is_active_store_member(store_id)
  and private.has_store_permission(store_id, 'access_manager_workspace')
);

create policy supplier_invoices_select_manager_workspace
on public.supplier_invoices for select to authenticated
using (
  private.is_active_store_member(store_id)
  and private.has_store_permission(store_id, 'access_manager_workspace')
);

create policy supplier_invoice_lines_select_manager_workspace
on public.supplier_invoice_lines for select to authenticated
using (
  private.is_active_store_member(store_id)
  and private.has_store_permission(store_id, 'access_manager_workspace')
);

create policy opening_stock_units_select_manager_workspace
on public.opening_stock_units for select to authenticated
using (
  private.is_active_store_member(store_id)
  and private.has_store_permission(store_id, 'access_manager_workspace')
);

create policy supplier_invoice_corrections_select_cost_managers
on public.supplier_invoice_corrections for select to authenticated
using (private.opening_stock_cost_visible(store_id));

create policy opening_stock_price_changes_select_manager_workspace
on public.opening_stock_price_changes for select to authenticated
using (
  private.is_active_store_member(store_id)
  and private.has_store_permission(store_id, 'access_manager_workspace')
);

create view public.opening_stock_models_view
with (security_invoker = true, security_barrier = true)
as
select
  catalogue.id,
  catalogue.store_id,
  catalogue.device_model_id,
  catalogue.supplier_sku,
  catalogue.status,
  catalogue.created_by_user_id,
  catalogue.created_by_membership_id,
  catalogue.created_by_display_name,
  catalogue.created_at,
  catalogue.updated_at,
  model.model_name,
  model.storage_gb
from public.opening_stock_models catalogue
join public.device_models model on model.id = catalogue.device_model_id
where private.is_active_store_member(catalogue.store_id)
  and private.has_store_permission(catalogue.store_id, 'access_manager_workspace');

create view public.opening_stock_invoices_view
with (security_invoker = true, security_barrier = true)
as
select
  invoice.id,
  invoice.store_id,
  invoice.supplier_name,
  invoice.supplier_invoice_number,
  invoice.invoice_date,
  invoice.currency,
  invoice.status,
  invoice.notes,
  private.opening_stock_invoice_declared_total(invoice.id) as declared_total_pesewas,
  private.opening_stock_cost_visible(invoice.store_id) as cost_visible,
  invoice.created_by_user_id,
  invoice.created_by_membership_id,
  invoice.created_by_display_name,
  invoice.closed_at,
  invoice.confirmed_at,
  invoice.confirmed_by_user_id,
  invoice.confirmed_by_membership_id,
  invoice.confirmed_by_display_name,
  invoice.created_at,
  invoice.updated_at
from public.supplier_invoices invoice
where private.is_active_store_member(invoice.store_id)
  and private.has_store_permission(invoice.store_id, 'access_manager_workspace');

create view public.opening_stock_invoice_lines_view
with (security_invoker = true, security_barrier = true)
as
select
  line.id,
  line.invoice_id,
  line.store_id,
  line.line_number,
  line.model_catalogue_id,
  line.device_model_id,
  line.quantity_invoiced,
  line.currency,
  line.notes,
  line.created_by_user_id,
  line.created_by_membership_id,
  line.created_by_display_name,
  line.created_at,
  line.updated_at,
  model.model_name,
  model.storage_gb,
  catalogue.supplier_sku,
  count(unit.id)::integer as quantity_received,
  count(unit.id) filter (where unit.status = 'staged')::integer as quantity_staged,
  count(unit.id) filter (where unit.status = 'activated')::integer as quantity_activated,
  greatest(line.quantity_invoiced - count(unit.id)::integer, 0) as quantity_outstanding,
  private.opening_stock_cost_visible(line.store_id) as cost_visible,
  private.opening_stock_line_cost(line.id) as unit_cost_pesewas,
  private.opening_stock_line_total(line.id) as line_total_pesewas
from public.supplier_invoice_lines line
join public.device_models model on model.id = line.device_model_id
join public.opening_stock_models catalogue on catalogue.id = line.model_catalogue_id
left join public.opening_stock_units unit on unit.invoice_line_id = line.id
where private.is_active_store_member(line.store_id)
  and private.has_store_permission(line.store_id, 'access_manager_workspace')
group by
  line.id,
  line.invoice_id,
  line.store_id,
  line.line_number,
  line.model_catalogue_id,
  line.device_model_id,
  line.quantity_invoiced,
  line.currency,
  line.notes,
  line.created_by_user_id,
  line.created_by_membership_id,
  line.created_by_display_name,
  line.created_at,
  line.updated_at,
  model.model_name,
  model.storage_gb,
  catalogue.supplier_sku;

create view public.opening_stock_units_view
with (security_invoker = true, security_barrier = true)
as
select
  unit.id,
  unit.store_id,
  unit.invoice_line_id,
  unit.device_model_id,
  unit.imei,
  unit.colour,
  unit.condition,
  unit.battery_health,
  unit.inspection,
  unit.status,
  unit.approved_price_pesewas,
  unit.inventory_device_id,
  unit.store_inventory_id,
  unit.received_by_user_id,
  unit.received_by_membership_id,
  unit.received_by_display_name,
  unit.received_at,
  unit.activated_by_user_id,
  unit.activated_by_membership_id,
  unit.activated_by_display_name,
  unit.activated_at,
  unit.created_at,
  unit.updated_at,
  model.model_name,
  model.storage_gb,
  private.opening_stock_cost_visible(unit.store_id) as cost_visible,
  private.opening_stock_unit_cost(unit.id) as unit_cost_pesewas
from public.opening_stock_units unit
join public.device_models model on model.id = unit.device_model_id
where private.is_active_store_member(unit.store_id)
  and private.has_store_permission(unit.store_id, 'access_manager_workspace');

create view public.opening_stock_corrections_view
with (security_invoker = true, security_barrier = true)
as
select
  correction.id,
  correction.store_id,
  correction.invoice_id,
  correction.line_id,
  correction.entity_type,
  correction.before_data,
  correction.after_data,
  correction.reason,
  correction.actor_user_id,
  correction.actor_membership_id,
  correction.actor_display_name,
  correction.created_at
from public.supplier_invoice_corrections correction
where private.opening_stock_cost_visible(correction.store_id);

create view public.opening_stock_price_changes_view
with (security_invoker = true, security_barrier = true)
as
select
  price_change.id,
  price_change.store_id,
  price_change.unit_id,
  price_change.store_inventory_id,
  price_change.old_price_pesewas,
  price_change.new_price_pesewas,
  price_change.reason,
  price_change.actor_user_id,
  price_change.actor_membership_id,
  price_change.actor_display_name,
  price_change.created_at
from public.opening_stock_price_changes price_change
where private.is_active_store_member(price_change.store_id)
  and private.has_store_permission(price_change.store_id, 'access_manager_workspace');

create view public.opening_stock_invoice_reconciliation_view
with (security_invoker = true, security_barrier = true)
as
select
  invoice.id as invoice_id,
  invoice.store_id,
  invoice.supplier_name,
  invoice.supplier_invoice_number,
  invoice.invoice_date,
  invoice.status,
  count(invoice_line.id)::integer as line_count,
  coalesce(sum(invoice_line.quantity_invoiced), 0)::integer as quantity_invoiced,
  private.opening_stock_invoice_declared_total(invoice.id) as declared_total_pesewas,
  private.opening_stock_invoice_total(invoice.id) as calculated_total_pesewas,
  private.opening_stock_invoice_total(invoice.id)
    - private.opening_stock_invoice_declared_total(invoice.id) as difference_pesewas,
  private.opening_stock_invoice_reconciled(invoice.id) as reconciled,
  private.opening_stock_cost_visible(invoice.store_id) as cost_visible,
  invoice.confirmed_at,
  invoice.confirmed_by_display_name
from public.supplier_invoices invoice
left join public.supplier_invoice_lines invoice_line on invoice_line.invoice_id = invoice.id
where private.is_active_store_member(invoice.store_id)
  and private.has_store_permission(invoice.store_id, 'access_manager_workspace')
group by
  invoice.id,
  invoice.store_id,
  invoice.supplier_name,
  invoice.supplier_invoice_number,
  invoice.invoice_date,
  invoice.status,
  invoice.confirmed_at,
  invoice.confirmed_by_display_name;

create or replace function public.register_opening_stock_model(
  p_store_id uuid,
  p_model_name text,
  p_storage_gb integer,
  p_supplier_sku text
)
returns table (
  model_catalogue_id uuid,
  device_model_id uuid,
  resolved_model_name text,
  resolved_storage_gb integer,
  result text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  caller_membership_id uuid;
  caller_display_name text;
  normalized_model_name text := btrim(coalesce(p_model_name, ''));
  normalized_sku text := nullif(upper(btrim(coalesce(p_supplier_sku, ''))), '');
  resolved_device_model_id uuid;
  catalogue_id uuid;
  registration_result text;
  observed_at timestamptz := statement_timestamp();
begin
  caller_membership_id := private.opening_stock_actor_membership(p_store_id, false);
  caller_display_name := private.opening_stock_actor_name(caller_user_id);

  if length(normalized_model_name) not between 2 and 160
    or normalized_model_name ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'valid model name required';
  end if;
  if p_storage_gb is null or p_storage_gb not between 1 and 4096 then
    raise exception using errcode = '22023', message = 'valid storage capacity required';
  end if;
  if normalized_sku is not null
    and (length(normalized_sku) > 80 or normalized_sku !~ '^[A-Z0-9][A-Z0-9._/-]*$') then
    raise exception using errcode = '22023', message = 'valid supplier SKU required';
  end if;

  insert into public.device_models (model_name, storage_gb, created_at, updated_at)
  values (normalized_model_name, p_storage_gb, observed_at, observed_at)
  on conflict (lower(model_name), storage_gb)
  do update set model_name = excluded.model_name, updated_at = observed_at
  returning id into resolved_device_model_id;

  select catalogue.id into catalogue_id
  from public.opening_stock_models catalogue
  where catalogue.store_id = p_store_id
    and catalogue.device_model_id = resolved_device_model_id;

  if catalogue_id is null then
    insert into public.opening_stock_models (
      store_id, device_model_id, supplier_sku, status,
      created_by_user_id, created_by_membership_id, created_by_display_name,
      created_at, updated_at
    )
    values (
      p_store_id, resolved_device_model_id, normalized_sku, 'active',
      caller_user_id, caller_membership_id, caller_display_name,
      observed_at, observed_at
    )
    returning id into catalogue_id;
    registration_result := 'created';
  else
    update public.opening_stock_models
    set supplier_sku = normalized_sku,
        status = 'active',
        updated_at = observed_at
    where id = catalogue_id;
    registration_result := 'updated';
  end if;

  perform private.opening_stock_audit(
    p_store_id, caller_user_id, caller_membership_id,
    'opening_stock.model_registered', 'opening_stock_model', catalogue_id,
    jsonb_build_object(
      'result', registration_result,
      'model_name', normalized_model_name,
      'storage_gb', p_storage_gb,
      'supplier_sku', normalized_sku
    ),
    observed_at
  );

  return query
  select catalogue_id, resolved_device_model_id, normalized_model_name, p_storage_gb, registration_result;
end;
$$;

create or replace function public.create_supplier_invoice(
  p_store_id uuid,
  p_supplier_name text,
  p_supplier_invoice_number text,
  p_invoice_date date,
  p_declared_total_pesewas bigint,
  p_notes text
)
returns table (invoice_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  caller_membership_id uuid;
  caller_display_name text;
  normalized_supplier_name text := btrim(coalesce(p_supplier_name, ''));
  normalized_number text := nullif(btrim(coalesce(p_supplier_invoice_number, '')), '');
  normalized_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  new_invoice_id uuid := gen_random_uuid();
  invoice_status text := 'open';
  observed_at timestamptz := statement_timestamp();
begin
  caller_membership_id := private.opening_stock_actor_membership(p_store_id, false);
  caller_display_name := private.opening_stock_actor_name(caller_user_id);

  if length(normalized_supplier_name) not between 2 and 160
    or normalized_supplier_name ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'valid supplier name required';
  end if;
  if normalized_number is not null
    and (
      length(normalized_number) not between 2 and 80
      or normalized_number !~ '^[A-Za-z0-9][A-Za-z0-9._/ -]*$'
      or normalized_number ~ '[[:cntrl:]]'
    ) then
    raise exception using errcode = '22023', message = 'valid optional supplier invoice number required';
  end if;
  if p_declared_total_pesewas is null
    or p_declared_total_pesewas <= 0
    or p_declared_total_pesewas > 100000000000000 then
    raise exception using errcode = '22023', message = 'declared total must be positive integer pesewas';
  end if;
  if p_invoice_date is null
    or p_invoice_date < date '2000-01-01'
    or p_invoice_date > (timezone('Africa/Accra', observed_at))::date then
    raise exception using errcode = '22023', message = 'valid invoice date required';
  end if;
  if normalized_notes is not null
    and (length(normalized_notes) > 1000 or normalized_notes ~ '[[:cntrl:]]') then
    raise exception using errcode = '22023', message = 'invoice notes are too long';
  end if;

  insert into public.supplier_invoices (
    id, store_id, supplier_name, supplier_invoice_number, declared_total_pesewas,
    invoice_date, currency, status, notes, created_by_user_id,
    created_by_membership_id, created_by_display_name, created_at, updated_at
  )
  values (
    new_invoice_id, p_store_id, normalized_supplier_name, normalized_number,
    p_declared_total_pesewas, p_invoice_date, 'GHS', invoice_status, normalized_notes,
    caller_user_id, caller_membership_id, caller_display_name,
    observed_at, observed_at
  );

  perform private.opening_stock_audit(
    p_store_id, caller_user_id, caller_membership_id,
    'opening_stock.invoice_created', 'supplier_invoice', new_invoice_id,
    jsonb_build_object(
      'supplier_name', normalized_supplier_name,
      'supplier_invoice_number', normalized_number,
      'invoice_date', p_invoice_date,
      'declared_total_pesewas', p_declared_total_pesewas
    ),
    observed_at
  );

  return query select new_invoice_id, invoice_status;
end;
$$;

create or replace function public.confirm_supplier_invoice(
  p_invoice_id uuid,
  p_expected_declared_total_pesewas bigint,
  p_expected_line_count integer,
  p_expected_quantity_invoiced integer,
  p_expected_calculated_total_pesewas bigint,
  p_totals_confirmed boolean
)
returns table (
  invoice_id uuid,
  declared_total_pesewas bigint,
  calculated_total_pesewas bigint,
  line_count integer,
  quantity_invoiced integer,
  confirmed_at timestamptz
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
  computed_line_count integer;
  computed_quantity_numeric numeric;
  computed_quantity integer;
  computed_total_numeric numeric;
  computed_total bigint;
  observed_at timestamptz := statement_timestamp();
begin
  if p_totals_confirmed is not true then
    raise exception using errcode = '22023', message = 'explicit totals confirmation required';
  end if;
  if p_expected_declared_total_pesewas is null
    or p_expected_declared_total_pesewas <= 0
    or p_expected_declared_total_pesewas > 100000000000000
    or p_expected_calculated_total_pesewas is null
    or p_expected_calculated_total_pesewas <= 0
    or p_expected_calculated_total_pesewas > 100000000000000
    or p_expected_line_count is null
    or p_expected_line_count not between 1 and 1000
    or p_expected_quantity_invoiced is null
    or p_expected_quantity_invoiced not between 1 and 100000 then
    raise exception using errcode = '22023', message = 'valid expected invoice reconciliation values required';
  end if;

  select invoice.* into invoice_record
  from public.supplier_invoices invoice
  where invoice.id = p_invoice_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'supplier invoice not found';
  end if;

  caller_membership_id := private.opening_stock_actor_membership(invoice_record.store_id, false);
  caller_display_name := private.opening_stock_actor_name(caller_user_id);

  if not private.opening_stock_cost_visible(invoice_record.store_id) then
    raise exception using errcode = '42501', message = 'purchase-cost visibility required';
  end if;
  if invoice_record.status <> 'open' then
    raise exception using errcode = '23514', message = 'invoice is not open';
  end if;
  if invoice_record.confirmed_at is not null then
    raise exception using errcode = '23514', message = 'invoice totals are already confirmed';
  end if;
  if p_expected_declared_total_pesewas <> invoice_record.declared_total_pesewas then
    raise exception using errcode = '23514', message = 'declared total changed; reload before confirming';
  end if;

  select
    count(invoice_line.id)::integer,
    coalesce(sum(invoice_line.quantity_invoiced::numeric), 0::numeric),
    coalesce(sum(invoice_line.line_total_pesewas::numeric), 0::numeric)
  into computed_line_count, computed_quantity_numeric, computed_total_numeric
  from public.supplier_invoice_lines invoice_line
  where invoice_line.invoice_id = invoice_record.id;

  if computed_line_count <> p_expected_line_count
    or computed_quantity_numeric <> p_expected_quantity_invoiced::numeric
    or computed_total_numeric <> p_expected_calculated_total_pesewas::numeric
    or computed_total_numeric <> invoice_record.declared_total_pesewas::numeric then
    raise exception using errcode = '23514', message = 'invoice line totals do not reconcile with the declared total';
  end if;

  computed_quantity := computed_quantity_numeric::integer;
  computed_total := computed_total_numeric::bigint;

  update public.supplier_invoices
  set confirmed_at = observed_at,
      confirmed_by_user_id = caller_user_id,
      confirmed_by_membership_id = caller_membership_id,
      confirmed_by_display_name = caller_display_name,
      updated_at = observed_at
  where id = invoice_record.id;

  perform private.opening_stock_audit(
    invoice_record.store_id, caller_user_id, caller_membership_id,
    'opening_stock.invoice_totals_confirmed', 'supplier_invoice', invoice_record.id,
    jsonb_build_object(
      'declared_total_pesewas', invoice_record.declared_total_pesewas,
      'calculated_total_pesewas', computed_total,
      'line_count', computed_line_count,
      'quantity_invoiced', computed_quantity
    ),
    observed_at
  );

  return query
  select
    invoice_record.id,
    invoice_record.declared_total_pesewas,
    computed_total,
    computed_line_count,
    computed_quantity,
    observed_at;
end;
$$;

create or replace function public.add_supplier_invoice_line(
  p_invoice_id uuid,
  p_model_catalogue_id uuid,
  p_quantity_invoiced integer,
  p_unit_cost_pesewas bigint,
  p_notes text
)
returns table (invoice_line_id uuid, line_number integer, quantity_invoiced integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  caller_membership_id uuid;
  caller_display_name text;
  invoice_record public.supplier_invoices%rowtype;
  catalogue_record public.opening_stock_models%rowtype;
  normalized_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  new_line_id uuid := gen_random_uuid();
  next_line_number integer;
  confirmation_reset boolean := false;
  observed_at timestamptz := statement_timestamp();
begin
  select invoice.* into invoice_record
  from public.supplier_invoices invoice
  where invoice.id = p_invoice_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'supplier invoice not found';
  end if;

  caller_membership_id := private.opening_stock_actor_membership(invoice_record.store_id, false);
  caller_display_name := private.opening_stock_actor_name(caller_user_id);

  if invoice_record.status <> 'open' then
    raise exception using errcode = '23514', message = 'invoice is not open';
  end if;
  if p_quantity_invoiced is null or p_quantity_invoiced not between 1 and 1000 then
    raise exception using errcode = '22023', message = 'invoiced quantity must be between 1 and 1000';
  end if;
  if p_unit_cost_pesewas is null
    or p_unit_cost_pesewas <= 0
    or p_unit_cost_pesewas > 100000000000000 then
    raise exception using errcode = '22023', message = 'unit cost must be positive integer pesewas';
  end if;
  if normalized_notes is not null
    and (length(normalized_notes) > 1000 or normalized_notes ~ '[[:cntrl:]]') then
    raise exception using errcode = '22023', message = 'line notes are too long';
  end if;

  select catalogue.* into catalogue_record
  from public.opening_stock_models catalogue
  where catalogue.id = p_model_catalogue_id
    and catalogue.store_id = invoice_record.store_id
  for share;

  if not found or catalogue_record.status <> 'active' then
    raise exception using errcode = '42501', message = 'active same-store model registration required';
  end if;

  select coalesce(max(existing_line.line_number), 0) + 1
  into next_line_number
  from public.supplier_invoice_lines existing_line
  where existing_line.invoice_id = invoice_record.id;

  insert into public.supplier_invoice_lines (
    id, invoice_id, store_id, line_number, model_catalogue_id, device_model_id,
    quantity_invoiced, unit_cost_pesewas, currency, notes,
    created_by_user_id, created_by_membership_id, created_by_display_name,
    created_at, updated_at
  )
  values (
    new_line_id, invoice_record.id, invoice_record.store_id, next_line_number,
    catalogue_record.id, catalogue_record.device_model_id,
    p_quantity_invoiced, p_unit_cost_pesewas, 'GHS', normalized_notes,
    caller_user_id, caller_membership_id, caller_display_name,
    observed_at, observed_at
  );

  if invoice_record.confirmed_at is not null then
    update public.supplier_invoices
    set confirmed_at = null,
        confirmed_by_user_id = null,
        confirmed_by_membership_id = null,
        confirmed_by_display_name = null,
        updated_at = observed_at
    where id = invoice_record.id;
    confirmation_reset := true;
  end if;

  perform private.opening_stock_audit(
    invoice_record.store_id, caller_user_id, caller_membership_id,
    'opening_stock.invoice_line_added', 'supplier_invoice_line', new_line_id,
    jsonb_build_object(
      'invoice_id', invoice_record.id,
      'line_number', next_line_number,
      'model_catalogue_id', catalogue_record.id,
      'quantity_invoiced', p_quantity_invoiced,
      'confirmation_reset', confirmation_reset
    ),
    observed_at
  );

  return query select new_line_id, next_line_number, p_quantity_invoiced;
end;
$$;

create or replace function public.correct_supplier_invoice(
  p_invoice_id uuid,
  p_supplier_name text,
  p_supplier_invoice_number text,
  p_invoice_date date,
  p_declared_total_pesewas bigint,
  p_notes text,
  p_reason text
)
returns table (correction_id uuid, result text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  caller_membership_id uuid;
  caller_display_name text;
  invoice_record public.supplier_invoices%rowtype;
  normalized_supplier_name text := btrim(coalesce(p_supplier_name, ''));
  normalized_number text := nullif(btrim(coalesce(p_supplier_invoice_number, '')), '');
  normalized_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  normalized_reason text := btrim(coalesce(p_reason, ''));
  before_data jsonb;
  after_data jsonb;
  new_correction_id uuid := gen_random_uuid();
  confirmation_reset boolean := false;
  observed_at timestamptz := statement_timestamp();
begin
  select invoice.* into invoice_record
  from public.supplier_invoices invoice
  where invoice.id = p_invoice_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'supplier invoice not found';
  end if;

  caller_membership_id := private.opening_stock_actor_membership(invoice_record.store_id, false);
  caller_display_name := private.opening_stock_actor_name(caller_user_id);

  if invoice_record.status <> 'open' then
    raise exception using errcode = '23514', message = 'closed invoice cannot be corrected';
  end if;
  if length(normalized_supplier_name) not between 2 and 160
    or normalized_supplier_name ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'valid corrected supplier name required';
  end if;
  if normalized_number is not null
    and (
      length(normalized_number) not between 2 and 80
      or normalized_number !~ '^[A-Za-z0-9][A-Za-z0-9._/ -]*$'
      or normalized_number ~ '[[:cntrl:]]'
    ) then
    raise exception using errcode = '22023', message = 'valid corrected optional invoice reference required';
  end if;
  if p_declared_total_pesewas is null
    or p_declared_total_pesewas <= 0
    or p_declared_total_pesewas > 100000000000000 then
    raise exception using errcode = '22023', message = 'valid corrected declared total required';
  end if;
  if p_invoice_date is null
    or p_invoice_date < date '2000-01-01'
    or p_invoice_date > (timezone('Africa/Accra', observed_at))::date then
    raise exception using errcode = '22023', message = 'valid corrected invoice date required';
  end if;
  if (
      normalized_notes is not null
      and (length(normalized_notes) > 1000 or normalized_notes ~ '[[:cntrl:]]')
    )
    or length(normalized_reason) not between 5 and 500
    or normalized_reason ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'valid correction reason and notes required';
  end if;

  before_data := jsonb_build_object(
    'supplier_name', invoice_record.supplier_name,
    'supplier_invoice_number', invoice_record.supplier_invoice_number,
    'invoice_date', invoice_record.invoice_date,
    'declared_total_pesewas', invoice_record.declared_total_pesewas,
    'notes', invoice_record.notes
  );
  after_data := jsonb_build_object(
    'supplier_name', normalized_supplier_name,
    'supplier_invoice_number', normalized_number,
    'invoice_date', p_invoice_date,
    'declared_total_pesewas', p_declared_total_pesewas,
    'notes', normalized_notes
  );

  if before_data = after_data then
    raise exception using errcode = '22023', message = 'correction must change invoice data';
  end if;

  if invoice_record.confirmed_at is not null then
    confirmation_reset := true;
  end if;

  update public.supplier_invoices
  set supplier_name = normalized_supplier_name,
      supplier_invoice_number = normalized_number,
      invoice_date = p_invoice_date,
      declared_total_pesewas = p_declared_total_pesewas,
      notes = normalized_notes,
      confirmed_at = null,
      confirmed_by_user_id = null,
      confirmed_by_membership_id = null,
      confirmed_by_display_name = null,
      updated_at = observed_at
  where id = invoice_record.id;

  insert into public.supplier_invoice_corrections (
    id, store_id, invoice_id, line_id, entity_type, before_data, after_data,
    reason, actor_user_id, actor_membership_id, actor_display_name, created_at
  )
  values (
    new_correction_id, invoice_record.store_id, invoice_record.id, null,
    'invoice', before_data, after_data, normalized_reason,
    caller_user_id, caller_membership_id, caller_display_name, observed_at
  );

  perform private.opening_stock_audit(
    invoice_record.store_id, caller_user_id, caller_membership_id,
    'opening_stock.invoice_corrected', 'supplier_invoice', invoice_record.id,
    jsonb_build_object(
      'correction_id', new_correction_id,
      'reason', normalized_reason,
      'confirmation_reset', confirmation_reset
    ),
    observed_at
  );

  return query select new_correction_id, 'corrected'::text;
end;
$$;

create or replace function public.correct_supplier_invoice_line(
  p_invoice_line_id uuid,
  p_quantity_invoiced integer,
  p_unit_cost_pesewas bigint,
  p_reason text
)
returns table (correction_id uuid, result text)
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
  normalized_reason text := btrim(coalesce(p_reason, ''));
  received_count integer;
  before_data jsonb;
  after_data jsonb;
  new_correction_id uuid := gen_random_uuid();
  confirmation_reset boolean := false;
  observed_at timestamptz := statement_timestamp();
begin
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

  caller_membership_id := private.opening_stock_actor_membership(invoice_record.store_id, false);
  caller_display_name := private.opening_stock_actor_name(caller_user_id);

  if invoice_record.status <> 'open' then
    raise exception using errcode = '23514', message = 'closed invoice line cannot be corrected';
  end if;
  if p_quantity_invoiced is null or p_quantity_invoiced not between 1 and 1000 then
    raise exception using errcode = '22023', message = 'corrected quantity must be between 1 and 1000';
  end if;
  if p_unit_cost_pesewas is null
    or p_unit_cost_pesewas <= 0
    or p_unit_cost_pesewas > 100000000000000 then
    raise exception using errcode = '22023', message = 'corrected unit cost must be positive integer pesewas';
  end if;
  if length(normalized_reason) not between 5 and 500
    or normalized_reason ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'valid correction reason required';
  end if;

  select count(*)::integer into received_count
  from public.opening_stock_units opening_unit
  where opening_unit.invoice_line_id = line_record.id;

  if p_quantity_invoiced < received_count then
    raise exception using errcode = '23514', message = 'corrected quantity cannot be less than received devices';
  end if;
  if p_unit_cost_pesewas <> line_record.unit_cost_pesewas and received_count > 0 then
    raise exception using errcode = '23514', message = 'unit cost is immutable after devices are received';
  end if;

  before_data := jsonb_build_object(
    'quantity_invoiced', line_record.quantity_invoiced,
    'unit_cost_pesewas', line_record.unit_cost_pesewas
  );
  after_data := jsonb_build_object(
    'quantity_invoiced', p_quantity_invoiced,
    'unit_cost_pesewas', p_unit_cost_pesewas
  );
  if before_data = after_data then
    raise exception using errcode = '22023', message = 'correction must change invoice line data';
  end if;

  update public.supplier_invoice_lines
  set quantity_invoiced = p_quantity_invoiced,
      unit_cost_pesewas = p_unit_cost_pesewas,
      updated_at = observed_at
  where id = line_record.id;

  if invoice_record.confirmed_at is not null then
    update public.supplier_invoices
    set confirmed_at = null,
        confirmed_by_user_id = null,
        confirmed_by_membership_id = null,
        confirmed_by_display_name = null,
        updated_at = observed_at
    where id = invoice_record.id;
    confirmation_reset := true;
  end if;

  insert into public.supplier_invoice_corrections (
    id, store_id, invoice_id, line_id, entity_type, before_data, after_data,
    reason, actor_user_id, actor_membership_id, actor_display_name, created_at
  )
  values (
    new_correction_id, line_record.store_id, line_record.invoice_id,
    line_record.id, 'invoice_line', before_data, after_data, normalized_reason,
    caller_user_id, caller_membership_id, caller_display_name, observed_at
  );

  perform private.opening_stock_audit(
    line_record.store_id, caller_user_id, caller_membership_id,
    'opening_stock.invoice_line_corrected', 'supplier_invoice_line', line_record.id,
    jsonb_build_object(
      'correction_id', new_correction_id,
      'reason', normalized_reason,
      'confirmation_reset', confirmation_reset
    ),
    observed_at
  );

  return query select new_correction_id, 'corrected'::text;
end;
$$;

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

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'imei', private.normalize_opening_stock_imei(batch_item.value ->> 'imei'),
        'colour', btrim(coalesce(batch_item.value ->> 'colour', '')),
        'condition', lower(btrim(coalesce(batch_item.value ->> 'condition', ''))),
        'battery_health', case
          when coalesce(batch_item.value ->> 'battery_health', '') ~ '^[0-9]{1,3}$'
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

  if exists (
    select 1
    from jsonb_array_elements(normalized_devices) as normalized_item(value)
    where coalesce(private.is_valid_opening_stock_imei(normalized_item.value ->> 'imei'), false) is not true
      or length(normalized_item.value ->> 'colour') not between 2 and 60
      or (normalized_item.value ->> 'colour') ~ '[[:cntrl:]]'
      or normalized_item.value ->> 'condition' not in ('excellent', 'good', 'fair')
      or (normalized_item.value ->> 'battery_health')::integer is null
      or (normalized_item.value ->> 'battery_health')::integer not between 1 and 100
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
      (normalized_item.value ->> 'battery_health')::integer as device_battery_health,
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
      'imei_suffixes', to_jsonb(imei_suffixes)
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

create or replace function public.reprice_opening_stock_unit(
  p_unit_id uuid,
  p_expected_price_pesewas bigint,
  p_new_price_pesewas bigint,
  p_reason text,
  p_price_confirmed boolean
)
returns table (
  unit_id uuid,
  old_price_pesewas bigint,
  new_price_pesewas bigint,
  price_change_id uuid
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
  inventory_record public.store_inventory%rowtype;
  normalized_reason text := btrim(coalesce(p_reason, ''));
  previous_price bigint;
  new_change_id uuid := gen_random_uuid();
  observed_at timestamptz := statement_timestamp();
begin
  if p_price_confirmed is distinct from true then
    raise exception using errcode = '22023', message = 'manager must confirm approved repricing';
  end if;
  if p_expected_price_pesewas is null
    or p_expected_price_pesewas <= 0
    or p_new_price_pesewas is null
    or p_new_price_pesewas <= 0
    or p_new_price_pesewas > 100000000000000 then
    raise exception using errcode = '22023', message = 'expected and replacement prices must be positive integer pesewas';
  end if;
  if p_expected_price_pesewas = p_new_price_pesewas then
    raise exception using errcode = '22023', message = 'repricing must change the approved price';
  end if;
  if length(normalized_reason) not between 5 and 500
    or normalized_reason ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'meaningful repricing reason required';
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

  if target_unit.status <> 'activated'
    or target_unit.store_inventory_id is null
    or target_unit.approved_price_pesewas is null then
    raise exception using errcode = '23514', message = 'only activated units can be repriced';
  end if;

  select inventory.* into inventory_record
  from public.store_inventory inventory
  where inventory.id = target_unit.store_inventory_id
  for update;

  if not found
    or inventory_record.store_id <> target_unit.store_id
    or inventory_record.device_id <> target_unit.inventory_device_id then
    raise exception using errcode = '42501', message = 'unit inventory identity is inconsistent';
  end if;

  if inventory_record.status <> 'available'
    or exists (
      select 1 from public.inventory_reservations reservation
      where reservation.store_inventory_id = inventory_record.id
        and reservation.status = 'active'
    ) then
    raise exception using errcode = '23514', message = 'reserved or sold inventory cannot be repriced';
  end if;

  previous_price := target_unit.approved_price_pesewas;
  if previous_price <> p_expected_price_pesewas
    or inventory_record.price_pesewas <> p_expected_price_pesewas then
    raise exception using errcode = '23514', message = 'approved price changed; reload before repricing';
  end if;
  if inventory_record.price_pesewas <> previous_price then
    raise exception using errcode = '23514', message = 'unit and listed prices are inconsistent';
  end if;

  update public.store_inventory
  set price_pesewas = p_new_price_pesewas,
      updated_at = observed_at
  where id = inventory_record.id;

  update public.opening_stock_units
  set approved_price_pesewas = p_new_price_pesewas,
      updated_at = observed_at
  where id = target_unit.id;

  insert into public.opening_stock_price_changes (
    id, store_id, unit_id, store_inventory_id, old_price_pesewas,
    new_price_pesewas, reason, actor_user_id, actor_membership_id,
    actor_display_name, created_at
  )
  values (
    new_change_id, target_unit.store_id, target_unit.id, inventory_record.id,
    previous_price, p_new_price_pesewas, normalized_reason,
    caller_user_id, caller_membership_id, caller_display_name, observed_at
  );

  insert into public.inventory_movements (
    store_id, store_inventory_id, device_id, movement_type, from_status,
    to_status, actor_user_id, actor_membership_id, reason, metadata, occurred_at
  )
  values (
    target_unit.store_id, inventory_record.id, inventory_record.device_id,
    'adjustment', inventory_record.status, inventory_record.status,
    caller_user_id, caller_membership_id, normalized_reason,
    jsonb_build_object(
      'opening_stock_unit_id', target_unit.id,
      'price_change_id', new_change_id,
      'old_price_pesewas', previous_price,
      'new_price_pesewas', p_new_price_pesewas
    ),
    observed_at
  );

  perform private.opening_stock_audit(
    target_unit.store_id, caller_user_id, caller_membership_id,
    'opening_stock.unit_repriced', 'opening_stock_unit', target_unit.id,
    jsonb_build_object(
      'price_change_id', new_change_id,
      'old_price_pesewas', previous_price,
      'new_price_pesewas', p_new_price_pesewas,
      'reason', normalized_reason
    ),
    observed_at
  );

  return query
  select target_unit.id, previous_price, p_new_price_pesewas, new_change_id;
end;
$$;

-- Least-privilege grants: authenticated users can read the permission-checked
-- views but cannot read purchase-cost columns or write any workflow table.
revoke all on function private.normalize_opening_stock_imei(text) from public;
revoke all on function private.is_valid_opening_stock_imei(text) from public;
revoke all on function private.is_valid_opening_stock_inspection(jsonb) from public;
revoke all on function private.opening_stock_cost_visible(uuid) from public;
revoke all on function private.opening_stock_actor_membership(uuid, boolean) from public;
revoke all on function private.opening_stock_actor_name(uuid) from public;
revoke all on function private.opening_stock_audit(uuid, uuid, uuid, text, text, uuid, jsonb, timestamptz) from public;
revoke all on function private.opening_stock_lock_imei(text) from public;
revoke all on function private.opening_stock_imei_available(text, uuid) from public;
revoke all on function private.opening_stock_line_cost(uuid) from public;
revoke all on function private.opening_stock_line_total(uuid) from public;
revoke all on function private.opening_stock_invoice_declared_total(uuid) from public;
revoke all on function private.opening_stock_invoice_total(uuid) from public;
revoke all on function private.opening_stock_invoice_reconciled(uuid) from public;
revoke all on function private.opening_stock_unit_cost(uuid) from public;
revoke all on function private.prevent_opening_stock_ledger_mutation() from public;
revoke all on function private.prevent_opening_stock_unit_delete() from public;
revoke all on function private.validate_opening_stock_unit_update() from public;

grant execute on function private.is_active_store_member(uuid) to service_role;
grant execute on function private.has_store_permission(uuid, text) to service_role;
grant execute on function private.normalize_opening_stock_imei(text) to authenticated, service_role;
grant execute on function private.is_valid_opening_stock_imei(text) to authenticated, service_role;
grant execute on function private.is_valid_opening_stock_inspection(jsonb) to authenticated, service_role;
grant execute on function private.opening_stock_cost_visible(uuid) to authenticated, service_role;
grant execute on function private.opening_stock_line_cost(uuid) to authenticated, service_role;
grant execute on function private.opening_stock_line_total(uuid) to authenticated, service_role;
grant execute on function private.opening_stock_invoice_declared_total(uuid) to authenticated, service_role;
grant execute on function private.opening_stock_invoice_total(uuid) to authenticated, service_role;
grant execute on function private.opening_stock_invoice_reconciled(uuid) to authenticated, service_role;
grant execute on function private.opening_stock_unit_cost(uuid) to authenticated, service_role;

revoke all on table public.opening_stock_models from anon, authenticated, service_role;
revoke all on table public.supplier_invoices from anon, authenticated, service_role;
revoke all on table public.supplier_invoice_lines from anon, authenticated, service_role;
revoke all on table public.opening_stock_units from anon, authenticated, service_role;
revoke all on table public.supplier_invoice_corrections from anon, authenticated, service_role;
revoke all on table public.opening_stock_price_changes from anon, authenticated, service_role;

grant select on table public.opening_stock_models to authenticated;
grant select (
  id, store_id, supplier_name, supplier_invoice_number, invoice_date,
  currency, status, notes, created_by_user_id, created_by_membership_id,
  created_by_display_name, closed_at, confirmed_at, confirmed_by_user_id,
  confirmed_by_membership_id, confirmed_by_display_name, created_at, updated_at
) on table public.supplier_invoices to authenticated;
grant select (
  id, invoice_id, store_id, line_number, model_catalogue_id, device_model_id,
  quantity_invoiced, currency, notes, created_by_user_id,
  created_by_membership_id, created_by_display_name, created_at, updated_at
) on table public.supplier_invoice_lines to authenticated;
grant select (
  id, store_id, invoice_line_id, device_model_id, imei, colour, condition,
  battery_health, inspection, status, approved_price_pesewas,
  inventory_device_id, store_inventory_id, received_by_user_id,
  received_by_membership_id, received_by_display_name, received_at,
  activated_by_user_id, activated_by_membership_id,
  activated_by_display_name, activated_at, created_at, updated_at
) on table public.opening_stock_units to authenticated;
grant select on table public.supplier_invoice_corrections to authenticated;
grant select on table public.opening_stock_price_changes to authenticated;

grant select, insert, update on table public.opening_stock_models to service_role;
grant select, insert, update on table public.supplier_invoices to service_role;
grant select, insert, update on table public.supplier_invoice_lines to service_role;
grant select, insert, update on table public.opening_stock_units to service_role;
grant select, insert on table public.supplier_invoice_corrections to service_role;
grant select, insert on table public.opening_stock_price_changes to service_role;

revoke all on table public.opening_stock_models_view from anon, authenticated, service_role;
revoke all on table public.opening_stock_invoices_view from anon, authenticated, service_role;
revoke all on table public.opening_stock_invoice_lines_view from anon, authenticated, service_role;
revoke all on table public.opening_stock_units_view from anon, authenticated, service_role;
revoke all on table public.opening_stock_corrections_view from anon, authenticated, service_role;
revoke all on table public.opening_stock_price_changes_view from anon, authenticated, service_role;
revoke all on table public.opening_stock_invoice_reconciliation_view from anon, authenticated, service_role;
grant select on table public.opening_stock_models_view to authenticated, service_role;
grant select on table public.opening_stock_invoices_view to authenticated, service_role;
grant select on table public.opening_stock_invoice_lines_view to authenticated, service_role;
grant select on table public.opening_stock_units_view to authenticated, service_role;
grant select on table public.opening_stock_corrections_view to authenticated, service_role;
grant select on table public.opening_stock_price_changes_view to authenticated, service_role;
grant select on table public.opening_stock_invoice_reconciliation_view to authenticated, service_role;

revoke all on function public.register_opening_stock_model(uuid, text, integer, text) from public, anon, authenticated, service_role;
revoke all on function public.create_supplier_invoice(uuid, text, text, date, bigint, text) from public, anon, authenticated, service_role;
revoke all on function public.confirm_supplier_invoice(uuid, bigint, integer, integer, bigint, boolean) from public, anon, authenticated, service_role;
revoke all on function public.add_supplier_invoice_line(uuid, uuid, integer, bigint, text) from public, anon, authenticated, service_role;
revoke all on function public.correct_supplier_invoice(uuid, text, text, date, bigint, text, text) from public, anon, authenticated, service_role;
revoke all on function public.correct_supplier_invoice_line(uuid, integer, bigint, text) from public, anon, authenticated, service_role;
revoke all on function public.receive_opening_stock_devices(uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.receive_opening_stock_device(uuid, text, text, text, integer, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.activate_opening_stock_unit(uuid, bigint, boolean) from public, anon, authenticated, service_role;
revoke all on function public.reprice_opening_stock_unit(uuid, bigint, bigint, text, boolean) from public, anon, authenticated, service_role;

grant execute on function public.register_opening_stock_model(uuid, text, integer, text) to authenticated;
grant execute on function public.create_supplier_invoice(uuid, text, text, date, bigint, text) to authenticated;
grant execute on function public.confirm_supplier_invoice(uuid, bigint, integer, integer, bigint, boolean) to authenticated;
grant execute on function public.add_supplier_invoice_line(uuid, uuid, integer, bigint, text) to authenticated;
grant execute on function public.correct_supplier_invoice(uuid, text, text, date, bigint, text, text) to authenticated;
grant execute on function public.correct_supplier_invoice_line(uuid, integer, bigint, text) to authenticated;
grant execute on function public.receive_opening_stock_devices(uuid, jsonb) to authenticated;
grant execute on function public.receive_opening_stock_device(uuid, text, text, text, integer, jsonb) to authenticated;
grant execute on function public.activate_opening_stock_unit(uuid, bigint, boolean) to authenticated;
grant execute on function public.reprice_opening_stock_unit(uuid, bigint, bigint, text, boolean) to authenticated;

comment on table public.supplier_invoices is 'Store-scoped supplier invoices with an optional reference and an integer-pesewa declared total.';
comment on table public.supplier_invoice_lines is 'Invoice lines with manager-restricted integer-pesewa purchase cost.';
comment on table public.opening_stock_models is 'Store registrations of the existing global device model catalogue.';
comment on table public.opening_stock_units is 'Physically received, inspected, staged devices; no sellable inventory row exists until protected activation.';
comment on column public.opening_stock_units.unit_cost_pesewas is 'Manager-only purchase-cost snapshot; never granted to normal authenticated employees.';
comment on column public.opening_stock_units.approved_price_pesewas is 'Approved sale price, set only by protected activation or repricing.';
comment on table public.supplier_invoice_corrections is 'Append-only before/after invoice correction history with attributed actor and reason.';
comment on table public.opening_stock_price_changes is 'Append-only approved sale-price changes for activated opening-stock units.';
comment on view public.opening_stock_invoice_lines_view is 'Manager view with separate quantities and permission-masked purchase cost and line total.';
comment on view public.opening_stock_invoice_reconciliation_view is 'Manager view with calculated line totals, declared invoice total, difference, and permission-masked confirmation state.';
comment on function public.confirm_supplier_invoice(uuid, bigint, integer, integer, bigint, boolean) is 'Recomputes line totals under an invoice lock and records explicit manager confirmation only when they equal the stored declared total.';
comment on function public.activate_opening_stock_unit(uuid, bigint, boolean) is 'Atomically promotes an inspected staged unit into existing sellable inventory after manager pricing approval.';
comment on function public.reprice_opening_stock_unit(uuid, bigint, bigint, text, boolean) is 'Optimistically reprices one available activated unit with an audited, permission-checked price-change ledger.';

commit;
