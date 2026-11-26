begin;

-- Manager workflow for completing a pending inspection.
--
-- Staging deliberately allows a partial inspection document and an unassessed
-- cosmetic condition. Until now there was no way to *finish* that work: the
-- inspection document is immutable after receipt, so a manager could never
-- record the checks the photos did not evidence.
--
-- This migration adds exactly two completion RPCs and the columns that record
-- who completed the work. It does not relax anything:
--
--   * The eight-attestation contract (`is_valid_opening_stock_inspection`) is
--     untouched and activation still calls it.
--   * The RPCs are monotonic. A check may only move from absent/false to true;
--     an already-true check can never be cleared, so the three photo-supported
--     attestations recorded at receipt cannot be overwritten or reset.
--   * The RPCs only accept a `staged` unit.
--   * Authorization is the same helper activation uses
--     (`opening_stock_actor_membership`, which requires
--     `access_manager_workspace` + `manage_inventory`). It fails closed for the
--     null-JWT import session, so the automation that staged the units cannot
--     complete inspections.
--   * No price is set, no inventory row is created, nothing is activated.

alter table public.opening_stock_units
  add column if not exists inspection_completed_by_user_id uuid
    references public.profiles(id) on update cascade on delete restrict,
  add column if not exists inspection_completed_by_membership_id uuid,
  add column if not exists inspection_completed_by_display_name text,
  add column if not exists inspection_completed_at timestamptz;

-- The completer must be a real member of the same store, mirroring the
-- receiver/activator composite-FK pattern already used by this table.
alter table public.opening_stock_units
  add constraint opening_stock_units_inspection_completer_fk
    foreign key (inspection_completed_by_membership_id, store_id, inspection_completed_by_user_id)
    references public.store_memberships(id, store_id, user_id)
    on update cascade on delete restrict;

-- Either a unit is fully unattributed (nobody has completed an inspection yet,
-- or it was received with a complete one) or all four completer fields are set
-- together and the display name is within the same bounds as the receiver's.
alter table public.opening_stock_units
  add constraint opening_stock_units_inspection_completer_consistent check (
    coalesce(
      case
        when inspection_completed_at is null
          and inspection_completed_by_user_id is null
          and inspection_completed_by_membership_id is null
          and inspection_completed_by_display_name is null
          then true
        when inspection_completed_at is not null
          and inspection_completed_by_user_id is not null
          and inspection_completed_by_membership_id is not null
          and length(btrim(inspection_completed_by_display_name)) between 1 and 160
          then true
        else false
      end,
      false
    )
  );

/**
 * The immutability trigger has to learn two narrow, one-way transitions.
 *
 * Without this, filling in a pending check or an unassessed condition is
 * impossible: `validate_opening_stock_unit_update` froze both columns outright,
 * which was correct while nothing could legitimately change them.
 *
 * The relaxed rules are deliberately narrow:
 *
 *   * both transitions require the unit to stay `staged`;
 *   * `inspection` may only *gain* attestations. Every check already true must
 *     remain true, no key may be removed, and any newly added value must be
 *     `true` — so the three photo-supported checks can never be overwritten,
 *     reset, or dropped;
 *   * `condition` may only move from null to a vocabulary value, once;
 *   * battery, identity, cost and activation-identity rules are unchanged.
 */
