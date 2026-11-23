begin;

-- Phase 6 adds one immutable, manually confirmed full payment per sale. It
-- deliberately does not add split tenders, partial payments, reversals,
-- refunds, provider callbacks, or gateway verification.
alter table public.sales
  add column completed_at timestamptz;

alter table public.sales
  drop constraint sales_status_valid,
  drop constraint sales_lifecycle_consistent;

alter table public.sales
  add constraint sales_status_valid
    check (status in ('draft', 'awaiting_payment', 'completed', 'cancelled')),
  add constraint sales_lifecycle_consistent check (
    (
      status = 'draft'
      and submitted_at is null
      and completed_at is null
      and cancelled_at is null
      and cancellation_reason is null
    )
    or
    (
      status = 'awaiting_payment'
      and submitted_at is not null
      and completed_at is null
      and cancelled_at is null
      and cancellation_reason is null
    )
    or
    (
      status = 'completed'
      and submitted_at is not null
      and completed_at is not null
      and completed_at >= submitted_at
      and cancelled_at is null
      and cancellation_reason is null
    )
    or
    (
      status = 'cancelled'
      and completed_at is null
      and cancelled_at is not null
      and length(btrim(cancellation_reason)) between 3 and 500
    )
  );

create index sales_store_completed_idx
  on public.sales (store_id, completed_at desc)
  where status = 'completed';

create table public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null,
  store_id uuid not null,
  amount_pesewas bigint not null,
  currency text not null default 'GHS',
  payment_method text not null,
  transaction_reference text,
  status text not null default 'confirmed',
  manually_confirmed_received boolean not null,
  confirmed_by_user_id uuid not null references public.profiles(id) on update cascade on delete restrict,
  confirmed_by_membership_id uuid not null,
  confirmed_by_display_name text not null,
  confirmed_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint sale_payments_sale_store_fk
    foreign key (sale_id, store_id)
    references public.sales(id, store_id)
    on update cascade on delete restrict,
  constraint sale_payments_confirmer_membership_fk
    foreign key (confirmed_by_membership_id, store_id, confirmed_by_user_id)
    references public.store_memberships(id, store_id, user_id)
    on update cascade on delete restrict,
  constraint sale_payments_one_per_sale unique (sale_id),
  constraint sale_payments_amount_positive check (amount_pesewas > 0),
  constraint sale_payments_currency_ghs check (currency = 'GHS'),
  constraint sale_payments_method_valid check (
    payment_method in ('mobile_money', 'cash', 'bank_transfer')
  ),
  constraint sale_payments_reference_valid check (
    transaction_reference is null
    or (
      transaction_reference = btrim(transaction_reference)
      and length(transaction_reference) between 1 and 160
      and transaction_reference !~ '[[:cntrl:]]'
    )
  ),
  constraint sale_payments_status_confirmed check (status = 'confirmed'),
  constraint sale_payments_manual_confirmation_required check (manually_confirmed_received),
  constraint sale_payments_confirmer_name_not_blank check (
    length(btrim(confirmed_by_display_name)) between 1 and 160
  ),
  constraint sale_payments_confirmation_time_consistent check (confirmed_at = created_at)
);

create index sale_payments_store_confirmed_idx
  on public.sale_payments (store_id, confirmed_at desc);
create index sale_payments_confirmer_idx
  on public.sale_payments (confirmed_by_user_id, confirmed_at desc);

create or replace function private.prevent_sale_payment_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'sale payments are immutable';
end;
$$;

create trigger sale_payments_append_only
before update or delete on public.sale_payments
for each row execute function private.prevent_sale_payment_mutation();

