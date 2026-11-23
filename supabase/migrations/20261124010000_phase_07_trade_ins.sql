begin;

-- Phase 7 persists employee trade-in intake and manager approval without
-- applying credit to sales, paying customers, or changing Phase 6 payments.
create table public.trade_in_requests (
  id uuid primary key default gen_random_uuid(),
  request_number text not null,
  store_id uuid not null references public.stores(id) on update cascade on delete restrict,
  requested_by_user_id uuid not null references public.profiles(id) on update cascade on delete restrict,
  requested_by_membership_id uuid not null,
  requested_by_display_name text not null,
  customer_full_name text,
  customer_phone text,
  customer_phone_normalized text,
  customer_email text,
  device_brand text,
  device_model text,
  storage_gb integer,
  colour text,
  identifier_type text,
  imei text,
  serial_number text,
  cosmetic_condition text not null default 'unknown',
  display_check text not null default 'unknown',
  battery_check text not null default 'unknown',
  battery_health integer,
  cameras_check text not null default 'unknown',
  buttons_check text not null default 'unknown',
  connectivity_check text not null default 'unknown',
  biometric_check text not null default 'unknown',
  activation_lock_check text not null default 'unknown',
  other_functional_check text not null default 'unknown',
  inspection_notes text,
  proposed_offer_pesewas bigint,
  approved_offer_pesewas bigint,
  currency text not null default 'GHS',
  supporting_notes text,
  progress_step integer not null default 1,
  status text not null default 'draft',
  submitted_at timestamptz,
  decision text,
  decision_note text,
  decided_by_user_id uuid references public.profiles(id) on update cascade on delete restrict,
  decided_by_membership_id uuid,
  decided_by_display_name text,
  decided_at timestamptz,
  intake_identity_confirmed boolean,
  intake_condition_confirmed boolean,
  intake_note text,
  intaken_by_user_id uuid references public.profiles(id) on update cascade on delete restrict,
  intaken_by_membership_id uuid,
  intaken_by_display_name text,
  intaken_at timestamptz,
  intake_store_inventory_id uuid,
  intake_device_id uuid,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint trade_in_requests_identity_store_unique unique (id, store_id),
  constraint trade_in_requests_number_unique unique (request_number),
  constraint trade_in_requests_requester_membership_fk
    foreign key (requested_by_membership_id, store_id, requested_by_user_id)
    references public.store_memberships(id, store_id, user_id)
    on update cascade on delete restrict,
  constraint trade_in_requests_decider_membership_fk
    foreign key (decided_by_membership_id, store_id, decided_by_user_id)
    references public.store_memberships(id, store_id, user_id)
    on update cascade on delete restrict,
  constraint trade_in_requests_intake_membership_fk
    foreign key (intaken_by_membership_id, store_id, intaken_by_user_id)
    references public.store_memberships(id, store_id, user_id)
    on update cascade on delete restrict,
  constraint trade_in_requests_inventory_fk
    foreign key (intake_store_inventory_id, store_id, intake_device_id)
    references public.store_inventory(id, store_id, device_id)
    on update cascade on delete restrict,
  constraint trade_in_requests_number_format check (request_number ~ '^TI-[0-9]{8}-[0-9A-F]{8}$'),
  constraint trade_in_requests_requester_name_valid check (
    length(btrim(requested_by_display_name)) between 1 and 160
  ),
  constraint trade_in_requests_customer_name_valid check (
    customer_full_name is null or length(btrim(customer_full_name)) between 2 and 160
  ),
  constraint trade_in_requests_customer_phone_valid check (
    customer_phone is null or length(btrim(customer_phone)) between 7 and 32
  ),
  constraint trade_in_requests_customer_phone_normalized_valid check (
    customer_phone_normalized is null or customer_phone_normalized ~ '^\+?[0-9]{7,15}$'
  ),
  constraint trade_in_requests_customer_email_valid check (
    customer_email is null or (
      customer_email = lower(btrim(customer_email))
      and length(customer_email) between 3 and 320
      and position('@' in customer_email) > 1
    )
  ),
  constraint trade_in_requests_device_brand_valid check (
    device_brand is null or length(btrim(device_brand)) between 1 and 80
  ),
  constraint trade_in_requests_device_model_valid check (
    device_model is null or length(btrim(device_model)) between 1 and 160
  ),
  constraint trade_in_requests_storage_valid check (storage_gb is null or storage_gb between 1 and 2048),
  constraint trade_in_requests_colour_valid check (
    colour is null or length(btrim(colour)) between 1 and 80
  ),
  constraint trade_in_requests_identifier_valid check (
    (
      identifier_type is null
      and imei is null
      and serial_number is null
    )
    or
    (
      identifier_type = 'imei'
      and imei is not null
      and private.is_valid_imei(imei)
      and serial_number is null
    )
    or
    (
      identifier_type = 'serial'
      and imei is null
      and serial_number is not null
      and length(serial_number) between 4 and 80
      and serial_number = upper(btrim(serial_number))
      and serial_number ~ '^[A-Z0-9._/-]+$'
    )
  ),
  constraint trade_in_requests_cosmetic_valid check (
    cosmetic_condition in ('unknown', 'not_tested', 'excellent', 'good', 'fair', 'poor')
  ),
  constraint trade_in_requests_display_check_valid check (
    display_check in ('unknown', 'not_tested', 'pass', 'issue', 'not_applicable')
  ),
  constraint trade_in_requests_battery_check_valid check (
    battery_check in ('unknown', 'not_tested', 'pass', 'issue', 'not_applicable')
  ),
  constraint trade_in_requests_cameras_check_valid check (
    cameras_check in ('unknown', 'not_tested', 'pass', 'issue', 'not_applicable')
  ),
  constraint trade_in_requests_buttons_check_valid check (
    buttons_check in ('unknown', 'not_tested', 'pass', 'issue', 'not_applicable')
  ),
  constraint trade_in_requests_connectivity_check_valid check (
    connectivity_check in ('unknown', 'not_tested', 'pass', 'issue', 'not_applicable')
  ),
  constraint trade_in_requests_biometric_check_valid check (
    biometric_check in ('unknown', 'not_tested', 'pass', 'issue', 'not_applicable')
  ),
  constraint trade_in_requests_activation_check_valid check (
    activation_lock_check in ('unknown', 'not_tested', 'pass', 'issue', 'not_applicable')
  ),
  constraint trade_in_requests_other_check_valid check (
    other_functional_check in ('unknown', 'not_tested', 'pass', 'issue', 'not_applicable')
  ),
  constraint trade_in_requests_battery_health_valid check (
    battery_health is null or battery_health between 1 and 100
  ),
  constraint trade_in_requests_inspection_notes_bounded check (
    inspection_notes is null or length(inspection_notes) <= 2000
  ),
  constraint trade_in_requests_offer_valid check (
    proposed_offer_pesewas is null
    or proposed_offer_pesewas between 1 and 10000000000
  ),
  constraint trade_in_requests_approved_offer_valid check (
    approved_offer_pesewas is null
    or approved_offer_pesewas between 1 and 10000000000
  ),
  constraint trade_in_requests_currency_ghs check (currency = 'GHS'),
  constraint trade_in_requests_supporting_notes_bounded check (
    supporting_notes is null or length(supporting_notes) <= 2000
  ),
  constraint trade_in_requests_progress_valid check (progress_step between 1 and 4),
  constraint trade_in_requests_status_valid check (
    status in ('draft', 'pending', 'approved', 'declined', 'intaken')
  ),
  constraint trade_in_requests_decision_valid check (
    decision is null or decision in ('approved', 'declined')
  ),
  constraint trade_in_requests_decision_note_valid check (
    decision_note is null or length(btrim(decision_note)) between 10 and 1000
  ),
  constraint trade_in_requests_intake_note_valid check (
    intake_note is null or length(btrim(intake_note)) between 10 and 1000
  ),
  constraint trade_in_requests_submitted_data_complete check (
    status = 'draft'
    or (
      customer_full_name is not null
      and customer_phone is not null
      and customer_phone_normalized is not null
      and device_brand is not null
      and device_model is not null
      and storage_gb is not null
      and colour is not null
      and identifier_type is not null
      and proposed_offer_pesewas is not null
      and progress_step = 4
    )
  ),
  constraint trade_in_requests_lifecycle_consistent check (
    (
      status = 'draft'
      and submitted_at is null
      and decision is null
      and decision_note is null
      and decided_by_user_id is null
      and decided_by_membership_id is null
      and decided_by_display_name is null
      and decided_at is null
      and approved_offer_pesewas is null
      and intaken_by_user_id is null
      and intaken_by_membership_id is null
      and intaken_by_display_name is null
      and intaken_at is null
      and intake_identity_confirmed is null
      and intake_condition_confirmed is null
      and intake_note is null
      and intake_store_inventory_id is null
      and intake_device_id is null
    )
    or
    (
      status = 'pending'
      and submitted_at is not null
      and decision is null
      and decision_note is null
      and decided_by_user_id is null
      and decided_by_membership_id is null
      and decided_by_display_name is null
      and decided_at is null
      and approved_offer_pesewas is null
      and intaken_by_user_id is null
      and intaken_by_membership_id is null
      and intaken_by_display_name is null
      and intaken_at is null
      and intake_identity_confirmed is null
      and intake_condition_confirmed is null
      and intake_note is null
      and intake_store_inventory_id is null
      and intake_device_id is null
    )
    or
    (
      status = 'approved'
      and submitted_at is not null
      and decision = 'approved'
      and decision_note is not null
      and decided_by_user_id is not null
      and decided_by_membership_id is not null
      and decided_by_display_name is not null
      and decided_at is not null
      and approved_offer_pesewas = proposed_offer_pesewas
      and intaken_by_user_id is null
      and intaken_by_membership_id is null
      and intaken_by_display_name is null
      and intaken_at is null
      and intake_identity_confirmed is null
      and intake_condition_confirmed is null
      and intake_note is null
      and intake_store_inventory_id is null
      and intake_device_id is null
    )
    or
    (
      status = 'declined'
      and submitted_at is not null
      and decision = 'declined'
      and decision_note is not null
      and decided_by_user_id is not null
      and decided_by_membership_id is not null
      and decided_by_display_name is not null
      and decided_at is not null
      and approved_offer_pesewas is null
      and intaken_by_user_id is null
      and intaken_by_membership_id is null
      and intaken_by_display_name is null
      and intaken_at is null
      and intake_identity_confirmed is null
      and intake_condition_confirmed is null
      and intake_note is null
      and intake_store_inventory_id is null
      and intake_device_id is null
    )
    or
    (
      status = 'intaken'
      and submitted_at is not null
      and decision = 'approved'
      and decision_note is not null
      and decided_by_user_id is not null
      and decided_by_membership_id is not null
      and decided_by_display_name is not null
      and decided_at is not null
      and approved_offer_pesewas = proposed_offer_pesewas
      and intaken_by_user_id is not null
      and intaken_by_membership_id is not null
      and intaken_by_display_name is not null
      and intaken_at is not null
      and intake_identity_confirmed is true
      and intake_condition_confirmed is true
      and intake_note is not null
      and intake_store_inventory_id is not null
      and intake_device_id is not null
    )
  ),
  constraint trade_in_requests_timestamps_consistent check (
    (submitted_at is null or submitted_at >= created_at)
    and (decided_at is null or decided_at >= submitted_at)
    and (intaken_at is null or intaken_at >= decided_at)
  )
);

