begin;

-- Phase 2 models the exact device attributes already used by the employee and
-- manager inventory previews. Prices are stored as integer pesewas.
create table public.device_models (
  id uuid primary key default gen_random_uuid(),
  model_name text not null,
  storage_gb integer not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint device_models_name_not_blank check (length(btrim(model_name)) > 0),
  constraint device_models_storage_positive check (storage_gb > 0),
  constraint device_models_name_storage_unique unique (model_name, storage_gb)
);

create unique index device_models_name_storage_case_insensitive_unique
  on public.device_models (lower(model_name), storage_gb);

create or replace function private.is_valid_imei(candidate text)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  checksum integer := 0;
  digit_value integer;
  doubled_value integer;
  digit_position integer;
begin
  if candidate !~ '^[0-9]{15}$' then
    return false;
  end if;

  -- IMEIs use the Luhn check digit. For the first fourteen digits, digits in
  -- even positions (counting from the left) are doubled and reduced to their
  -- decimal digit sum. The fifteenth digit completes a multiple of ten.
  for digit_position in 1..14 loop
    digit_value := substring(candidate from digit_position for 1)::integer;
    if digit_position % 2 = 0 then
      doubled_value := digit_value * 2;
      checksum := checksum + (doubled_value / 10) + (doubled_value % 10);
    else
      checksum := checksum + digit_value;
    end if;
  end loop;

  checksum := checksum + substring(candidate from 15 for 1)::integer;
  return checksum % 10 = 0;
end;
$$;

create table public.inventory_devices (
  id uuid primary key default gen_random_uuid(),
  device_model_id uuid not null references public.device_models(id) on update cascade on delete restrict,
  imei text not null,
  colour text not null,
  condition text not null,
  battery_health integer not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint inventory_devices_imei_valid check (private.is_valid_imei(imei)),
  constraint inventory_devices_imei_unique unique (imei),
  constraint inventory_devices_colour_not_blank check (length(btrim(colour)) > 0),
  constraint inventory_devices_condition_valid check (condition in ('excellent', 'good', 'fair')),
  constraint inventory_devices_battery_health_valid check (battery_health between 1 and 100)
);

create index inventory_devices_model_idx
  on public.inventory_devices (device_model_id, id);

create table public.store_inventory (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on update cascade on delete restrict,
  device_id uuid not null references public.inventory_devices(id) on update cascade on delete restrict,
  status text not null default 'available',
  cost_pesewas bigint not null,
  price_pesewas bigint not null,
  received_at timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint store_inventory_device_unique unique (device_id),
  constraint store_inventory_identity_unique unique (id, store_id, device_id),
  constraint store_inventory_status_valid check (status in ('available', 'reserved', 'sold')),
  constraint store_inventory_cost_valid check (cost_pesewas >= 0),
  constraint store_inventory_price_valid check (price_pesewas > 0)
);

create index store_inventory_store_status_idx
  on public.store_inventory (store_id, status, received_at desc);
create index store_inventory_store_device_idx
  on public.store_inventory (store_id, device_id);

-- The composite key lets reservation and movement records prove that their
-- employee, membership and store all refer to the same active assignment.
alter table public.store_memberships
  add constraint store_memberships_identity_unique unique (id, store_id, user_id);

create table public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on update cascade on delete restrict,
  store_inventory_id uuid not null,
  device_id uuid not null,
  employee_user_id uuid not null references public.profiles(id) on update cascade on delete restrict,
  employee_membership_id uuid not null,
  status text not null default 'active',
  created_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  ended_by_user_id uuid references public.profiles(id) on update cascade on delete restrict,
  ended_by_membership_id uuid,
  end_reason text,
  updated_at timestamptz not null default statement_timestamp(),
  constraint inventory_reservations_inventory_fk
    foreign key (store_inventory_id, store_id, device_id)
    references public.store_inventory(id, store_id, device_id)
    on update cascade on delete restrict,
  constraint inventory_reservations_employee_membership_fk
    foreign key (employee_membership_id, store_id, employee_user_id)
    references public.store_memberships(id, store_id, user_id)
    on update cascade on delete restrict,
  constraint inventory_reservations_ended_membership_fk
    foreign key (ended_by_membership_id, store_id, ended_by_user_id)
    references public.store_memberships(id, store_id, user_id)
    on update cascade on delete restrict,
  constraint inventory_reservations_status_valid check (status in ('active', 'released', 'expired', 'fulfilled')),
  constraint inventory_reservations_expiry_after_creation check (expires_at > created_at),
  constraint inventory_reservations_lifecycle_consistent check (
    (
      status = 'active'
      and ended_at is null
      and ended_by_user_id is null
      and ended_by_membership_id is null
      and end_reason is null
    )
    or
    (
      status <> 'active'
      and ended_at is not null
      and ended_by_user_id is not null
      and ended_by_membership_id is not null
      and length(btrim(end_reason)) >= 3
    )
  )
);