create or replace function private.validate_opening_stock_unit_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  inspection_preserved boolean := true;
begin
  if new.id is distinct from old.id
    or new.store_id is distinct from old.store_id
    or new.invoice_line_id is distinct from old.invoice_line_id
    or new.device_model_id is distinct from old.device_model_id
    or new.imei is distinct from old.imei
    or new.colour is distinct from old.colour
    or new.unit_cost_pesewas is distinct from old.unit_cost_pesewas
    or new.received_by_user_id is distinct from old.received_by_user_id
    or new.received_by_membership_id is distinct from old.received_by_membership_id
    or new.received_by_display_name is distinct from old.received_by_display_name
    or new.received_at is distinct from old.received_at
    or new.created_at is distinct from old.created_at then
    raise exception using errcode = '23514', message = 'received opening-stock identity is immutable';
  end if;

  -- An inspection may only ever gain passing attestations, and only while the
  -- unit is still staged. Nothing that is already true may be lost or changed.
  if new.inspection is distinct from old.inspection then
    if old.status <> 'staged' or new.status <> 'staged' then
      raise exception using errcode = '23514', message = 'inspection can only change on a staged unit';
    end if;

    select coalesce(bool_and(
      new.inspection -> existing.field_name = 'true'::jsonb
    ), true)
    into inspection_preserved
    from jsonb_object_keys(coalesce(old.inspection, '{}'::jsonb)) as existing(field_name)
    where existing.field_name <> 'notes'
      and coalesce((old.inspection -> existing.field_name) = 'true'::jsonb, false);

    if inspection_preserved is not true then
      raise exception using errcode = '23514', message = 'recorded inspection evidence cannot be removed or overwritten';
    end if;

    if exists (
      select 1
      from jsonb_each(coalesce(new.inspection, '{}'::jsonb)) as incoming(field_name, field_value)
      where incoming.field_name <> 'notes'
        and not coalesce((old.inspection ? incoming.field_name), false)
        and incoming.field_value <> 'true'::jsonb
    ) then
      raise exception using errcode = '23514', message = 'only passing inspection checks can be added';
    end if;

    if exists (
      select 1
      from jsonb_object_keys(coalesce(old.inspection, '{}'::jsonb)) as existing(field_name)
      where existing.field_name <> 'notes'
        and not coalesce((new.inspection ? existing.field_name), false)
    ) then
      raise exception using errcode = '23514', message = 'recorded inspection evidence cannot be removed or overwritten';
    end if;
  end if;

  -- Cosmetic condition is recorded once, from null, while staged.
  if new.condition is distinct from old.condition then
    if not (
      old.status = 'staged'
      and new.status = 'staged'
      and old.condition is null
      and new.condition in ('excellent', 'good', 'fair')
    ) then
      raise exception using errcode = '23514', message = 'cosmetic condition can only be recorded once, while staged';
    end if;
  end if;

  -- The completer fields may only be filled in, never cleared or reassigned to
  -- nobody, while the unit is staged.
  if new.inspection_completed_at is distinct from old.inspection_completed_at
    or new.inspection_completed_by_user_id is distinct from old.inspection_completed_by_user_id
    or new.inspection_completed_by_membership_id is distinct from old.inspection_completed_by_membership_id
    or new.inspection_completed_by_display_name is distinct from old.inspection_completed_by_display_name then
    if old.status <> 'staged' or new.status <> 'staged' then
      raise exception using errcode = '23514', message = 'inspection attribution can only change on a staged unit';
    end if;
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

  -- A staged unit may otherwise only be updated by recording its measurement or
  -- completing its inspection.
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

/**
 * Merges a set of newly-performed checks into a unit's inspection document.
 *
 * The incoming document is always the result of the monotonic merge, so the
 * CHECK constraint only has to re-validate structure. Callers must not pass an
 * arbitrary document: this function is the single place that decides what the
 * merged document looks like.
 */
