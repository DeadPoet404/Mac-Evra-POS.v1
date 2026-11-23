begin;

-- Phase 5 persists customer and pre-payment sale state. Payment verification,
-- paid/completed statuses, receipts and inventory fulfilment intentionally remain
-- outside this migration.
create or replace function private.normalize_customer_phone(candidate text)
returns text
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  compact text := regexp_replace(btrim(candidate), '[^0-9+]', '', 'g');
  digits text;
begin
  if length(btrim(candidate)) < 7 or length(btrim(candidate)) > 32
    or candidate !~ '^[[:space:]()+0-9-]+$' then
    raise exception using errcode = '22023', message = 'valid customer phone number required';
  end if;

  if compact like '00%' then
    compact := '+' || substring(compact from 3);
  end if;

  if compact ~ '^0[0-9]{9}$' then
    compact := '+233' || substring(compact from 2);
  elsif compact ~ '^233[0-9]{9}$' then
    compact := '+' || compact;
  end if;

  digits := regexp_replace(compact, '[^0-9]', '', 'g');
  if length(digits) < 7 or length(digits) > 15
    or compact !~ '^\+?[0-9]+$' then
    raise exception using errcode = '22023', message = 'valid customer phone number required';
  end if;

  return compact;
end;
$$;

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on update cascade on delete restrict,
  full_name text not null,
  phone text not null,
  phone_normalized text not null,
  email text,
  notes text,
  created_by_user_id uuid not null references public.profiles(id) on update cascade on delete restrict,
  created_by_membership_id uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint customers_identity_store_unique unique (id, store_id),
  constraint customers_creator_membership_fk
    foreign key (created_by_membership_id, store_id, created_by_user_id)
    references public.store_memberships(id, store_id, user_id)
    on update cascade on delete restrict,
  constraint customers_name_valid check (length(btrim(full_name)) between 2 and 160),
  constraint customers_phone_valid check (length(btrim(phone)) between 7 and 32),
  constraint customers_phone_normalized_valid check (phone_normalized ~ '^\+?[0-9]{7,15}$'),
  constraint customers_email_normalized check (
    email is null
    or (
      email = lower(btrim(email))
      and length(email) between 3 and 320
      and position('@' in email) > 1
    )
  ),
  constraint customers_notes_bounded check (notes is null or length(notes) <= 2000)
);

create unique index customers_store_phone_unique
  on public.customers (store_id, phone_normalized);
create index customers_store_name_idx
  on public.customers (store_id, lower(full_name), created_at desc);
create index customers_store_email_idx
  on public.customers (store_id, lower(email))
  where email is not null;

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  sale_number text not null,
  store_id uuid not null references public.stores(id) on update cascade on delete restrict,
  created_by_user_id uuid not null references public.profiles(id) on update cascade on delete restrict,
  created_by_membership_id uuid not null,
  created_by_display_name text not null,
  customer_id uuid,
  status text not null default 'draft',
  subtotal_pesewas bigint not null default 0,
  discount_pesewas bigint not null default 0,
  total_pesewas bigint generated always as (subtotal_pesewas - discount_pesewas) stored,
  currency text not null default 'GHS',
  expires_at timestamptz not null,
  submitted_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint sales_identity_store_unique unique (id, store_id),
  constraint sales_number_unique unique (sale_number),
  constraint sales_creator_membership_fk
    foreign key (created_by_membership_id, store_id, created_by_user_id)
    references public.store_memberships(id, store_id, user_id)
    on update cascade on delete restrict,
  constraint sales_customer_store_fk
    foreign key (customer_id, store_id)
    references public.customers(id, store_id)
    on update cascade on delete restrict,
  constraint sales_number_format check (sale_number ~ '^ME-[0-9]{8}-[0-9A-F]{8}$'),
  constraint sales_creator_name_not_blank check (length(btrim(created_by_display_name)) between 1 and 160),
  constraint sales_status_valid check (status in ('draft', 'awaiting_payment', 'cancelled')),
  constraint sales_subtotal_valid check (subtotal_pesewas >= 0),
  constraint sales_discount_valid check (discount_pesewas >= 0 and discount_pesewas <= subtotal_pesewas),
  constraint sales_currency_ghs check (currency = 'GHS'),
  constraint sales_expiry_after_creation check (expires_at > created_at),
  constraint sales_lifecycle_consistent check (
    (
      status = 'draft'
      and submitted_at is null
      and cancelled_at is null
      and cancellation_reason is null
    )
    or
    (
      status = 'awaiting_payment'
      and submitted_at is not null
      and cancelled_at is null
      and cancellation_reason is null
    )
    or
    (
      status = 'cancelled'
      and cancelled_at is not null
      and length(btrim(cancellation_reason)) between 3 and 500
    )
  )
);

create index sales_store_status_created_idx
  on public.sales (store_id, status, created_at desc);
create index sales_creator_status_updated_idx
  on public.sales (created_by_user_id, status, updated_at desc);
