begin;

-- Add a negotiated-price version while retaining the original RPC for compatibility.
create or replace function public.add_sale_item(
p_sale_id uuid,
p_device_id uuid,
p_unit_price_pesewas bigint
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
add_result record;
sale_record public.sales%rowtype;
item_record public.sale_items%rowtype;
caller_user_id uuid := auth.uid();
caller_membership_id uuid;
observed_at timestamptz := clock_timestamp();
begin
if p_unit_price_pesewas is null or p_unit_price_pesewas <= 0 then
raise exception using errcode = '22023', message = 'selling price must be positive';
end if;

select added.*
into add_result
from public.add_sale_item(p_sale_id, p_device_id) added;

if add_result.result <> 'added' then
return query
select add_result.result::text,
add_result.sale_item_id::uuid,
add_result.reservation_id::uuid,
add_result.subtotal_pesewas::bigint,
add_result.discount_pesewas::bigint,
add_result.total_pesewas::bigint;
return;
end if;

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

select item.*
into item_record
from public.sale_items item
where item.id = add_result.sale_item_id
and item.sale_id = sale_record.id
and item.status = 'active'
for update;

if not found then
raise exception using errcode = '42501', message = 'active sale item not found';
end if;

update public.sale_items
set unit_price_pesewas = p_unit_price_pesewas
where id = item_record.id;

perform private.recalculate_sale_totals(sale_record.id);

select sale_value.*
into sale_record
from public.sales sale_value
where sale_value.id = p_sale_id;

insert into public.audit_events (
store_id, actor_user_id, actor_membership_id, action,
entity_type, entity_id, event_data, occurred_at
)
values (
sale_record.store_id, caller_user_id, caller_membership_id,
'sale.item_price_negotiated', 'sale_item', item_record.id,
jsonb_build_object(
'sale_id', sale_record.id,
'device_id', item_record.device_id,
'unit_price_pesewas', p_unit_price_pesewas
),
observed_at
);

return query
select 'added'::text, item_record.id, item_record.reservation_id,
sale_record.subtotal_pesewas, sale_record.discount_pesewas,
sale_record.total_pesewas;
end;
$$;

revoke all on function public.add_sale_item(uuid, uuid, bigint)
from public, anon, authenticated, service_role;
grant execute on function public.add_sale_item(uuid, uuid, bigint)
to authenticated;

-- Confirm one payment for the sale, then fulfil every active item atomically.
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

if exists (
select 1 from public.sale_payments payment
where payment.sale_id = sale_record.id
) then
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

select sale_value.*
into sale_record
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

if active_item_count < 1 then
raise exception using errcode = '23514', message = 'sale requires at least one active device';
end if;

observed_at := clock_timestamp();

select profile.display_name
into caller_display_name
from public.profiles profile
where profile.id = caller_user_id;

insert into public.sale_payments (
id, sale_id, store_id, amount_pesewas, currency,
payment_method, transaction_reference, status,
manually_confirmed_received, confirmed_by_user_id,
confirmed_by_membership_id, confirmed_by_display_name,
confirmed_at, created_at
)
values (
new_payment_id, sale_record.id, sale_record.store_id,
sale_record.total_pesewas, 'GHS', normalized_method,
normalized_reference, 'confirmed', true, caller_user_id,
caller_membership_id, caller_display_name, observed_at, observed_at
);

for item_record in
select item.*
from public.sale_items item
where item.sale_id = sale_record.id
and item.status = 'active'
order by item.created_at, item.id
for update
loop
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
store_id, store_inventory_id, device_id, reservation_id,
movement_type, from_status, to_status, actor_user_id,
actor_membership_id, reason, metadata, occurred_at
)
values (
sale_record.store_id, inventory_record.id, inventory_record.device_id,
reservation_record.id, 'sold', 'reserved', 'sold',
caller_user_id, caller_membership_id,
'sale completed after manual payment confirmation',
jsonb_build_object(
'sale_id', sale_record.id,
'payment_id', new_payment_id,
'sale_item_id', item_record.id
),
observed_at
);

insert into public.audit_events (
store_id, actor_user_id, actor_membership_id, action,
entity_type, entity_id, event_data, occurred_at
)
values (
sale_record.store_id, caller_user_id, caller_membership_id,
'inventory.sold', 'store_inventory', inventory_record.id,
jsonb_build_object(
'sale_id', sale_record.id,
'payment_id', new_payment_id,
'sale_item_id', item_record.id,
'device_id', inventory_record.device_id,
'reservation_id', reservation_record.id
),
observed_at
);
end loop;

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
'received_confirmed', true,
'item_count', active_item_count
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
'item_count', active_item_count
),
observed_at
);

return query
select new_payment_id, sale_record.id, 'completed'::text, 'confirmed'::text,
sale_record.total_pesewas, normalized_method, observed_at;
end;
$$;

comment on function public.add_sale_item(uuid, uuid, bigint)
is 'Adds a reserved inventory snapshot to an owned draft using the employee-negotiated unit price.';

comment on function public.confirm_sale_payment(uuid, text, bigint, text, boolean)
is 'Atomically records one manually confirmed full payment, fulfils every active sale reservation, marks all sale inventory sold, and appends audit history.';

commit;