create or replace function public.confirm_sale_payment(
  p_sale_id uuid,
  p_payment_method text,
  p_amount_pesewas bigint,
  p_transaction_reference text,
  p_received_confirmed boolean
)
returns table (
  payment_id uuid,
  sale_id uuid,
  sale_status text,
  payment_status text,
  amount_pesewas bigint,
  payment_method text,
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
  sale_record public.sales%rowtype;
  item_record public.sale_items%rowtype;
  inventory_record public.store_inventory%rowtype;
  reservation_record public.inventory_reservations%rowtype;
  active_item_count integer;
  normalized_method text := lower(btrim(p_payment_method));
  normalized_reference text := nullif(
    regexp_replace(btrim(p_transaction_reference), '[[:space:]]+', ' ', 'g'),
    ''
  );
  new_payment_id uuid := gen_random_uuid();
  observed_at timestamptz;
begin
  if caller_user_id is null then
    raise exception using errcode = '28000', message = 'authentication required';
  end if;
  if p_received_confirmed is distinct from true then
    raise exception using errcode = '22023', message = 'employee must confirm that full payment was received';
  end if;
  if normalized_method is null
    or normalized_method not in ('mobile_money', 'cash', 'bank_transfer') then
    raise exception using errcode = '22023', message = 'unsupported payment method';
  end if;
  if normalized_reference is not null and length(normalized_reference) > 160 then
    raise exception using errcode = '22023', message = 'payment reference must not exceed 160 characters';
  end if;
  if p_amount_pesewas is null or p_amount_pesewas <= 0 then
    raise exception using errcode = '22023', message = 'payment amount must be positive integer pesewas';
  end if;

  select sale_value.*
  into sale_record
  from public.sales sale_value
  where sale_value.id = p_sale_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'sale not found';
  end if;

  caller_membership_id := private.sale_actor_membership(sale_record.store_id, 'create_sales');
  if not private.has_store_permission(sale_record.store_id, 'reserve_inventory') then
    raise exception using errcode = '42501', message = 'active reserve_inventory permission required';
  end if;
  if sale_record.created_by_user_id <> caller_user_id then
    raise exception using errcode = '42501', message = 'only the sale owner can confirm payment';
  end if;
  if exists (select 1 from public.sale_payments payment where payment.sale_id = sale_record.id) then
    raise exception using errcode = '23505', message = 'payment already confirmed for sale';
  end if;
  if sale_record.status = 'cancelled' then
    raise exception using errcode = '23514', message = 'cancelled sale cannot receive payment';
  end if;
  if sale_record.status = 'completed' then
    raise exception using errcode = '23505', message = 'sale is already completed';
  end if;
  if sale_record.status not in ('draft', 'awaiting_payment') then
    raise exception using errcode = '23514', message = 'sale cannot receive payment in its current status';
  end if;

  perform private.recalculate_sale_totals(sale_record.id);
  select sale_value.* into sale_record
  from public.sales sale_value
  where sale_value.id = sale_record.id;

  if sale_record.total_pesewas <= 0 then
    raise exception using errcode = '23514', message = 'sale total must be positive';
  end if;
  if p_amount_pesewas <> sale_record.total_pesewas then
    raise exception using errcode = '22023', message = 'payment amount must equal the authoritative sale total';
  end if;

  select count(*)::integer
  into active_item_count
  from public.sale_items item
  where item.sale_id = sale_record.id
    and item.status = 'active';

  if active_item_count <> 1 then
    raise exception using errcode = '23514', message = 'sale requires exactly one active device';
  end if;

  select item.*
  into item_record
  from public.sale_items item
  where item.sale_id = sale_record.id
    and item.status = 'active'
  for update;

  select inventory.*
  into inventory_record
  from public.store_inventory inventory
  where inventory.id = item_record.store_inventory_id
  for update;

  if not found then
    raise exception 'sale inventory does not exist';
  end if;

  select reservation.*
  into reservation_record
  from public.inventory_reservations reservation
  where reservation.id = item_record.reservation_id
  for update;

  if not found then
    raise exception 'sale reservation does not exist';
  end if;

  observed_at := clock_timestamp();

  if item_record.store_id <> sale_record.store_id
    or inventory_record.store_id <> sale_record.store_id
    or inventory_record.device_id <> item_record.device_id
    or reservation_record.store_id <> sale_record.store_id
    or reservation_record.store_inventory_id <> item_record.store_inventory_id
    or reservation_record.device_id <> item_record.device_id then
    raise exception 'sale item, reservation and inventory identity are inconsistent';
  end if;
  if inventory_record.status <> 'reserved' then
    raise exception using errcode = '23514', message = 'sale inventory is not reserved';
  end if;
  if reservation_record.status <> 'active'
    or reservation_record.expires_at <= observed_at then
    raise exception using errcode = '23514', message = 'sale reservation is not active and unexpired';
  end if;
  if reservation_record.employee_user_id <> caller_user_id
    or reservation_record.employee_membership_id <> caller_membership_id then
    raise exception using errcode = '42501', message = 'sale reservation is not owned by the confirming employee';
  end if;

  select profile.display_name
  into caller_display_name
  from public.profiles profile
  where profile.id = caller_user_id;

  insert into public.sale_payments (
    id,
    sale_id,
    store_id,
    amount_pesewas,
    currency,
    payment_method,
    transaction_reference,
    status,
    manually_confirmed_received,
    confirmed_by_user_id,
    confirmed_by_membership_id,
    confirmed_by_display_name,
    confirmed_at,
    created_at
  )
  values (
    new_payment_id,
    sale_record.id,
    sale_record.store_id,
    sale_record.total_pesewas,
    'GHS',
    normalized_method,
    normalized_reference,
    'confirmed',
    true,
    caller_user_id,
    caller_membership_id,
    caller_display_name,
    observed_at,
    observed_at
  );

  update public.inventory_reservations
  set status = 'fulfilled',
      ended_at = observed_at,
      ended_by_user_id = caller_user_id,
      ended_by_membership_id = caller_membership_id,
      end_reason = 'sale completed after manual payment confirmation'
  where id = reservation_record.id;

  update public.store_inventory
  set status = 'sold'
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
    metadata,
    occurred_at
  )
  values (
    sale_record.store_id,
    inventory_record.id,
    inventory_record.device_id,
    reservation_record.id,
    'sold',
    'reserved',
    'sold',
    caller_user_id,
    caller_membership_id,
    'sale completed after manual payment confirmation',
    jsonb_build_object('sale_id', sale_record.id, 'payment_id', new_payment_id),
    observed_at
  );

  update public.sales
  set status = 'completed',
      submitted_at = coalesce(sale_record.submitted_at, observed_at),
      completed_at = observed_at
  where id = sale_record.id;

  insert into public.audit_events (
    store_id, actor_user_id, actor_membership_id, action,
    entity_type, entity_id, event_data, occurred_at
  )
  values
  (
    sale_record.store_id, caller_user_id, caller_membership_id,
    'payment.manually_confirmed', 'sale_payment', new_payment_id,
    jsonb_build_object(
      'sale_id', sale_record.id,
      'amount_pesewas', sale_record.total_pesewas,
      'currency', 'GHS',
      'payment_method', normalized_method,
      'reference_present', normalized_reference is not null,
      'received_confirmed', true
    ),
    observed_at
  ),
  (
    sale_record.store_id, caller_user_id, caller_membership_id,
    'inventory.sold', 'store_inventory', inventory_record.id,
    jsonb_build_object(
      'sale_id', sale_record.id,
      'payment_id', new_payment_id,
      'device_id', inventory_record.device_id,
      'reservation_id', reservation_record.id
    ),
    observed_at
  ),
  (
    sale_record.store_id, caller_user_id, caller_membership_id,
    'sale.completed', 'sale', sale_record.id,
    jsonb_build_object(
      'payment_id', new_payment_id,
      'amount_pesewas', sale_record.total_pesewas,
      'payment_method', normalized_method,
      'item_id', item_record.id,
      'device_id', item_record.device_id
    ),
    observed_at
  );

  return query
    select new_payment_id, sale_record.id, 'completed'::text, 'confirmed'::text,
           sale_record.total_pesewas, normalized_method, observed_at;