create or replace function private.merge_opening_stock_inspection(
  existing_inspection jsonb,
  performed_checks jsonb,
  inspection_notes text
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with merged as (
    select coalesce(existing_inspection, '{}'::jsonb)
      || coalesce(performed_checks, '{}'::jsonb) as document
  )
  select merged.document
    || jsonb_build_object(
      'notes',
      case
        when inspection_notes is null then coalesce(merged.document -> 'notes', 'null'::jsonb)
        else to_jsonb(inspection_notes)
      end
    )
  from merged;
$$;

/**
 * Records the physical checks a manager has now performed.
 *
 * `p_checks` must contain only the eight canonical attestation keys, and every
 * supplied value must be exactly JSON `true`. A check that is already `true`
 * stays `true`; the merge is a union, never a replace, so photo-supported
 * evidence cannot be erased by omitting it.
 */
create or replace function public.complete_opening_stock_inspection(
  p_unit_id uuid,
  p_checks jsonb,
  p_inspection_notes text default null
)
returns table (
  unit_id uuid,
  inspection jsonb,
  inspection_ready boolean,
  completed_by_display_name text,
  completed_at timestamp with time zone
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
  canonical_checks constant text[] := array[
    'imei_confirmed_physical',
    'identity_labels_match',
    'display_passed',
    'cameras_passed',
    'buttons_passed',
    'connectivity_passed',
    'charging_port_passed',
    'activation_lock_cleared'
  ];
  merged_inspection jsonb;
  observed_at timestamptz := statement_timestamp();
  was_complete boolean;
begin
  if p_checks is null or jsonb_typeof(p_checks) <> 'object' then
    raise exception using errcode = '22023', message = 'inspection checks must be a JSON object';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_checks) as supplied_key(field_name)
    where not (supplied_key.field_name = any (canonical_checks))
  ) then
    raise exception using errcode = '22023', message = 'inspection contains an unsupported check';
  end if;

  -- Anything supplied must be literally true. A manager records what passed;
  -- a failed check stays absent and keeps the unit unactivatable.
  if exists (
    select 1
    from jsonb_each(p_checks) as supplied(field_name, field_value)
    where supplied.field_value <> 'true'::jsonb
  ) then
    raise exception using errcode = '22023', message = 'only passing inspection checks can be recorded';
  end if;

  if not exists (
    select 1 from jsonb_object_keys(p_checks)
  ) then
    raise exception using errcode = '22023', message = 'record at least one inspection check';
  end if;

  select opening_unit.* into target_unit
  from public.opening_stock_units opening_unit
  where opening_unit.id = p_unit_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'opening-stock unit not found';
  end if;

  -- Same permission gate activation uses. Fails closed without a JWT.
  caller_membership_id := private.opening_stock_actor_membership(target_unit.store_id, false);
  if caller_membership_id is null then
    raise exception using errcode = '42501', message = 'an active manager membership is required';
  end if;
  caller_display_name := private.opening_stock_actor_name(caller_user_id);

  if target_unit.status <> 'staged' then
    raise exception using errcode = '23514', message = 'only staged units can be inspected';
  end if;

  -- Monotonic by construction: the merge below is a union with the stored
  -- document, so a check that is already true can never be removed or reset by
  -- omitting it, and every supplied key must be literally true (asserted above).

  was_complete := coalesce(
    private.is_valid_opening_stock_inspection(target_unit.inspection),
    false
  );

  merged_inspection := private.merge_opening_stock_inspection(
    target_unit.inspection,
    p_checks,
    nullif(btrim(coalesce(p_inspection_notes, '')), '')
  );

  if coalesce(private.is_well_formed_opening_stock_inspection(merged_inspection), false) is not true then
    raise exception using errcode = '22023', message = 'the merged inspection document is not valid';
  end if;

  update public.opening_stock_units
  set inspection = merged_inspection,
      inspection_completed_by_user_id = caller_user_id,
      inspection_completed_by_membership_id = caller_membership_id,
      inspection_completed_by_display_name = caller_display_name,
      inspection_completed_at = observed_at,
      updated_at = observed_at
  where id = target_unit.id;

  perform private.opening_stock_audit(
    target_unit.store_id, caller_user_id, caller_membership_id,
    'opening_stock.inspection_completed', 'opening_stock_unit', target_unit.id,
    jsonb_build_object(
      'imei_suffix', right(target_unit.imei, 4),
      'recorded_checks', (
        select coalesce(jsonb_agg(supplied.field_name order by supplied.field_name), '[]'::jsonb)
        from jsonb_object_keys(p_checks) as supplied(field_name)
      ),
      'preserved_checks', (
        select coalesce(jsonb_agg(existing.field_name order by existing.field_name), '[]'::jsonb)
        from jsonb_object_keys(coalesce(target_unit.inspection, '{}'::jsonb)) as existing(field_name)
        where existing.field_name <> 'notes'
          and not (p_checks ? existing.field_name)
      ),
      'inspection_ready_before', was_complete,
      'inspection_ready_after', coalesce(
        private.is_valid_opening_stock_inspection(merged_inspection),
        false
      ),
      'notes', nullif(btrim(coalesce(p_inspection_notes, '')), '')
    ),
    observed_at
  );

  return query
  select
    target_unit.id,
    merged_inspection,
    coalesce(private.is_valid_opening_stock_inspection(merged_inspection), false),
    caller_display_name,
    observed_at;