create unique index inventory_reservations_one_active_per_inventory
  on public.inventory_reservations (store_inventory_id)
  where status = 'active';
create index inventory_reservations_store_status_expiry_idx
  on public.inventory_reservations (store_id, status, expires_at);
create index inventory_reservations_employee_status_idx
  on public.inventory_reservations (employee_user_id, status, created_at desc);
create index inventory_reservations_device_time_idx
  on public.inventory_reservations (device_id, created_at desc);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on update cascade on delete restrict,
  store_inventory_id uuid not null,
  device_id uuid not null,
  reservation_id uuid references public.inventory_reservations(id) on update cascade on delete restrict,
  movement_type text not null,
  from_status text,
  to_status text not null,
  actor_user_id uuid not null references public.profiles(id) on update cascade on delete restrict,
  actor_membership_id uuid not null,
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default statement_timestamp(),
  constraint inventory_movements_inventory_fk
    foreign key (store_inventory_id, store_id, device_id)
    references public.store_inventory(id, store_id, device_id)
    on update cascade on delete restrict,
  constraint inventory_movements_actor_membership_fk
    foreign key (actor_membership_id, store_id, actor_user_id)
    references public.store_memberships(id, store_id, user_id)
    on update cascade on delete restrict,
  constraint inventory_movements_type_valid check (
    movement_type in ('intake', 'reserved', 'reservation_released', 'reservation_expired', 'sold', 'adjustment')
  ),
  constraint inventory_movements_from_status_valid check (
    from_status is null or from_status in ('available', 'reserved', 'sold')
  ),
  constraint inventory_movements_to_status_valid check (to_status in ('available', 'reserved', 'sold')),
  constraint inventory_movements_reason_not_blank check (length(btrim(reason)) >= 3),
  constraint inventory_movements_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint inventory_movements_reservation_link_consistent check (
    (
      movement_type in ('reserved', 'reservation_released', 'reservation_expired', 'sold')
      and reservation_id is not null
    )
    or
    (
      movement_type in ('intake', 'adjustment')
      and reservation_id is null
    )
  ),
  constraint inventory_movements_transition_consistent check (
    (movement_type = 'intake' and from_status is null and to_status = 'available')
    or (movement_type = 'reserved' and from_status = 'available' and to_status = 'reserved')
    or (movement_type in ('reservation_released', 'reservation_expired') and from_status = 'reserved' and to_status = 'available')
    or (movement_type = 'sold' and from_status = 'reserved' and to_status = 'sold')
    or (movement_type = 'adjustment' and from_status = to_status)
  )
);

create index inventory_movements_store_time_idx
  on public.inventory_movements (store_id, occurred_at desc);
create index inventory_movements_inventory_time_idx
  on public.inventory_movements (store_inventory_id, occurred_at desc);
create index inventory_movements_device_time_idx
  on public.inventory_movements (device_id, occurred_at desc);
create index inventory_movements_reservation_idx
  on public.inventory_movements (reservation_id)
  where reservation_id is not null;

create trigger device_models_set_updated_at
before update on public.device_models
for each row execute function private.set_updated_at();

create trigger inventory_devices_set_updated_at
before update on public.inventory_devices
for each row execute function private.set_updated_at();

create trigger store_inventory_set_updated_at
before update on public.store_inventory
for each row execute function private.set_updated_at();

create trigger inventory_reservations_set_updated_at
before update on public.inventory_reservations
for each row execute function private.set_updated_at();