create index sales_store_customer_idx
  on public.sales (store_id, customer_id, created_at desc)
  where customer_id is not null;
create index sales_store_expiry_idx
  on public.sales (store_id, status, expires_at)
  where status = 'draft';

alter table public.inventory_reservations
  add constraint inventory_reservations_sale_item_identity_unique
  unique (id, store_id, store_inventory_id, device_id);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null,
  store_id uuid not null,
  store_inventory_id uuid not null,
  device_id uuid not null,
  reservation_id uuid not null,
  device_model_id uuid not null references public.device_models(id) on update cascade on delete restrict,
  product_description text not null,
  imei text not null,
  quantity integer not null default 1,
  unit_price_pesewas bigint not null,
  discount_pesewas bigint not null default 0,
  line_total_pesewas bigint generated always as ((quantity::bigint * unit_price_pesewas) - discount_pesewas) stored,
  status text not null default 'active',
  removed_at timestamptz,
  removed_by_user_id uuid references public.profiles(id) on update cascade on delete restrict,
  removed_by_membership_id uuid,
  removal_reason text,
  created_at timestamptz not null default statement_timestamp(),
  constraint sale_items_sale_store_fk
    foreign key (sale_id, store_id)
    references public.sales(id, store_id)
    on update cascade on delete restrict,
  constraint sale_items_inventory_store_fk
    foreign key (store_inventory_id, store_id, device_id)
    references public.store_inventory(id, store_id, device_id)
    on update cascade on delete restrict,
  constraint sale_items_reservation_inventory_fk
    foreign key (reservation_id, store_id, store_inventory_id, device_id)
    references public.inventory_reservations(id, store_id, store_inventory_id, device_id)
    on update cascade on delete restrict,
  constraint sale_items_removed_membership_fk
    foreign key (removed_by_membership_id, store_id, removed_by_user_id)
    references public.store_memberships(id, store_id, user_id)
    on update cascade on delete restrict,
  constraint sale_items_description_not_blank check (length(btrim(product_description)) between 2 and 300),
  constraint sale_items_imei_valid check (private.is_valid_imei(imei)),
  constraint sale_items_quantity_one check (quantity = 1),
  constraint sale_items_unit_price_valid check (unit_price_pesewas > 0),
  constraint sale_items_discount_valid check (
    discount_pesewas >= 0
    and discount_pesewas < (quantity::bigint * unit_price_pesewas)
  ),
  constraint sale_items_status_valid check (status in ('active', 'removed')),
  constraint sale_items_removal_consistent check (
    (
      status = 'active'
      and removed_at is null
      and removed_by_user_id is null
      and removed_by_membership_id is null
      and removal_reason is null
    )
    or
    (
      status = 'removed'
      and removed_at is not null
      and removed_by_user_id is not null
      and removed_by_membership_id is not null
      and length(btrim(removal_reason)) between 3 and 500
    )
  )
);

create unique index sale_items_reservation_unique
  on public.sale_items (reservation_id);
create unique index sale_items_active_inventory_per_sale_unique
  on public.sale_items (sale_id, store_inventory_id)
  where status = 'active';
create index sale_items_sale_status_idx
  on public.sale_items (sale_id, status, created_at);
create index sale_items_store_device_idx
  on public.sale_items (store_id, device_id, created_at desc);
create index sale_items_imei_idx
  on public.sale_items (imei, created_at desc);

create trigger customers_set_updated_at
before update on public.customers
for each row execute function private.set_updated_at();

create trigger sales_set_updated_at
before update on public.sales
for each row execute function private.set_updated_at();

create or replace function private.prevent_sale_item_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'sale items cannot be deleted';
end;
$$;

create trigger sale_items_no_delete
before delete on public.sale_items
for each row execute function private.prevent_sale_item_delete();

create or replace function private.validate_sale_item_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.sale_id is distinct from old.sale_id
    or new.store_id is distinct from old.store_id
    or new.store_inventory_id is distinct from old.store_inventory_id
    or new.device_id is distinct from old.device_id
    or new.reservation_id is distinct from old.reservation_id
    or new.device_model_id is distinct from old.device_model_id
    or new.product_description is distinct from old.product_description
    or new.imei is distinct from old.imei
    or new.quantity is distinct from old.quantity
    or new.unit_price_pesewas is distinct from old.unit_price_pesewas
    or new.created_at is distinct from old.created_at then
    raise exception 'sale item identity and price snapshot are immutable';
  end if;

  if old.status = 'removed' then
    raise exception 'removed sale items are immutable';
  end if;

  if old.status = 'active' and new.status = 'active' then
    if new.removed_at is not null
      or new.removed_by_user_id is not null
      or new.removed_by_membership_id is not null
      or new.removal_reason is not null then
      raise exception 'active sale item cannot contain removal metadata';
    end if;
    return new;
  end if;

  if old.status = 'active' and new.status = 'removed' then
    return new;
  end if;

  raise exception 'invalid sale item lifecycle transition';
end;
$$;