create unique index trade_in_requests_one_draft_per_employee
  on public.trade_in_requests (store_id, requested_by_user_id)
  where status = 'draft';
create unique index trade_in_requests_active_imei_unique
  on public.trade_in_requests (imei)
  where imei is not null and status <> 'declined';
create unique index trade_in_requests_active_serial_unique
  on public.trade_in_requests (serial_number)
  where serial_number is not null and status <> 'declined';
create index trade_in_requests_store_status_time_idx
  on public.trade_in_requests (store_id, status, submitted_at desc, created_at desc);
create index trade_in_requests_requester_status_idx
  on public.trade_in_requests (requested_by_user_id, status, updated_at desc);

alter table public.store_inventory
  add column acquisition_source text not null default 'standard',
  add column trade_in_request_id uuid,
  add constraint store_inventory_acquisition_source_valid check (
    acquisition_source in ('standard', 'trade_in')
  ),
  add constraint store_inventory_trade_in_source_consistent check (
    (acquisition_source = 'standard' and trade_in_request_id is null)
    or (acquisition_source = 'trade_in' and trade_in_request_id is not null)
  ),
  add constraint store_inventory_trade_in_request_fk
    foreign key (trade_in_request_id, store_id)
    references public.trade_in_requests(id, store_id)
    on update cascade on delete restrict;