create or replace function private.validate_inventory_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'available' then
      raise exception using
        errcode = '23514',
        message = 'new store inventory must start as available';
    end if;
    return new;
  end if;

  if old.status = new.status then
    return new;
  end if;

  if not (
    (old.status = 'available' and new.status = 'reserved')
    or (old.status = 'reserved' and new.status in ('available', 'sold'))
  ) then
    raise exception using
      errcode = '23514',
      message = format('invalid inventory status transition: %s to %s', old.status, new.status);
  end if;

  return new;
end;
$$;

create trigger store_inventory_validate_status_transition
before insert or update of status on public.store_inventory
for each row execute function private.validate_inventory_status_transition();

create or replace function private.prevent_inventory_movement_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'inventory movements are append-only';
end;
$$;

create trigger inventory_movements_append_only
before update or delete on public.inventory_movements
for each row execute function private.prevent_inventory_movement_mutation();

create or replace function private.prevent_inventory_reservation_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'inventory reservations cannot be deleted';
end;
$$;

create trigger inventory_reservations_no_delete
before delete on public.inventory_reservations
for each row execute function private.prevent_inventory_reservation_delete();

create or replace function private.enforce_inventory_reservation_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_inventory_id uuid;
  inventory_status text;
  active_reservation_count integer;
begin
  if tg_table_name = 'store_inventory' then
    target_inventory_id := coalesce(new.id, old.id);
  else
    target_inventory_id := coalesce(new.store_inventory_id, old.store_inventory_id);
  end if;

  select inventory.status
  into inventory_status
  from public.store_inventory inventory
  where inventory.id = target_inventory_id;

  select count(*)::integer
  into active_reservation_count
  from public.inventory_reservations reservation
  where reservation.store_inventory_id = target_inventory_id
    and reservation.status = 'active';

  if inventory_status is null then
    if active_reservation_count <> 0 then
      raise exception 'active reservation cannot exist without store inventory';
    end if;
    return null;
  end if;

  if inventory_status = 'reserved' and active_reservation_count <> 1 then
    raise exception 'reserved inventory must have exactly one active reservation';
  end if;

  if inventory_status <> 'reserved' and active_reservation_count <> 0 then
    raise exception 'active reservation requires reserved inventory';
  end if;

  return null;
end;
$$;

create constraint trigger store_inventory_reservation_consistency
  after insert or update or delete on public.store_inventory
  deferrable initially deferred
  for each row execute function private.enforce_inventory_reservation_consistency();

create constraint trigger inventory_reservations_inventory_consistency
  after insert or update or delete on public.inventory_reservations
  deferrable initially deferred
  for each row execute function private.enforce_inventory_reservation_consistency();

create or replace function private.can_view_inventory_device(target_device_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.store_inventory inventory
    where inventory.device_id = target_device_id
      and private.has_store_permission(inventory.store_id, 'access_employee_workspace')
  );
$$;