create trigger sale_items_validate_update
before update on public.sale_items
for each row execute function private.validate_sale_item_update();

create or replace function private.sale_actor_membership(
  target_store_id uuid,
  required_permission text
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

  select membership.id
  into caller_membership_id
  from public.store_memberships membership
  join public.profiles profile on profile.id = membership.user_id
  join public.stores store_record on store_record.id = membership.store_id
  where membership.store_id = target_store_id
    and membership.user_id = caller_user_id
    and membership.status = 'active'
    and profile.status = 'active'
    and store_record.status = 'active'
  order by membership.created_at, membership.id
  limit 1
  for share of membership, profile, store_record;

  if caller_membership_id is null
    or not private.has_store_permission(target_store_id, required_permission) then
    raise exception using errcode = '42501', message = 'active store permission required';
  end if;

  return caller_membership_id;
end;
$$;

create or replace function private.can_view_sale(target_sale_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.sales sale_record
    where sale_record.id = target_sale_id
      and (
        (
          sale_record.created_by_user_id = auth.uid()
          and private.has_store_permission(sale_record.store_id, 'create_sales')
        )
        or private.has_store_permission(sale_record.store_id, 'access_manager_workspace')
      )
  );
$$;

create or replace function private.recalculate_sale_totals(target_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_subtotal bigint;
  next_discount bigint;
begin
  select
    coalesce(sum(item.quantity::bigint * item.unit_price_pesewas), 0),
    coalesce(sum(item.discount_pesewas), 0)
  into next_subtotal, next_discount
  from public.sale_items item
  where item.sale_id = target_sale_id
    and item.status = 'active';

  update public.sales
  set subtotal_pesewas = next_subtotal,
      discount_pesewas = next_discount
  where id = target_sale_id;
end;
$$;

create or replace function public.create_sale_draft(p_store_id uuid)
returns table (
  sale_id uuid,
  sale_number text,
  sale_status text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  caller_membership_id uuid;
  caller_display_name text;
  new_sale_id uuid := gen_random_uuid();
  new_sale_number text;
  observed_at timestamptz := clock_timestamp();
  new_expiry timestamptz := observed_at + interval '60 minutes';
begin
  caller_membership_id := private.sale_actor_membership(p_store_id, 'create_sales');

  select profile.display_name
  into caller_display_name
  from public.profiles profile
  where profile.id = caller_user_id;

  new_sale_number := 'ME-' || to_char(observed_at at time zone 'Africa/Accra', 'YYYYMMDD')
    || '-' || upper(substring(replace(new_sale_id::text, '-', '') from 1 for 8));

  insert into public.sales (
    id, sale_number, store_id, created_by_user_id,
    created_by_membership_id, created_by_display_name,
    status, expires_at, created_at, updated_at
  )
  values (
    new_sale_id, new_sale_number, p_store_id, caller_user_id,
    caller_membership_id, caller_display_name,
    'draft', new_expiry, observed_at, observed_at
  );

  insert into public.audit_events (
    store_id, actor_user_id, actor_membership_id, action,
    entity_type, entity_id, event_data, occurred_at
  )
  values (
    p_store_id, caller_user_id, caller_membership_id,
    'sale.draft_created', 'sale', new_sale_id,
    jsonb_build_object('sale_number', new_sale_number, 'status', 'draft'),
    observed_at
  );

  return query select new_sale_id, new_sale_number, 'draft'::text, new_expiry;
end;
$$;

create or replace function public.add_sale_item(
  p_sale_id uuid,
  p_device_id uuid
)
returns table (
  result text,
  sale_item_id uuid,
  reservation_id uuid,
  subtotal_pesewas bigint,
  discount_pesewas bigint,
  total_pesewas bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  caller_membership_id uuid;
  sale_record public.sales%rowtype;
  prior_item public.sale_items%rowtype;
  prior_reservation public.inventory_reservations%rowtype;
  reservation_result record;
  inventory_record record;
  linked_sale_id uuid;
  new_item_id uuid := gen_random_uuid();
  observed_at timestamptz := clock_timestamp();
  product_label text;
begin
  select sale_value.*
  into sale_record
  from public.sales sale_value
  where sale_value.id = p_sale_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'sale draft not found';
  end if;

  caller_membership_id := private.sale_actor_membership(sale_record.store_id, 'create_sales');
  if sale_record.created_by_user_id <> caller_user_id then
    raise exception using errcode = '42501', message = 'only the draft owner can modify this sale';
  end if;
  if sale_record.status <> 'draft' then
    raise exception using errcode = '23514', message = 'only a draft sale can be modified';
  end if;
  if sale_record.expires_at <= observed_at then
    raise exception using errcode = '23514', message = 'sale draft has expired';
  end if;

  select item.*
  into prior_item
  from public.sale_items item
  where item.sale_id = sale_record.id
    and item.device_id = p_device_id
    and item.status = 'active'
  for update;

  if found then
    select reservation.*
    into prior_reservation
    from public.inventory_reservations reservation
    where reservation.id = prior_item.reservation_id;

    if prior_reservation.status = 'active' and prior_reservation.expires_at > observed_at then
      return query
        select 'already_added'::text, prior_item.id, prior_item.reservation_id,
               sale_record.subtotal_pesewas, sale_record.discount_pesewas, sale_record.total_pesewas;
      return;
    end if;

    if prior_reservation.status = 'active' then
      perform public.release_inventory_reservation(prior_reservation.id, 'sale item reservation expired');
    end if;

    update public.sale_items
    set status = 'removed',
        removed_at = observed_at,
        removed_by_user_id = caller_user_id,
        removed_by_membership_id = caller_membership_id,
        removal_reason = 'reservation ended before checkout'
    where id = prior_item.id;
  end if;

  select reservation_call.*
  into reservation_result
  from public.reserve_inventory_device(sale_record.store_id, p_device_id, 60) reservation_call;

  if reservation_result.result not in ('reserved', 'already_reserved_by_caller') then
    perform private.recalculate_sale_totals(sale_record.id);
    select * into sale_record from public.sales where id = sale_record.id;
    return query
      select reservation_result.result, null::uuid, reservation_result.reservation_id,
             sale_record.subtotal_pesewas, sale_record.discount_pesewas, sale_record.total_pesewas;
    return;
  end if;

  select item.sale_id
  into linked_sale_id
  from public.sale_items item
  where item.reservation_id = reservation_result.reservation_id
    and item.status = 'active';

  if linked_sale_id is not null and linked_sale_id <> sale_record.id then
    return query
      select 'reserved_in_another_draft'::text, null::uuid, reservation_result.reservation_id,
             sale_record.subtotal_pesewas, sale_record.discount_pesewas, sale_record.total_pesewas;
    return;
  end if;

  select
    inventory.id as inventory_id,
    inventory.store_id,
    inventory.device_id,
    inventory.price_pesewas,
    device.device_model_id,
    device.imei,
    model.model_name,
    model.storage_gb,
    device.colour
  into inventory_record
  from public.store_inventory inventory
  join public.inventory_devices device on device.id = inventory.device_id
  join public.device_models model on model.id = device.device_model_id
  where inventory.id = reservation_result.inventory_id
    and inventory.store_id = sale_record.store_id
    and inventory.device_id = p_device_id
    and inventory.status = 'reserved';

  if not found then
    raise exception 'reserved inventory snapshot could not be loaded';
  end if;

  product_label := inventory_record.model_name || ' · ' || inventory_record.storage_gb::text
    || 'GB · ' || inventory_record.colour;

  insert into public.sale_items (
    id, sale_id, store_id, store_inventory_id, device_id, reservation_id,
    device_model_id, product_description, imei, quantity,
    unit_price_pesewas, discount_pesewas, status, created_at
  )
  values (
    new_item_id, sale_record.id, sale_record.store_id,
    inventory_record.inventory_id, inventory_record.device_id,
    reservation_result.reservation_id, inventory_record.device_model_id,
    product_label, inventory_record.imei, 1,
    inventory_record.price_pesewas, 0, 'active', observed_at
  );

  update public.sales
  set expires_at = least(sale_record.expires_at, reservation_result.expires_at)
  where id = sale_record.id;

  perform private.recalculate_sale_totals(sale_record.id);
  select * into sale_record from public.sales where id = sale_record.id;

  insert into public.audit_events (
    store_id, actor_user_id, actor_membership_id, action,
    entity_type, entity_id, event_data, occurred_at
  )
  values (
    sale_record.store_id, caller_user_id, caller_membership_id,
    'sale.item_added', 'sale_item', new_item_id,
    jsonb_build_object(
      'sale_id', sale_record.id,
      'device_id', inventory_record.device_id,
      'reservation_id', reservation_result.reservation_id,
      'unit_price_pesewas', inventory_record.price_pesewas
    ),
    observed_at
  );

  return query
    select 'added'::text, new_item_id, reservation_result.reservation_id,
           sale_record.subtotal_pesewas, sale_record.discount_pesewas, sale_record.total_pesewas;
end;
$$;

create or replace function public.remove_sale_item(
  p_sale_id uuid,
  p_sale_item_id uuid
)
returns table (
  result text,
  subtotal_pesewas bigint,
  discount_pesewas bigint,
  total_pesewas bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  caller_membership_id uuid;
  sale_record public.sales%rowtype;
  item_record public.sale_items%rowtype;
  reservation_record public.inventory_reservations%rowtype;
  observed_at timestamptz := clock_timestamp();
begin
  select sale_value.* into sale_record
  from public.sales sale_value
  where sale_value.id = p_sale_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'sale draft not found';
  end if;
  caller_membership_id := private.sale_actor_membership(sale_record.store_id, 'create_sales');
  if sale_record.created_by_user_id <> caller_user_id then
    raise exception using errcode = '42501', message = 'only the draft owner can modify this sale';
  end if;
  if sale_record.status <> 'draft' then
    raise exception using errcode = '23514', message = 'only a draft sale can be modified';
  end if;

  select item.* into item_record
  from public.sale_items item
  where item.id = p_sale_item_id
    and item.sale_id = sale_record.id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'sale item not found';
  end if;
  if item_record.status = 'removed' then
    return query
      select 'already_removed'::text, sale_record.subtotal_pesewas,
             sale_record.discount_pesewas, sale_record.total_pesewas;
    return;
  end if;

  select reservation.* into reservation_record
  from public.inventory_reservations reservation
  where reservation.id = item_record.reservation_id;

  if reservation_record.status = 'active' then
    perform public.release_inventory_reservation(reservation_record.id, 'device removed from sale draft');
  end if;

  update public.sale_items
  set status = 'removed',
      removed_at = observed_at,
      removed_by_user_id = caller_user_id,
      removed_by_membership_id = caller_membership_id,
      removal_reason = 'device removed from sale draft'
  where id = item_record.id;

  perform private.recalculate_sale_totals(sale_record.id);
  select * into sale_record from public.sales where id = sale_record.id;

  insert into public.audit_events (
    store_id, actor_user_id, actor_membership_id, action,
    entity_type, entity_id, event_data, occurred_at
  )
  values (
    sale_record.store_id, caller_user_id, caller_membership_id,
    'sale.item_removed', 'sale_item', item_record.id,
    jsonb_build_object(
      'sale_id', sale_record.id,
      'device_id', item_record.device_id,
      'reservation_id', item_record.reservation_id
    ),
    observed_at
  );

  return query
    select 'removed'::text, sale_record.subtotal_pesewas,
           sale_record.discount_pesewas, sale_record.total_pesewas;
end;
$$;

create or replace function public.set_sale_item_discount(
  p_sale_id uuid,
  p_sale_item_id uuid,
  p_discount_pesewas bigint
)
returns table (
  subtotal_pesewas bigint,
  discount_pesewas bigint,
  total_pesewas bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  caller_membership_id uuid;
  sale_record public.sales%rowtype;
  item_record public.sale_items%rowtype;
  observed_at timestamptz := clock_timestamp();
begin
  if p_discount_pesewas is null or p_discount_pesewas < 0 then
    raise exception using errcode = '22023', message = 'discount must be a non-negative integer amount';
  end if;

  select sale_value.* into sale_record
  from public.sales sale_value
  where sale_value.id = p_sale_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'sale draft not found';
  end if;
  caller_membership_id := private.sale_actor_membership(sale_record.store_id, 'create_sales');
  if sale_record.created_by_user_id <> caller_user_id then
    raise exception using errcode = '42501', message = 'only the draft owner can modify this sale';
  end if;
  if sale_record.status <> 'draft' then
    raise exception using errcode = '23514', message = 'only a draft sale can be modified';
  end if;
  if p_discount_pesewas > 0
    and not private.has_store_permission(sale_record.store_id, 'approve_discounts') then
    raise exception using errcode = '42501', message = 'approve_discounts permission required';
  end if;

  select item.* into item_record
  from public.sale_items item
  where item.id = p_sale_item_id
    and item.sale_id = sale_record.id
    and item.status = 'active'
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'active sale item not found';
  end if;
  if p_discount_pesewas >= item_record.unit_price_pesewas then
    raise exception using errcode = '22023', message = 'discount must be less than the item price';
  end if;

  update public.sale_items
  set discount_pesewas = p_discount_pesewas
  where id = item_record.id;

  perform private.recalculate_sale_totals(sale_record.id);
  select * into sale_record from public.sales where id = sale_record.id;

  if item_record.discount_pesewas <> p_discount_pesewas then
    insert into public.audit_events (
      store_id, actor_user_id, actor_membership_id, action,
      entity_type, entity_id, event_data, occurred_at
    )
    values (
      sale_record.store_id, caller_user_id, caller_membership_id,
      'sale.discount_updated', 'sale_item', item_record.id,
      jsonb_build_object(
        'sale_id', sale_record.id,
        'previous_discount_pesewas', item_record.discount_pesewas,
        'new_discount_pesewas', p_discount_pesewas
      ),
      observed_at
    );
  end if;

  return query
    select sale_record.subtotal_pesewas, sale_record.discount_pesewas, sale_record.total_pesewas;
end;
$$;

create or replace function public.set_sale_customer(
  p_sale_id uuid,
  p_customer_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  caller_membership_id uuid;
  sale_record public.sales%rowtype;
  observed_at timestamptz := clock_timestamp();
begin
  select sale_value.* into sale_record
  from public.sales sale_value
  where sale_value.id = p_sale_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'sale draft not found';
  end if;
  caller_membership_id := private.sale_actor_membership(sale_record.store_id, 'create_sales');
  if sale_record.created_by_user_id <> caller_user_id then
    raise exception using errcode = '42501', message = 'only the draft owner can modify this sale';
  end if;
  if sale_record.status <> 'draft' then
    raise exception using errcode = '23514', message = 'only a draft sale can be modified';
  end if;

  if p_customer_id is not null and not exists (
    select 1 from public.customers customer
    where customer.id = p_customer_id and customer.store_id = sale_record.store_id
  ) then
    raise exception using errcode = '42501', message = 'customer not found in sale store';
  end if;

  if sale_record.customer_id is distinct from p_customer_id then
    update public.sales set customer_id = p_customer_id where id = sale_record.id;

    insert into public.audit_events (
      store_id, actor_user_id, actor_membership_id, action,
      entity_type, entity_id, event_data, occurred_at
    )
    values (
      sale_record.store_id, caller_user_id, caller_membership_id,
      'sale.customer_associated', 'sale', sale_record.id,
      jsonb_build_object(
        'previous_customer_id', sale_record.customer_id,
        'customer_id', p_customer_id,
        'walk_in', p_customer_id is null
      ),
      observed_at
    );
  end if;
end;
$$;

create or replace function public.create_sale_customer(
  p_sale_id uuid,
  p_full_name text,
  p_phone text,
  p_email text default null,
  p_notes text default null
)
returns table (
  result text,
  customer_id uuid,
  full_name text,
  phone text,
  email text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  caller_membership_id uuid;
  sale_record public.sales%rowtype;
  customer_record public.customers%rowtype;
  normalized_name text := btrim(p_full_name);
  display_phone text := regexp_replace(btrim(p_phone), '[[:space:]]+', ' ', 'g');
  normalized_phone text;
  normalized_email text := nullif(lower(btrim(p_email)), '');
  normalized_notes text := nullif(btrim(p_notes), '');
  creation_result text;
  observed_at timestamptz := clock_timestamp();
begin
  if length(normalized_name) < 2 or length(normalized_name) > 160 then
    raise exception using errcode = '22023', message = 'customer full name must contain between 2 and 160 characters';
  end if;
  if normalized_email is not null and (
    length(normalized_email) > 320
    or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ) then
    raise exception using errcode = '22023', message = 'valid customer email required';
  end if;
  if normalized_notes is not null and length(normalized_notes) > 2000 then
    raise exception using errcode = '22023', message = 'customer notes must not exceed 2000 characters';
  end if;
  normalized_phone := private.normalize_customer_phone(p_phone);

  select sale_value.* into sale_record
  from public.sales sale_value
  where sale_value.id = p_sale_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'sale draft not found';
  end if;
  caller_membership_id := private.sale_actor_membership(sale_record.store_id, 'create_sales');
  if sale_record.created_by_user_id <> caller_user_id then
    raise exception using errcode = '42501', message = 'only the draft owner can modify this sale';
  end if;
  if sale_record.status <> 'draft' then
    raise exception using errcode = '23514', message = 'only a draft sale can be modified';
  end if;

  select customer.* into customer_record
  from public.customers customer
  where customer.store_id = sale_record.store_id
    and customer.phone_normalized = normalized_phone;

  if found then
    creation_result := 'existing';
  else
    insert into public.customers (
      store_id, full_name, phone, phone_normalized, email, notes,
      created_by_user_id, created_by_membership_id,
      created_at, updated_at
    )
    values (
      sale_record.store_id, normalized_name, display_phone, normalized_phone,
      normalized_email, normalized_notes, caller_user_id, caller_membership_id,
      observed_at, observed_at
    )
    on conflict (store_id, phone_normalized) do nothing
    returning * into customer_record;

    if found then
      creation_result := 'created';

      insert into public.audit_events (
        store_id, actor_user_id, actor_membership_id, action,
        entity_type, entity_id, event_data, occurred_at
      )
      values (
        sale_record.store_id, caller_user_id, caller_membership_id,
        'customer.created', 'customer', customer_record.id,
        jsonb_build_object('sale_id', sale_record.id),
        observed_at
      );
    else
      select customer.* into customer_record
      from public.customers customer
      where customer.store_id = sale_record.store_id
        and customer.phone_normalized = normalized_phone;
      creation_result := 'existing';
    end if;
  end if;

  update public.sales set customer_id = customer_record.id where id = sale_record.id;

  if sale_record.customer_id is distinct from customer_record.id then
    insert into public.audit_events (
      store_id, actor_user_id, actor_membership_id, action,
      entity_type, entity_id, event_data, occurred_at
    )
    values (
      sale_record.store_id, caller_user_id, caller_membership_id,
      'sale.customer_associated', 'sale', sale_record.id,
      jsonb_build_object(
        'previous_customer_id', sale_record.customer_id,
        'customer_id', customer_record.id,
        'walk_in', false
      ),
      observed_at
    );
  end if;

  return query
    select creation_result, customer_record.id, customer_record.full_name,
           customer_record.phone, customer_record.email;
end;
$$;

create or replace function public.submit_sale_for_payment(p_sale_id uuid)
returns table (
  sale_id uuid,
  sale_number text,
  sale_status text,
  total_pesewas bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  caller_membership_id uuid;
  sale_record public.sales%rowtype;
  observed_at timestamptz := clock_timestamp();
  item_count integer;
  invalid_item_count integer;
begin
  select sale_value.* into sale_record
  from public.sales sale_value
  where sale_value.id = p_sale_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'sale draft not found';
  end if;
  caller_membership_id := private.sale_actor_membership(sale_record.store_id, 'create_sales');
  if sale_record.created_by_user_id <> caller_user_id then
    raise exception using errcode = '42501', message = 'only the draft owner can submit this sale';
  end if;
  if sale_record.status = 'awaiting_payment' then
    return query select sale_record.id, sale_record.sale_number, sale_record.status, sale_record.total_pesewas;
    return;
  end if;
  if sale_record.status <> 'draft' then
    raise exception using errcode = '23514', message = 'only a draft sale can be submitted';
  end if;

  select count(*)::integer,
         count(*) filter (where
           reservation.status <> 'active'
           or reservation.expires_at <= observed_at
           or reservation.employee_user_id <> caller_user_id
           or inventory.status <> 'reserved'
         )::integer
  into item_count, invalid_item_count
  from public.sale_items item
  join public.inventory_reservations reservation on reservation.id = item.reservation_id
  join public.store_inventory inventory on inventory.id = item.store_inventory_id
  where item.sale_id = sale_record.id
    and item.status = 'active';

  if item_count = 0 then
    raise exception using errcode = '23514', message = 'sale requires at least one active item';
  end if;
  if invalid_item_count <> 0 then
    raise exception using errcode = '23514', message = 'every sale item requires an active unexpired reservation';
  end if;

  perform private.recalculate_sale_totals(sale_record.id);
  select * into sale_record from public.sales where id = sale_record.id;
  if sale_record.total_pesewas <= 0 then
    raise exception using errcode = '23514', message = 'sale total must be positive';
  end if;

  update public.sales
  set status = 'awaiting_payment',
      submitted_at = observed_at
  where id = sale_record.id;

  insert into public.audit_events (
    store_id, actor_user_id, actor_membership_id, action,
    entity_type, entity_id, event_data, occurred_at
  )
  values (
    sale_record.store_id, caller_user_id, caller_membership_id,
    'sale.awaiting_payment', 'sale', sale_record.id,
    jsonb_build_object(
      'sale_number', sale_record.sale_number,
      'item_count', item_count,
      'subtotal_pesewas', sale_record.subtotal_pesewas,
      'discount_pesewas', sale_record.discount_pesewas,
      'total_pesewas', sale_record.total_pesewas,
      'payment_verified', false
    ),
    observed_at
  );

  return query
    select sale_record.id, sale_record.sale_number,
           'awaiting_payment'::text, sale_record.total_pesewas;
end;
$$;

create or replace function public.cancel_sale_draft(
  p_sale_id uuid,
  p_reason text default 'cancelled by employee'
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  caller_membership_id uuid;
  sale_record public.sales%rowtype;
  item_record record;
  observed_at timestamptz := clock_timestamp();
  normalized_reason text := btrim(p_reason);
begin
  if length(normalized_reason) < 3 or length(normalized_reason) > 500 then
    raise exception using errcode = '22023', message = 'cancellation reason must contain between 3 and 500 characters';
  end if;

  select sale_value.* into sale_record
  from public.sales sale_value
  where sale_value.id = p_sale_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'sale not found';
  end if;
  caller_membership_id := private.sale_actor_membership(sale_record.store_id, 'create_sales');
  if sale_record.created_by_user_id <> caller_user_id then
    raise exception using errcode = '42501', message = 'only the sale owner can cancel this sale';
  end if;
  if sale_record.status = 'cancelled' then
    return 'cancelled';
  end if;
  if sale_record.status not in ('draft', 'awaiting_payment') then
    raise exception using errcode = '23514', message = 'sale cannot be cancelled in its current status';
  end if;

  for item_record in
    select item.reservation_id
    from public.sale_items item
    where item.sale_id = sale_record.id
      and item.status = 'active'
    order by item.created_at, item.id
  loop
    if exists (
      select 1 from public.inventory_reservations reservation
      where reservation.id = item_record.reservation_id
        and reservation.status = 'active'
    ) then
      perform public.release_inventory_reservation(item_record.reservation_id, normalized_reason);
    end if;
  end loop;

  update public.sales
  set status = 'cancelled',
      cancelled_at = observed_at,
      cancellation_reason = normalized_reason
  where id = sale_record.id;

  insert into public.audit_events (
    store_id, actor_user_id, actor_membership_id, action,
    entity_type, entity_id, event_data, occurred_at
  )
  values (
    sale_record.store_id, caller_user_id, caller_membership_id,
    'sale.cancelled', 'sale', sale_record.id,
    jsonb_build_object(
      'sale_number', sale_record.sale_number,
      'previous_status', sale_record.status,
      'reason', normalized_reason
    ),
    observed_at
  );

  return 'cancelled';
end;
$$;

create or replace function public.expire_sale_drafts(
  p_store_id uuid,
  p_limit integer default 50
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  candidate record;
  expired_count integer := 0;
begin
  perform private.sale_actor_membership(p_store_id, 'create_sales');
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception using errcode = '22023', message = 'expiry limit must be between 1 and 200';
  end if;

  for candidate in
    select sale_record.id
    from public.sales sale_record
    where sale_record.store_id = p_store_id
      and sale_record.created_by_user_id = caller_user_id
      and sale_record.status = 'draft'
      and sale_record.expires_at <= clock_timestamp()
    order by sale_record.expires_at, sale_record.id
    limit p_limit
  loop
    perform public.cancel_sale_draft(candidate.id, 'sale draft expired');
    expired_count := expired_count + 1;
  end loop;

  return expired_count;
end;
$$;

revoke all on function private.normalize_customer_phone(text) from public;
revoke all on function private.prevent_sale_item_delete() from public;
revoke all on function private.validate_sale_item_update() from public;
revoke all on function private.sale_actor_membership(uuid, text) from public;
revoke all on function private.can_view_sale(uuid) from public;
revoke all on function private.recalculate_sale_totals(uuid) from public;

grant execute on function private.normalize_customer_phone(text) to service_role;
grant execute on function private.can_view_sale(uuid) to authenticated;

alter table public.customers enable row level security;
alter table public.customers force row level security;
alter table public.sales enable row level security;
alter table public.sales force row level security;
alter table public.sale_items enable row level security;
alter table public.sale_items force row level security;

create policy customers_select_authorized_store
on public.customers
for select
to authenticated
using (
  private.has_store_permission(store_id, 'create_sales')
  or private.has_store_permission(store_id, 'access_manager_workspace')
);

create policy sales_select_owner_or_managers
on public.sales
for select
to authenticated
using (
  (
    created_by_user_id = auth.uid()
    and private.has_store_permission(store_id, 'create_sales')
  )
  or private.has_store_permission(store_id, 'access_manager_workspace')
);

create policy sale_items_select_sale_viewers
on public.sale_items
for select
to authenticated
using (private.can_view_sale(sale_id));

revoke all on table public.customers from anon, authenticated, service_role;
revoke all on table public.sales from anon, authenticated, service_role;
revoke all on table public.sale_items from anon, authenticated, service_role;

grant select on table public.customers to authenticated;
grant select on table public.sales to authenticated;
grant select on table public.sale_items to authenticated;

revoke all on function public.create_sale_draft(uuid) from public, anon, authenticated, service_role;
revoke all on function public.add_sale_item(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.remove_sale_item(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.set_sale_item_discount(uuid, uuid, bigint) from public, anon, authenticated, service_role;
revoke all on function public.set_sale_customer(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.create_sale_customer(uuid, text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.submit_sale_for_payment(uuid) from public, anon, authenticated, service_role;
revoke all on function public.cancel_sale_draft(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.expire_sale_drafts(uuid, integer) from public, anon, authenticated, service_role;

grant execute on function public.create_sale_draft(uuid) to authenticated;
grant execute on function public.add_sale_item(uuid, uuid) to authenticated;
grant execute on function public.remove_sale_item(uuid, uuid) to authenticated;
grant execute on function public.set_sale_item_discount(uuid, uuid, bigint) to authenticated;
grant execute on function public.set_sale_customer(uuid, uuid) to authenticated;
grant execute on function public.create_sale_customer(uuid, text, text, text, text) to authenticated;
grant execute on function public.submit_sale_for_payment(uuid) to authenticated;
grant execute on function public.cancel_sale_draft(uuid, text) to authenticated;
grant execute on function public.expire_sale_drafts(uuid, integer) to authenticated;

comment on table public.customers is 'Store-scoped customer contact records. A sale may remain anonymous for a walk-in customer.';
comment on column public.customers.phone_normalized is 'Canonical phone used only for practical same-store duplicate prevention.';
comment on table public.sales is 'Persistent pre-payment sales. Phase 5 permits only draft, awaiting_payment and cancelled states.';
comment on column public.sales.subtotal_pesewas is 'Trusted sum of active sale item list prices in integer Ghana pesewas.';
comment on column public.sales.discount_pesewas is 'Trusted sum of authorised active sale item discounts in integer Ghana pesewas.';
comment on column public.sales.total_pesewas is 'Generated subtotal less discount in integer Ghana pesewas.';
comment on table public.sale_items is 'Immutable physical-device and price snapshots linked to the reservation used by a sale draft.';
comment on function public.add_sale_item(uuid, uuid) is 'Adds a trusted inventory snapshot to an owned draft by reusing the atomic inventory reservation RPC.';
comment on function public.submit_sale_for_payment(uuid) is 'Validates totals and active reservations, then marks a sale awaiting payment without recording payment or selling inventory.';
comment on function public.cancel_sale_draft(uuid, text) is 'Cancels an owned draft or awaiting-payment sale and releases each still-active inventory reservation.';

commit;