create unique index store_inventory_trade_in_request_unique
  on public.store_inventory (trade_in_request_id)
  where trade_in_request_id is not null;

create trigger trade_in_requests_set_updated_at
before update on public.trade_in_requests
for each row execute function private.set_updated_at();

create or replace function private.prevent_trade_in_request_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'trade-in requests cannot be deleted';
end;
$$;

create trigger trade_in_requests_no_delete
before delete on public.trade_in_requests
for each row execute function private.prevent_trade_in_request_delete();

create or replace function private.validate_trade_in_request_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.request_number is distinct from old.request_number
    or new.store_id is distinct from old.store_id
    or new.requested_by_user_id is distinct from old.requested_by_user_id
    or new.requested_by_membership_id is distinct from old.requested_by_membership_id
    or new.requested_by_display_name is distinct from old.requested_by_display_name
    or new.created_at is distinct from old.created_at then
    raise exception 'trade-in request identity and requester attribution are immutable';
  end if;

  if old.status <> 'draft' and (
    new.customer_full_name is distinct from old.customer_full_name
    or new.customer_phone is distinct from old.customer_phone
    or new.customer_phone_normalized is distinct from old.customer_phone_normalized
    or new.customer_email is distinct from old.customer_email
    or new.device_brand is distinct from old.device_brand
    or new.device_model is distinct from old.device_model
    or new.storage_gb is distinct from old.storage_gb
    or new.colour is distinct from old.colour
    or new.identifier_type is distinct from old.identifier_type
    or new.imei is distinct from old.imei
    or new.serial_number is distinct from old.serial_number
    or new.cosmetic_condition is distinct from old.cosmetic_condition
    or new.display_check is distinct from old.display_check
    or new.battery_check is distinct from old.battery_check
    or new.battery_health is distinct from old.battery_health
    or new.cameras_check is distinct from old.cameras_check
    or new.buttons_check is distinct from old.buttons_check
    or new.connectivity_check is distinct from old.connectivity_check
    or new.biometric_check is distinct from old.biometric_check
    or new.activation_lock_check is distinct from old.activation_lock_check
    or new.other_functional_check is distinct from old.other_functional_check
    or new.inspection_notes is distinct from old.inspection_notes
    or new.proposed_offer_pesewas is distinct from old.proposed_offer_pesewas
    or new.supporting_notes is distinct from old.supporting_notes
    or new.progress_step is distinct from old.progress_step
    or new.submitted_at is distinct from old.submitted_at
  ) then
    raise exception 'submitted trade-in request details are immutable';
  end if;

  if old.status in ('approved', 'declined') and (
    new.decision is distinct from old.decision
    or new.decision_note is distinct from old.decision_note
    or new.approved_offer_pesewas is distinct from old.approved_offer_pesewas
    or new.decided_by_user_id is distinct from old.decided_by_user_id
    or new.decided_by_membership_id is distinct from old.decided_by_membership_id
    or new.decided_by_display_name is distinct from old.decided_by_display_name
    or new.decided_at is distinct from old.decided_at
  ) then
    raise exception 'trade-in decision history is immutable';
  end if;

  if old.status = 'draft' and new.status in ('draft', 'pending') then
    return new;
  end if;
  if old.status = 'pending' and new.status in ('approved', 'declined') then
    return new;
  end if;
  if old.status = 'approved' and new.status = 'intaken' then
    return new;
  end if;

  raise exception 'invalid or repeated trade-in lifecycle transition';