end;
$$;

/**
 * Records the cosmetic condition a manager has now assessed.
 *
 * Cosmetic condition is a physical assessment, so it can only be recorded once
 * per unit: the first recorded value stands, which keeps the audit trail honest
 * and stops an already-staged unit being silently re-graded.
 */
create or replace function public.record_opening_stock_unit_condition(
  p_unit_id uuid,
  p_condition text
)
returns table (
  unit_id uuid,
  condition text,
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
  normalized_condition text := lower(btrim(coalesce(p_condition, '')));
  observed_at timestamptz := statement_timestamp();
begin
  if normalized_condition not in ('excellent', 'good', 'fair') then
    raise exception using errcode = '22023', message = 'condition must be excellent, good or fair';
  end if;

  select opening_unit.* into target_unit
  from public.opening_stock_units opening_unit
  where opening_unit.id = p_unit_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'opening-stock unit not found';
  end if;

  caller_membership_id := private.opening_stock_actor_membership(target_unit.store_id, false);
  if caller_membership_id is null then
    raise exception using errcode = '42501', message = 'an active manager membership is required';
  end if;

  if target_unit.status <> 'staged' then
    raise exception using errcode = '23514', message = 'condition can only be recorded on a staged unit';
  end if;

  if target_unit.condition is not null then
    raise exception using errcode = '23514', message = 'the cosmetic condition is already recorded for this unit';
  end if;

  update public.opening_stock_units
  set condition = normalized_condition,
      updated_at = observed_at
  where id = target_unit.id;

  perform private.opening_stock_audit(
    target_unit.store_id, caller_user_id, caller_membership_id,
    'opening_stock.unit_condition_recorded', 'opening_stock_unit', target_unit.id,
    jsonb_build_object(
      'imei_suffix', right(target_unit.imei, 4),
      'condition', normalized_condition,
      'previous_condition', null
    ),
    observed_at
  );

  return query
  select target_unit.id, normalized_condition, target_unit.status;
end;
$$;

-- Execution is limited to authenticated sessions; `anon` is not granted, and the
-- null-JWT import path resolves no membership and is refused inside the bodies.
revoke all on function public.complete_opening_stock_inspection(uuid, jsonb, text) from public, anon;
revoke all on function public.record_opening_stock_unit_condition(uuid, text) from public, anon;
grant execute on function public.complete_opening_stock_inspection(uuid, jsonb, text) to authenticated;
grant execute on function public.record_opening_stock_unit_condition(uuid, text) to authenticated;

-- `opening_stock_units_view` is a `select` list over the base table, so it must be
-- recreated to expose the completer fields. `create or replace view` cannot add
-- columns, so drop and recreate with the same options and the same row filter.
drop view if exists public.opening_stock_units_view;

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
  unit.inspection_completed_by_user_id,
  unit.inspection_completed_by_membership_id,
  unit.inspection_completed_by_display_name,
  unit.inspection_completed_at,
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

commit;