end;
$$;

create or replace function public.create_completed_sale_customer(
  p_sale_id uuid,
  p_full_name text,
  p_phone text,
  p_email text default null
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
  normalized_phone := private.normalize_customer_phone(p_phone);

  select sale_value.*
  into sale_record
  from public.sales sale_value
  where sale_value.id = p_sale_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'completed sale not found';
  end if;

  caller_membership_id := private.sale_actor_membership(sale_record.store_id, 'create_sales');
  if sale_record.created_by_user_id <> caller_user_id then
    raise exception using errcode = '42501', message = 'only the sale owner can record its customer';
  end if;
  if sale_record.status <> 'completed'
    or not exists (
      select 1 from public.sale_payments payment
      where payment.sale_id = sale_record.id
        and payment.status = 'confirmed'
    ) then
    raise exception using errcode = '23514', message = 'customer details require a completed paid sale';
  end if;

  if sale_record.customer_id is not null then
    select customer.*
    into customer_record
    from public.customers customer
    where customer.id = sale_record.customer_id
      and customer.store_id = sale_record.store_id;

    return query
      select 'existing'::text, customer_record.id, customer_record.full_name,
             customer_record.phone, customer_record.email;
    return;
  end if;

  select customer.*
  into customer_record
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
      normalized_email, null, caller_user_id, caller_membership_id,
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
        jsonb_build_object('sale_id', sale_record.id, 'recorded_after_payment', true),
        observed_at
      );
    else
      select customer.*
      into customer_record
      from public.customers customer
      where customer.store_id = sale_record.store_id
        and customer.phone_normalized = normalized_phone;
      creation_result := 'existing';
    end if;
  end if;

  update public.sales
  set customer_id = customer_record.id
  where id = sale_record.id;

  insert into public.audit_events (
    store_id, actor_user_id, actor_membership_id, action,
    entity_type, entity_id, event_data, occurred_at
  )
  values (
    sale_record.store_id, caller_user_id, caller_membership_id,
    'sale.customer_associated', 'sale', sale_record.id,
    jsonb_build_object(
      'previous_customer_id', null,
      'customer_id', customer_record.id,
      'walk_in', false,
      'recorded_after_payment', true
    ),
    observed_at
  );

  return query
    select creation_result, customer_record.id, customer_record.full_name,
           customer_record.phone, customer_record.email;