end;
$$;

create trigger trade_in_requests_validate_update
before update on public.trade_in_requests
for each row execute function private.validate_trade_in_request_update();

create or replace function private.trade_in_actor_membership(
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

create or replace function public.create_trade_in_draft(p_store_id uuid)
returns table (
  request_id uuid,
  request_number text,
  request_status text,
  progress_step integer,
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
  request_record public.trade_in_requests%rowtype;
  new_request_id uuid := gen_random_uuid();
  new_request_number text;
  observed_at timestamptz := clock_timestamp();
begin
  caller_membership_id := private.trade_in_actor_membership(p_store_id, 'process_trade_ins');

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_store_id::text || ':' || caller_user_id::text, 7)
  );

  select request_value.*
  into request_record
  from public.trade_in_requests request_value
  where request_value.store_id = p_store_id
    and request_value.requested_by_user_id = caller_user_id
    and request_value.status = 'draft'
  for update;

  if found then
    return query
      select request_record.id, request_record.request_number, request_record.status,
             request_record.progress_step, 'resumed'::text;
    return;
  end if;

  select profile.display_name
  into caller_display_name
  from public.profiles profile
  where profile.id = caller_user_id;

  new_request_number := 'TI-' || to_char(observed_at at time zone 'Africa/Accra', 'YYYYMMDD')
    || '-' || upper(substring(replace(new_request_id::text, '-', '') from 1 for 8));

  insert into public.trade_in_requests (
    id, request_number, store_id,
    requested_by_user_id, requested_by_membership_id, requested_by_display_name,
    status, progress_step, created_at, updated_at
  )
  values (
    new_request_id, new_request_number, p_store_id,
    caller_user_id, caller_membership_id, caller_display_name,
    'draft', 1, observed_at, observed_at
  );

  insert into public.audit_events (
    store_id, actor_user_id, actor_membership_id, action,
    entity_type, entity_id, event_data, occurred_at
  )
  values (
    p_store_id, caller_user_id, caller_membership_id,
    'trade_in.draft_created', 'trade_in_request', new_request_id,
    jsonb_build_object('request_number', new_request_number), observed_at
  );

  return query
    select new_request_id, new_request_number, 'draft'::text, 1, 'created'::text;
end;
$$;