create or replace function private.expire_inventory_reservation_locked(
  target_reservation_id uuid,
  actor_user_id uuid,
  actor_membership_id uuid,
  observed_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation_record public.inventory_reservations%rowtype;
  inventory_status text;
begin
  select reservation.*
  into reservation_record
  from public.inventory_reservations reservation
  where reservation.id = target_reservation_id
  for update;

  if not found
    or reservation_record.status <> 'active'
    or reservation_record.expires_at > observed_at then
    return false;
  end if;

  select inventory.status
  into inventory_status
  from public.store_inventory inventory
  where inventory.id = reservation_record.store_inventory_id;

  if inventory_status <> 'reserved' then
    raise exception 'active reservation has inconsistent inventory status';
  end if;

  update public.inventory_reservations
  set status = 'expired',
      ended_at = observed_at,
      ended_by_user_id = actor_user_id,
      ended_by_membership_id = actor_membership_id,
      end_reason = 'reservation expired'
  where id = reservation_record.id;

  update public.store_inventory
  set status = 'available'
  where id = reservation_record.store_inventory_id;

  insert into public.inventory_movements (
    store_id,
    store_inventory_id,
    device_id,
    reservation_id,
    movement_type,
    from_status,
    to_status,
    actor_user_id,
    actor_membership_id,
    reason,
    occurred_at
  )
  values (
    reservation_record.store_id,
    reservation_record.store_inventory_id,
    reservation_record.device_id,
    reservation_record.id,
    'reservation_expired',
    'reserved',
    'available',
    actor_user_id,
    actor_membership_id,
    'reservation expired',
    observed_at
  );

  insert into public.audit_events (
    store_id,
    actor_user_id,
    actor_membership_id,
    action,
    entity_type,
    entity_id,
    event_data,
    occurred_at
  )
  values (
    reservation_record.store_id,
    actor_user_id,
    actor_membership_id,
    'inventory.reservation_expired',
    'inventory_reservation',
    reservation_record.id,
    jsonb_build_object(
      'inventory_id', reservation_record.store_inventory_id,
      'device_id', reservation_record.device_id
    ),
    observed_at
  );

  return true;
end;
$$;

create or replace function public.reserve_inventory_device(
  p_store_id uuid,
  p_device_id uuid,
  p_ttl_minutes integer default 15
)
returns table (
  result text,
  reservation_id uuid,
  inventory_id uuid,
  device_id uuid,
  reservation_status text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  caller_membership_id uuid;
  inventory_record public.store_inventory%rowtype;
  active_reservation public.inventory_reservations%rowtype;
  has_active_reservation boolean;
  observed_at timestamptz;
  new_reservation_id uuid;
  new_expiry timestamptz;
begin
  if caller_user_id is null then
    raise exception using errcode = '28000', message = 'authentication required';
  end if;

  if p_ttl_minutes is null or p_ttl_minutes < 1 or p_ttl_minutes > 60 then
    raise exception using errcode = '22023', message = 'reservation duration must be between 1 and 60 minutes';
  end if;

  if not private.has_store_permission(p_store_id, 'reserve_inventory') then
    raise exception using errcode = '42501', message = 'active reserve_inventory permission required';
  end if;

  select membership.id
  into caller_membership_id
  from public.store_memberships membership
  where membership.store_id = p_store_id
    and membership.user_id = caller_user_id
    and membership.status = 'active';

  if caller_membership_id is null then
    raise exception using errcode = '42501', message = 'active store membership required';
  end if;

  select inventory.*
  into inventory_record
  from public.store_inventory inventory
  where inventory.store_id = p_store_id
    and inventory.device_id = p_device_id
  for update;

  if not found then
    return query
      select 'not_found'::text, null::uuid, null::uuid, p_device_id, null::text, null::timestamptz;
    return;
  end if;

  observed_at := clock_timestamp();

  select reservation.*
  into active_reservation
  from public.inventory_reservations reservation
  where reservation.store_inventory_id = inventory_record.id
    and reservation.status = 'active'
  for update;
  has_active_reservation := found;

  if inventory_record.status = 'sold' then
    return query
      select 'sold'::text, null::uuid, inventory_record.id, inventory_record.device_id, 'sold'::text, null::timestamptz;
    return;
  end if;

  if inventory_record.status = 'reserved' then
    if not has_active_reservation then
      raise exception 'reserved inventory has no active reservation';
    end if;

    if active_reservation.expires_at <= observed_at then
      perform private.expire_inventory_reservation_locked(
        active_reservation.id,
        caller_user_id,
        caller_membership_id,
        observed_at
      );
      inventory_record.status := 'available';
      has_active_reservation := false;
    elsif active_reservation.employee_user_id = caller_user_id then
      return query
        select
          'already_reserved_by_caller'::text,
          active_reservation.id,
          inventory_record.id,
          inventory_record.device_id,
          active_reservation.status,
          active_reservation.expires_at;
      return;
    else
      return query
        select
          'already_reserved'::text,
          null::uuid,
          inventory_record.id,
          inventory_record.device_id,
          active_reservation.status,
          active_reservation.expires_at;
      return;
    end if;
  end if;

  if inventory_record.status <> 'available' then
    return query
      select 'unavailable'::text, null::uuid, inventory_record.id, inventory_record.device_id, inventory_record.status, null::timestamptz;
    return;
  end if;

  if has_active_reservation then
    raise exception 'available inventory cannot have an active reservation';
  end if;

  new_reservation_id := gen_random_uuid();
  new_expiry := observed_at + make_interval(mins => p_ttl_minutes);

  insert into public.inventory_reservations (
    id,
    store_id,
    store_inventory_id,
    device_id,
    employee_user_id,
    employee_membership_id,
    status,
    created_at,
    expires_at,
    updated_at
  )
  values (
    new_reservation_id,
    p_store_id,
    inventory_record.id,
    inventory_record.device_id,
    caller_user_id,
    caller_membership_id,
    'active',
    observed_at,
    new_expiry,
    observed_at
  );

  update public.store_inventory
  set status = 'reserved'
  where id = inventory_record.id;

  insert into public.inventory_movements (
    store_id,
    store_inventory_id,
    device_id,
    reservation_id,
    movement_type,
    from_status,
    to_status,
    actor_user_id,
    actor_membership_id,
    reason,
    occurred_at
  )
  values (
    p_store_id,
    inventory_record.id,
    inventory_record.device_id,
    new_reservation_id,
    'reserved',
    'available',
    'reserved',
    caller_user_id,
    caller_membership_id,
    'device reserved for employee workflow',
    observed_at
  );

  insert into public.audit_events (
    store_id,
    actor_user_id,
    actor_membership_id,
    action,
    entity_type,
    entity_id,
    event_data,
    occurred_at
  )
  values (
    p_store_id,
    caller_user_id,
    caller_membership_id,
    'inventory.reserved',
    'inventory_reservation',
    new_reservation_id,
    jsonb_build_object(
      'inventory_id', inventory_record.id,
      'device_id', inventory_record.device_id,
      'expires_at', new_expiry
    ),
    observed_at
  );

  return query
    select 'reserved'::text, new_reservation_id, inventory_record.id, inventory_record.device_id, 'active'::text, new_expiry;
end;
$$;

create or replace function public.release_inventory_reservation(
  p_reservation_id uuid,
  p_reason text default 'released by employee'
)
returns table (
  result text,
  reservation_id uuid,
  inventory_id uuid,
  device_id uuid,
  reservation_status text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  caller_membership_id uuid;
  reservation_record public.inventory_reservations%rowtype;
  inventory_record public.store_inventory%rowtype;
  observed_at timestamptz;
  can_manage_inventory boolean;
  can_reserve_inventory boolean;
begin
  if caller_user_id is null then
    raise exception using errcode = '28000', message = 'authentication required';
  end if;

  if p_reason is null or length(btrim(p_reason)) < 3 or length(btrim(p_reason)) > 500 then
    raise exception using errcode = '22023', message = 'release reason must contain between 3 and 500 characters';
  end if;

  select reservation.*
  into reservation_record
  from public.inventory_reservations reservation
  where reservation.id = p_reservation_id;

  if not found then
    return query
      select 'not_found'::text, p_reservation_id, null::uuid, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  can_manage_inventory := private.has_store_permission(reservation_record.store_id, 'manage_inventory');
  can_reserve_inventory := private.has_store_permission(reservation_record.store_id, 'reserve_inventory');

  if not can_manage_inventory
    and not (reservation_record.employee_user_id = caller_user_id and can_reserve_inventory) then
    raise exception using errcode = '42501', message = 'reservation owner or manage_inventory permission required';
  end if;

  select membership.id
  into caller_membership_id
  from public.store_memberships membership
  where membership.store_id = reservation_record.store_id
    and membership.user_id = caller_user_id
    and membership.status = 'active';

  if caller_membership_id is null then
    raise exception using errcode = '42501', message = 'active store membership required';
  end if;

  select inventory.*
  into inventory_record
  from public.store_inventory inventory
  where inventory.id = reservation_record.store_inventory_id
  for update;

  if not found then
    raise exception 'reservation inventory does not exist';
  end if;

  select reservation.*
  into reservation_record
  from public.inventory_reservations reservation
  where reservation.id = p_reservation_id
  for update;

  if reservation_record.status <> 'active' then
    return query
      select
        reservation_record.status,
        reservation_record.id,
        reservation_record.store_inventory_id,
        reservation_record.device_id,
        reservation_record.status,
        reservation_record.expires_at;
    return;
  end if;

  observed_at := clock_timestamp();

  if reservation_record.expires_at <= observed_at then
    perform private.expire_inventory_reservation_locked(
      reservation_record.id,
      caller_user_id,
      caller_membership_id,
      observed_at
    );
    return query
      select
        'expired'::text,
        reservation_record.id,
        reservation_record.store_inventory_id,
        reservation_record.device_id,
        'expired'::text,
        reservation_record.expires_at;
    return;
  end if;

  if inventory_record.status <> 'reserved' then
    raise exception 'active reservation has inconsistent inventory status';
  end if;

  update public.inventory_reservations
  set status = 'released',
      ended_at = observed_at,
      ended_by_user_id = caller_user_id,
      ended_by_membership_id = caller_membership_id,
      end_reason = btrim(p_reason)
  where id = reservation_record.id;

  update public.store_inventory
  set status = 'available'
  where id = inventory_record.id;

  insert into public.inventory_movements (
    store_id,
    store_inventory_id,
    device_id,
    reservation_id,
    movement_type,
    from_status,
    to_status,
    actor_user_id,
    actor_membership_id,
    reason,
    occurred_at
  )
  values (
    reservation_record.store_id,
    reservation_record.store_inventory_id,
    reservation_record.device_id,
    reservation_record.id,
    'reservation_released',
    'reserved',
    'available',
    caller_user_id,
    caller_membership_id,
    btrim(p_reason),
    observed_at
  );

  insert into public.audit_events (
    store_id,
    actor_user_id,
    actor_membership_id,
    action,
    entity_type,
    entity_id,
    event_data,
    occurred_at
  )
  values (
    reservation_record.store_id,
    caller_user_id,
    caller_membership_id,
    'inventory.reservation_released',
    'inventory_reservation',
    reservation_record.id,
    jsonb_build_object(
      'inventory_id', reservation_record.store_inventory_id,
      'device_id', reservation_record.device_id,
      'reason', btrim(p_reason)
    ),
    observed_at
  );

  return query
    select
      'released'::text,
      reservation_record.id,
      reservation_record.store_inventory_id,
      reservation_record.device_id,
      'released'::text,
      reservation_record.expires_at;
end;
$$;

create or replace function public.expire_inventory_reservations(
  p_store_id uuid,
  p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  caller_membership_id uuid;
  candidate record;
  observed_at timestamptz;
  expired_count integer := 0;
begin
  if caller_user_id is null then
    raise exception using errcode = '28000', message = 'authentication required';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception using errcode = '22023', message = 'expiry batch limit must be between 1 and 500';
  end if;

  if not (
    private.has_store_permission(p_store_id, 'reserve_inventory')
    or private.has_store_permission(p_store_id, 'manage_inventory')
  ) then
    raise exception using errcode = '42501', message = 'inventory reservation permission required';
  end if;

  select membership.id
  into caller_membership_id
  from public.store_memberships membership
  where membership.store_id = p_store_id
    and membership.user_id = caller_user_id
    and membership.status = 'active';

  if caller_membership_id is null then
    raise exception using errcode = '42501', message = 'active store membership required';
  end if;

  for candidate in
    select reservation.id, reservation.store_inventory_id
    from public.inventory_reservations reservation
    where reservation.store_id = p_store_id
      and reservation.status = 'active'
      and reservation.expires_at <= clock_timestamp()
    order by reservation.expires_at, reservation.id
    limit p_limit
  loop
    perform 1
    from public.store_inventory inventory
    where inventory.id = candidate.store_inventory_id
    for update;

    if not found then
      raise exception 'reservation inventory does not exist';
    end if;

    observed_at := clock_timestamp();
    if private.expire_inventory_reservation_locked(
      candidate.id,
      caller_user_id,
      caller_membership_id,
      observed_at
    ) then
      expired_count := expired_count + 1;
    end if;
  end loop;

  return expired_count;
end;
$$;

revoke all on function private.is_valid_imei(text) from public;
revoke all on function private.validate_inventory_status_transition() from public;
revoke all on function private.prevent_inventory_movement_mutation() from public;
revoke all on function private.prevent_inventory_reservation_delete() from public;
revoke all on function private.enforce_inventory_reservation_consistency() from public;
revoke all on function private.can_view_inventory_device(uuid) from public;
revoke all on function private.expire_inventory_reservation_locked(uuid, uuid, uuid, timestamptz) from public;

grant execute on function private.is_valid_imei(text) to service_role;
grant execute on function private.can_view_inventory_device(uuid) to authenticated;

alter table public.device_models enable row level security;
alter table public.device_models force row level security;
alter table public.inventory_devices enable row level security;
alter table public.inventory_devices force row level security;
alter table public.store_inventory enable row level security;
alter table public.store_inventory force row level security;
alter table public.inventory_reservations enable row level security;
alter table public.inventory_reservations force row level security;
alter table public.inventory_movements enable row level security;
alter table public.inventory_movements force row level security;

create policy device_models_select_active_members
on public.device_models
for select
to authenticated
using (private.has_any_active_membership());

create policy inventory_devices_select_store_members
on public.inventory_devices
for select
to authenticated
using (private.can_view_inventory_device(id));

create policy store_inventory_select_store_members
on public.store_inventory
for select
to authenticated
using (private.has_store_permission(store_id, 'access_employee_workspace'));

create policy inventory_reservations_select_owner_or_managers
on public.inventory_reservations
for select
to authenticated
using (
  employee_user_id = auth.uid()
  or private.has_store_permission(store_id, 'manage_inventory')
);

create policy inventory_movements_select_inventory_managers
on public.inventory_movements
for select
to authenticated
using (private.has_store_permission(store_id, 'manage_inventory'));

revoke all on table public.device_models from anon, authenticated, service_role;
revoke all on table public.inventory_devices from anon, authenticated, service_role;
revoke all on table public.store_inventory from anon, authenticated, service_role;
revoke all on table public.inventory_reservations from anon, authenticated, service_role;
revoke all on table public.inventory_movements from anon, authenticated, service_role;

grant select on table public.device_models to authenticated;
grant select on table public.inventory_devices to authenticated;
grant select (
  id,
  store_id,
  device_id,
  status,
  price_pesewas,
  received_at,
  created_at,
  updated_at
) on table public.store_inventory to authenticated;
grant select on table public.inventory_reservations to authenticated;
grant select on table public.inventory_movements to authenticated;

grant select, insert, update on table public.device_models to service_role;
grant select, insert, update on table public.inventory_devices to service_role;
grant select, insert, update on table public.store_inventory to service_role;
grant select, insert, update on table public.inventory_reservations to service_role;
grant select, insert on table public.inventory_movements to service_role;

revoke all on function public.reserve_inventory_device(uuid, uuid, integer) from public;
revoke all on function public.release_inventory_reservation(uuid, text) from public;
revoke all on function public.expire_inventory_reservations(uuid, integer) from public;
grant execute on function public.reserve_inventory_device(uuid, uuid, integer) to authenticated;
grant execute on function public.release_inventory_reservation(uuid, text) to authenticated;
grant execute on function public.expire_inventory_reservations(uuid, integer) to authenticated;

comment on table public.device_models is 'Device model and storage combinations used by physical inventory records.';
comment on table public.inventory_devices is 'Physical devices. IMEI is globally unique and must pass 15-digit Luhn validation.';
comment on table public.store_inventory is 'Current store assignment, stock state and integer-pesewa valuation for a physical device.';
comment on column public.store_inventory.cost_pesewas is 'Acquisition cost in integer Ghana pesewas. Not granted to normal authenticated employees.';
comment on column public.store_inventory.price_pesewas is 'Current listed selling price in integer Ghana pesewas.';
comment on table public.inventory_reservations is 'Preserved reservation lifecycle for one store inventory item and employee.';
comment on table public.inventory_movements is 'Append-only inventory state and adjustment history.';
comment on function public.reserve_inventory_device(uuid, uuid, integer) is 'Atomically reserves an available device for the authenticated store member. Locks the store inventory row to serialize competing requests.';
comment on function public.release_inventory_reservation(uuid, text) is 'Releases an active reservation for its owner or a member with manage_inventory permission.';
comment on function public.expire_inventory_reservations(uuid, integer) is 'Expires elapsed active reservations for an authorized store in bounded batches.';

commit;