end;
$$;

revoke all on function private.prevent_sale_payment_mutation() from public;

alter table public.sale_payments enable row level security;
alter table public.sale_payments force row level security;

create policy sale_payments_select_owner_or_managers
on public.sale_payments
for select
to authenticated
using (
  (
    confirmed_by_user_id = auth.uid()
    and private.is_active_store_member(store_id)
  )
  or private.has_store_permission(store_id, 'access_manager_workspace')
);

revoke all on table public.sale_payments from public, anon, authenticated, service_role;
grant select on table public.sale_payments to authenticated;
grant select on table public.sale_payments to service_role;

revoke all on function public.confirm_sale_payment(uuid, text, bigint, text, boolean)
from public, anon, authenticated, service_role;
revoke all on function public.create_completed_sale_customer(uuid, text, text, text)
from public, anon, authenticated, service_role;

grant execute on function public.confirm_sale_payment(uuid, text, bigint, text, boolean)
to authenticated;
grant execute on function public.create_completed_sale_customer(uuid, text, text, text)
to authenticated;

comment on table public.sales is 'Persistent store sales from employee-owned draft through manual payment-backed completion or cancellation.';
comment on column public.sales.completed_at is 'Trusted completion timestamp set only by atomic manual payment confirmation.';
comment on table public.sale_payments is 'Immutable one-per-sale manual full-payment confirmations in integer Ghana pesewas.';
comment on column public.sale_payments.transaction_reference is 'Optional employee-entered metadata; never proof of payment by itself.';
comment on column public.sale_payments.manually_confirmed_received is 'Employee attestation that the full amount was actually received.';
comment on function public.confirm_sale_payment(uuid, text, bigint, text, boolean) is 'Atomically records one manually confirmed full payment, completes the sale, fulfils its reservation, marks inventory sold, and appends audit history.';
comment on function public.create_completed_sale_customer(uuid, text, text, text) is 'Creates or reuses and associates the required customer after payment for an owned completed sale.';

commit;