create or replace function public.save_trade_in_customer(
  p_request_id uuid,
  p_full_name text,
  p_phone text,
  p_email text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  request_record public.trade_in_requests%rowtype;
  normalized_name text := regexp_replace(btrim(p_full_name), '[[:space:]]+', ' ', 'g');
  display_phone text := regexp_replace(btrim(p_phone), '[[:space:]]+', ' ', 'g');
  normalized_phone text;
  normalized_email text := nullif(lower(btrim(p_email)), '');
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

  select request_value.* into request_record
  from public.trade_in_requests request_value
  where request_value.id = p_request_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'trade-in draft not found';
  end if;
  perform private.trade_in_actor_membership(request_record.store_id, 'process_trade_ins');
  if request_record.requested_by_user_id <> caller_user_id then
    raise exception using errcode = '42501', message = 'only the request owner can update this trade-in';
  end if;
  if request_record.status <> 'draft' then
    raise exception using errcode = '23514', message = 'only a draft trade-in can be updated';
  end if;

  update public.trade_in_requests
  set customer_full_name = normalized_name,
      customer_phone = display_phone,
      customer_phone_normalized = normalized_phone,
      customer_email = normalized_email,
      progress_step = greatest(progress_step, 2)
  where id = request_record.id;

  return greatest(request_record.progress_step, 2);
end;
$$;

create or replace function public.save_trade_in_device(
  p_request_id uuid,
  p_brand text,
  p_model text,
  p_storage_gb integer,
  p_colour text,
  p_identifier_type text,
  p_identifier text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  request_record public.trade_in_requests%rowtype;
  normalized_brand text := regexp_replace(btrim(p_brand), '[[:space:]]+', ' ', 'g');
  normalized_model text := regexp_replace(btrim(p_model), '[[:space:]]+', ' ', 'g');
  normalized_colour text := regexp_replace(btrim(p_colour), '[[:space:]]+', ' ', 'g');
  normalized_type text := lower(btrim(p_identifier_type));
  normalized_imei text;
  normalized_serial text;
begin
  if length(normalized_brand) < 1 or length(normalized_brand) > 80
    or length(normalized_model) < 1 or length(normalized_model) > 160
    or length(normalized_colour) < 1 or length(normalized_colour) > 80 then
    raise exception using errcode = '22023', message = 'valid device brand, model and colour required';
  end if;
  if p_storage_gb is null or p_storage_gb < 1 or p_storage_gb > 2048 then
    raise exception using errcode = '22023', message = 'storage must be between 1 and 2048 GB';
  end if;
  if normalized_type = 'imei' then
    normalized_imei := btrim(p_identifier);
    if not private.is_valid_imei(normalized_imei) then
      raise exception using errcode = '22023', message = 'valid 15-digit Luhn IMEI required';
    end if;
    if exists (select 1 from public.inventory_devices device where device.imei = normalized_imei) then
      raise exception using errcode = '23505', message = 'IMEI already exists in inventory';
    end if;
  elsif normalized_type = 'serial' then
    normalized_serial := upper(btrim(p_identifier));
    if length(normalized_serial) < 4 or length(normalized_serial) > 80
      or normalized_serial !~ '^[A-Z0-9._/-]+$' then
      raise exception using errcode = '22023', message = 'valid serial number required';
    end if;
  else
    raise exception using errcode = '22023', message = 'identifier type must be IMEI or serial';
  end if;

  select request_value.* into request_record
  from public.trade_in_requests request_value
  where request_value.id = p_request_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'trade-in draft not found';
  end if;
  perform private.trade_in_actor_membership(request_record.store_id, 'process_trade_ins');
  if request_record.requested_by_user_id <> caller_user_id then
    raise exception using errcode = '42501', message = 'only the request owner can update this trade-in';
  end if;
  if request_record.status <> 'draft' then
    raise exception using errcode = '23514', message = 'only a draft trade-in can be updated';
  end if;
  if request_record.customer_full_name is null then
    raise exception using errcode = '23514', message = 'customer details must be saved first';
  end if;

  update public.trade_in_requests
  set device_brand = normalized_brand,
      device_model = normalized_model,
      storage_gb = p_storage_gb,
      colour = normalized_colour,
      identifier_type = normalized_type,
      imei = normalized_imei,
      serial_number = normalized_serial,
      progress_step = greatest(progress_step, 3)
  where id = request_record.id;

  return greatest(request_record.progress_step, 3);
end;
$$;

create or replace function public.save_trade_in_inspection(
  p_request_id uuid,
  p_cosmetic_condition text,
  p_display_check text,
  p_battery_check text,
  p_battery_health integer,
  p_cameras_check text,
  p_buttons_check text,
  p_connectivity_check text,
  p_biometric_check text,
  p_activation_lock_check text,
  p_other_functional_check text,
  p_notes text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  request_record public.trade_in_requests%rowtype;
  normalized_cosmetic text := lower(btrim(p_cosmetic_condition));
  normalized_display text := lower(btrim(p_display_check));
  normalized_battery text := lower(btrim(p_battery_check));
  normalized_cameras text := lower(btrim(p_cameras_check));
  normalized_buttons text := lower(btrim(p_buttons_check));
  normalized_connectivity text := lower(btrim(p_connectivity_check));
  normalized_biometric text := lower(btrim(p_biometric_check));
  normalized_activation text := lower(btrim(p_activation_lock_check));
  normalized_other text := lower(btrim(p_other_functional_check));
  normalized_notes text := nullif(btrim(p_notes), '');
  check_value text;
begin
  if normalized_cosmetic not in ('unknown', 'not_tested', 'excellent', 'good', 'fair', 'poor') then
    raise exception using errcode = '22023', message = 'valid cosmetic condition required';
  end if;
  foreach check_value in array array[
    normalized_display, normalized_battery, normalized_cameras, normalized_buttons,
    normalized_connectivity, normalized_biometric, normalized_activation, normalized_other
  ] loop
    if check_value not in ('unknown', 'not_tested', 'pass', 'issue', 'not_applicable') then
      raise exception using errcode = '22023', message = 'valid structured inspection result required';
    end if;
  end loop;
  if p_battery_health is not null and (p_battery_health < 1 or p_battery_health > 100) then
    raise exception using errcode = '22023', message = 'battery health must be between 1 and 100 when supplied';
  end if;
  if normalized_notes is not null and length(normalized_notes) > 2000 then
    raise exception using errcode = '22023', message = 'inspection notes must not exceed 2000 characters';
  end if;

  select request_value.* into request_record
  from public.trade_in_requests request_value
  where request_value.id = p_request_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'trade-in draft not found';
  end if;
  perform private.trade_in_actor_membership(request_record.store_id, 'process_trade_ins');
  if request_record.requested_by_user_id <> caller_user_id then
    raise exception using errcode = '42501', message = 'only the request owner can update this trade-in';
  end if;
  if request_record.status <> 'draft' then
    raise exception using errcode = '23514', message = 'only a draft trade-in can be updated';
  end if;
  if request_record.device_brand is null then
    raise exception using errcode = '23514', message = 'device identity must be saved first';
  end if;

  update public.trade_in_requests
  set cosmetic_condition = normalized_cosmetic,
      display_check = normalized_display,
      battery_check = normalized_battery,
      battery_health = p_battery_health,
      cameras_check = normalized_cameras,
      buttons_check = normalized_buttons,
      connectivity_check = normalized_connectivity,
      biometric_check = normalized_biometric,
      activation_lock_check = normalized_activation,
      other_functional_check = normalized_other,
      inspection_notes = normalized_notes,
      progress_step = greatest(progress_step, 4)
  where id = request_record.id;

  return greatest(request_record.progress_step, 4);
end;
$$;

create or replace function public.submit_trade_in_request(
  p_request_id uuid,
  p_proposed_offer_pesewas bigint,
  p_supporting_notes text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  caller_membership_id uuid;
  request_record public.trade_in_requests%rowtype;
  normalized_notes text := nullif(btrim(p_supporting_notes), '');
  observed_at timestamptz := clock_timestamp();
begin
  if p_proposed_offer_pesewas is null
    or p_proposed_offer_pesewas < 1
    or p_proposed_offer_pesewas > 10000000000 then
    raise exception using errcode = '22023', message = 'proposed offer must be a positive integer-pesewa amount';
  end if;
  if normalized_notes is not null and length(normalized_notes) > 2000 then
    raise exception using errcode = '22023', message = 'supporting notes must not exceed 2000 characters';
  end if;

  select request_value.* into request_record
  from public.trade_in_requests request_value
  where request_value.id = p_request_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'trade-in draft not found';
  end if;
  caller_membership_id := private.trade_in_actor_membership(request_record.store_id, 'process_trade_ins');
  if request_record.requested_by_user_id <> caller_user_id then
    raise exception using errcode = '42501', message = 'only the request owner can submit this trade-in';
  end if;
  if request_record.status <> 'draft' then
    raise exception using errcode = '23514', message = 'only a draft trade-in can be submitted';
  end if;
  if request_record.progress_step <> 4
    or request_record.customer_full_name is null
    or request_record.customer_phone_normalized is null
    or request_record.device_brand is null
    or request_record.device_model is null
    or request_record.storage_gb is null
    or request_record.colour is null
    or request_record.identifier_type is null then
    raise exception using errcode = '23514', message = 'customer, device and inspection steps must be persisted before submission';
  end if;

  update public.trade_in_requests
  set proposed_offer_pesewas = p_proposed_offer_pesewas,
      supporting_notes = normalized_notes,
      status = 'pending',
      submitted_at = observed_at
  where id = request_record.id;

  insert into public.audit_events (
    store_id, actor_user_id, actor_membership_id, action,
    entity_type, entity_id, event_data, occurred_at
  )
  values (
    request_record.store_id, caller_user_id, caller_membership_id,
    'trade_in.submitted', 'trade_in_request', request_record.id,
    jsonb_build_object(
      'request_number', request_record.request_number,
      'identifier_type', request_record.identifier_type,
      'proposed_offer_pesewas', p_proposed_offer_pesewas,
      'currency', 'GHS'
    ),
    observed_at
  );

  return 'pending';
end;
$$;

create or replace function public.decide_trade_in_request(
  p_request_id uuid,
  p_decision text,
  p_decision_note text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  caller_membership_id uuid;
  caller_display_name text;
  request_record public.trade_in_requests%rowtype;
  normalized_decision text := lower(btrim(p_decision));
  normalized_note text := regexp_replace(btrim(p_decision_note), '[[:space:]]+', ' ', 'g');
  observed_at timestamptz := clock_timestamp();
begin
  if normalized_decision not in ('approved', 'declined') then
    raise exception using errcode = '22023', message = 'decision must be approved or declined';
  end if;
  if length(normalized_note) < 10 or length(normalized_note) > 1000 then
    raise exception using errcode = '22023', message = 'decision note must contain between 10 and 1000 characters';
  end if;

  select request_value.* into request_record
  from public.trade_in_requests request_value
  where request_value.id = p_request_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'trade-in request not found';
  end if;
  caller_membership_id := private.trade_in_actor_membership(request_record.store_id, 'approve_trade_ins');
  if not private.has_store_permission(request_record.store_id, 'review_approvals') then
    raise exception using errcode = '42501', message = 'review_approvals permission required for a decision';
  end if;
  if request_record.requested_by_user_id = caller_user_id then
    raise exception using errcode = '42501', message = 'requesters cannot approve or decline their own trade-in';
  end if;
  if request_record.status <> 'pending' then
    raise exception using errcode = '23514', message = 'only a pending trade-in can receive a decision';
  end if;

  select profile.display_name into caller_display_name
  from public.profiles profile where profile.id = caller_user_id;

  update public.trade_in_requests
  set status = normalized_decision,
      decision = normalized_decision,
      decision_note = normalized_note,
      approved_offer_pesewas = case when normalized_decision = 'approved'
        then request_record.proposed_offer_pesewas else null end,
      decided_by_user_id = caller_user_id,
      decided_by_membership_id = caller_membership_id,
      decided_by_display_name = caller_display_name,
      decided_at = observed_at
  where id = request_record.id;

  insert into public.audit_events (
    store_id, actor_user_id, actor_membership_id, action,
    entity_type, entity_id, event_data, occurred_at
  )
  values (
    request_record.store_id, caller_user_id, caller_membership_id,
    'trade_in.' || normalized_decision, 'trade_in_request', request_record.id,
    jsonb_build_object(
      'request_number', request_record.request_number,
      'proposed_offer_pesewas', request_record.proposed_offer_pesewas,
      'decision_note', normalized_note
    ),
    observed_at
  );

  return normalized_decision;
end;
$$;

create or replace function public.intake_approved_trade_in(
  p_request_id uuid,
  p_selling_price_pesewas bigint,
  p_identity_confirmed boolean,
  p_condition_confirmed boolean,
  p_intake_note text
)
returns table (
  request_status text,
  store_inventory_id uuid,
  device_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  caller_membership_id uuid;
  caller_display_name text;
  request_record public.trade_in_requests%rowtype;
  existing_device_id uuid;
  model_id uuid;
  model_label text;
  inventory_condition text;
  new_device_id uuid := gen_random_uuid();
  new_inventory_id uuid := gen_random_uuid();
  normalized_note text := regexp_replace(btrim(p_intake_note), '[[:space:]]+', ' ', 'g');
  observed_at timestamptz;
begin
  if p_selling_price_pesewas is null
    or p_selling_price_pesewas < 1
    or p_selling_price_pesewas > 10000000000 then
    raise exception using errcode = '22023', message = 'selling price must be a positive integer-pesewa amount';
  end if;
  if p_identity_confirmed is distinct from true
    or p_condition_confirmed is distinct from true then
    raise exception using errcode = '22023', message = 'physical identity and condition confirmations are required';
  end if;
  if length(normalized_note) < 10 or length(normalized_note) > 1000 then
    raise exception using errcode = '22023', message = 'intake note must contain between 10 and 1000 characters';
  end if;

  select request_value.* into request_record
  from public.trade_in_requests request_value
  where request_value.id = p_request_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'approved trade-in request not found';
  end if;
  caller_membership_id := private.trade_in_actor_membership(request_record.store_id, 'manage_inventory');
  if request_record.status <> 'approved' then
    raise exception using errcode = '23514', message = 'only an approved trade-in can be physically intaken';
  end if;
  if request_record.identifier_type <> 'imei' or request_record.imei is null then
    raise exception using errcode = '23514', message = 'existing inventory requires a confirmed valid IMEI; serial-only devices remain outside inventory';
  end if;
  if request_record.cosmetic_condition not in ('excellent', 'good', 'fair')
    or request_record.display_check <> 'pass'
    or request_record.battery_check <> 'pass'
    or request_record.battery_health is null
    or request_record.cameras_check <> 'pass'
    or request_record.buttons_check <> 'pass'
    or request_record.connectivity_check <> 'pass'
    or request_record.activation_lock_check <> 'pass'
    or request_record.biometric_check not in ('pass', 'not_applicable')
    or request_record.other_functional_check not in ('pass', 'not_applicable') then
    raise exception using errcode = '23514', message = 'trade-in inspection is not eligible for sellable inventory intake';
  end if;

  select device.id into existing_device_id
  from public.inventory_devices device
  where device.imei = request_record.imei
  for update;
  if found then
    raise exception using errcode = '23505', message = 'trade-in IMEI already exists in inventory';
  end if;

  model_label := request_record.device_brand || ' ' || request_record.device_model;
  select model.id into model_id
  from public.device_models model
  where lower(model.model_name) = lower(model_label)
    and model.storage_gb = request_record.storage_gb
  for share;

  if model_id is null then
    insert into public.device_models (model_name, storage_gb, created_at, updated_at)
    values (model_label, request_record.storage_gb, clock_timestamp(), clock_timestamp())
    on conflict do nothing
    returning id into model_id;

    if model_id is null then
      select model.id into model_id
      from public.device_models model
      where lower(model.model_name) = lower(model_label)
        and model.storage_gb = request_record.storage_gb;
    end if;
  end if;

  if model_id is null then
    raise exception 'trade-in device model could not be resolved';
  end if;

  observed_at := clock_timestamp();
  inventory_condition := request_record.cosmetic_condition;

  insert into public.inventory_devices (
    id, device_model_id, imei, colour, condition, battery_health, created_at, updated_at
  )
  values (
    new_device_id, model_id, request_record.imei, request_record.colour,
    inventory_condition, request_record.battery_health, observed_at, observed_at
  );

  insert into public.store_inventory (
    id, store_id, device_id, status, cost_pesewas, price_pesewas,
    acquisition_source, trade_in_request_id, received_at, created_at, updated_at
  )
  values (
    new_inventory_id, request_record.store_id, new_device_id, 'available',
    request_record.approved_offer_pesewas, p_selling_price_pesewas,
    'trade_in', request_record.id, observed_at, observed_at, observed_at
  );

  insert into public.inventory_movements (
    store_id, store_inventory_id, device_id, reservation_id,
    movement_type, from_status, to_status,
    actor_user_id, actor_membership_id, reason, metadata, occurred_at
  )
  values (
    request_record.store_id, new_inventory_id, new_device_id, null,
    'intake', null, 'available',
    caller_user_id, caller_membership_id,
    'approved trade-in physically received and confirmed',
    jsonb_build_object(
      'acquisition_source', 'trade_in',
      'trade_in_request_id', request_record.id,
      'request_number', request_record.request_number
    ),
    observed_at
  );

  select profile.display_name into caller_display_name
  from public.profiles profile where profile.id = caller_user_id;

  update public.trade_in_requests
  set status = 'intaken',
      intake_identity_confirmed = true,
      intake_condition_confirmed = true,
      intake_note = normalized_note,
      intaken_by_user_id = caller_user_id,
      intaken_by_membership_id = caller_membership_id,
      intaken_by_display_name = caller_display_name,
      intaken_at = observed_at,
      intake_store_inventory_id = new_inventory_id,
      intake_device_id = new_device_id
  where id = request_record.id;

  insert into public.audit_events (
    store_id, actor_user_id, actor_membership_id, action,
    entity_type, entity_id, event_data, occurred_at
  )
  values
  (
    request_record.store_id, caller_user_id, caller_membership_id,
    'trade_in.physically_intaken', 'trade_in_request', request_record.id,
    jsonb_build_object(
      'request_number', request_record.request_number,
      'store_inventory_id', new_inventory_id,
      'device_id', new_device_id,
      'approved_offer_pesewas', request_record.approved_offer_pesewas,
      'selling_price_pesewas', p_selling_price_pesewas,
      'identity_confirmed', true,
      'condition_confirmed', true
    ),
    observed_at
  ),
  (
    request_record.store_id, caller_user_id, caller_membership_id,
    'inventory.trade_in_intake', 'store_inventory', new_inventory_id,
    jsonb_build_object(
      'trade_in_request_id', request_record.id,
      'device_id', new_device_id,
      'acquisition_source', 'trade_in'
    ),
    observed_at
  );

  return query select 'intaken'::text, new_inventory_id, new_device_id;
end;
$$;

revoke all on function private.prevent_trade_in_request_delete() from public;
revoke all on function private.validate_trade_in_request_update() from public;
revoke all on function private.trade_in_actor_membership(uuid, text) from public;

alter table public.trade_in_requests enable row level security;
alter table public.trade_in_requests force row level security;

create policy trade_in_requests_select_owner_or_reviewers
on public.trade_in_requests
for select
to authenticated
using (
  (
    requested_by_user_id = auth.uid()
    and private.has_store_permission(store_id, 'process_trade_ins')
  )
  or (
    status <> 'draft'
    and private.has_store_permission(store_id, 'review_approvals')
  )
);

revoke all on table public.trade_in_requests from public, anon, authenticated, service_role;
grant select on table public.trade_in_requests to authenticated;
grant select on table public.trade_in_requests to service_role;

revoke all on function public.create_trade_in_draft(uuid)
from public, anon, authenticated, service_role;
revoke all on function public.save_trade_in_customer(uuid, text, text, text)
from public, anon, authenticated, service_role;
revoke all on function public.save_trade_in_device(uuid, text, text, integer, text, text, text)
from public, anon, authenticated, service_role;
revoke all on function public.save_trade_in_inspection(uuid, text, text, text, integer, text, text, text, text, text, text, text)
from public, anon, authenticated, service_role;
revoke all on function public.submit_trade_in_request(uuid, bigint, text)
from public, anon, authenticated, service_role;
revoke all on function public.decide_trade_in_request(uuid, text, text)
from public, anon, authenticated, service_role;
revoke all on function public.intake_approved_trade_in(uuid, bigint, boolean, boolean, text)
from public, anon, authenticated, service_role;

grant execute on function public.create_trade_in_draft(uuid) to authenticated;
grant execute on function public.save_trade_in_customer(uuid, text, text, text) to authenticated;
grant execute on function public.save_trade_in_device(uuid, text, text, integer, text, text, text) to authenticated;
grant execute on function public.save_trade_in_inspection(uuid, text, text, text, integer, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.submit_trade_in_request(uuid, bigint, text) to authenticated;
grant execute on function public.decide_trade_in_request(uuid, text, text) to authenticated;
grant execute on function public.intake_approved_trade_in(uuid, bigint, boolean, boolean, text) to authenticated;

comment on table public.trade_in_requests is 'Store-scoped employee trade-in intake, inspection, manager decision and physical intake lifecycle.';
comment on column public.trade_in_requests.proposed_offer_pesewas is 'Employee-proposed offer in integer Ghana pesewas; never final before manager approval.';
comment on column public.trade_in_requests.approved_offer_pesewas is 'Manager-approved acquisition valuation; this does not record or settle a customer payout.';
comment on column public.store_inventory.acquisition_source is 'Trusted inventory acquisition source. Trade-in rows link to the approved physical intake request.';
comment on function public.submit_trade_in_request(uuid, bigint, text) is 'Locks and submits a persisted employee-owned trade-in draft for manager approval.';
comment on function public.decide_trade_in_request(uuid, text, text) is 'Records one permission-checked manager approval or decline with separation of duties and audit attribution.';
comment on function public.intake_approved_trade_in(uuid, bigint, boolean, boolean, text) is 'After physical receipt and confirmation, atomically enters an eligible approved IMEI device into existing inventory with trade-in acquisition history.';

commit;
