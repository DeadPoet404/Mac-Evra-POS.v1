-- Opening-stock receipt correction path.
--
-- PREPARED ONLY. This migration has deliberately NOT been applied.
--
-- Why it exists
-- -------------
-- Two handsets staged on 2026-11-26 cannot be brought into line with their
-- evidence through any path the database currently offers:
--
--   1. `356346100727657` is an iPhone 11 / 128GB. `receive_opening_stock_devices`
--      derives the model from the invoice line's `model_catalogue_id`, which was
--      wrong at the time of receipt, so the row was written as an iPhone 15 Plus
--      256GB on invoice line 15 at GHS 5,800 instead of line 3 at GHS 2,050.
--
--   2. `351111565339819` and `351111564542926` are iPhone 14 Plus **256GB**
--      handsets (both screens report ~238GB usable), but the only active
--      catalogue entry for that line is the 128GB variant, so they were written
--      against the wrong `device_model_id`.
--
-- Both are identity-column mistakes. `private.validate_opening_stock_unit_update`
-- makes `invoice_line_id`, `device_model_id` and `unit_cost_pesewas` immutable,
-- and `private.prevent_opening_stock_unit_delete` refuses every delete
-- unconditionally, so neither can be fixed in place today.
--
-- What this migration adds
-- ------------------------
-- A single, narrowly scoped, audited correction function. It is deliberately
-- *not* a general "edit received unit" grant:
--
--   * identity may only be realigned to a **different catalogue entry on the
--     same invoice**, so totals are untouched and no amount is re-derived;
--   * `imei`, `colour`, `battery_health`, `inspection`, `condition` and the
--     receipt attribution are never written by it;
--   * the caller must be an active member with `access_manager_workspace`, and
--     the unit must still be `staged`;
--   * the correction is append-only audited as
--     `opening_stock.receipt_corrected` with the before/after identity.
--
-- A trigger is used rather than an UPDATE in the function body so that the
-- immutability trigger can remain in force for every other caller. The
-- correction function sets a transaction-local marker that the validate trigger
-- honours for exactly one statement.

begin;

-- The trigger must allow one narrowly-marked identity realignment. Everything
-- else about it is unchanged.
create or replace function private.validate_opening_stock_unit_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  inspection_preserved boolean := true;
  correction_allowed boolean := coalesce(
    current_setting('mac_evra.opening_stock_correction', true) = 'on',
    false
  );
  identity_changed boolean;
begin
  identity_changed :=
    new.invoice_line_id is distinct from old.invoice_line_id
    or new.device_model_id is distinct from old.device_model_id
    or new.unit_cost_pesewas is distinct from old.unit_cost_pesewas;

  if new.id is distinct from old.id
    or new.store_id is distinct from old.store_id
    or new.imei is distinct from old.imei
    or new.colour is distinct from old.colour
    or new.received_by_user_id is distinct from old.received_by_user_id
    or new.received_by_membership_id is distinct from old.received_by_membership_id
    or new.received_by_display_name is distinct from old.received_by_display_name
    or new.received_at is distinct from old.received_at
    or new.created_at is distinct from old.created_at then
    raise exception using errcode = '23514', message = 'received opening-stock identity is immutable';
  end if;

  -- The ONLY relaxation: a correction operation may realign the invoice line,
  -- the catalogue model and the stored unit cost. It may not touch anything
  -- else, and the correction function has already checked that the destination
  -- line belongs to the same invoice.
  if identity_changed and not correction_allowed then
    raise exception using errcode = '23514', message = 'received opening-stock identity is immutable';
  end if;

  -- An inspection may only ever gain passing attestations, and only while the
  -- unit is still staged. Nothing that is already true may be lost or changed.
  if new.inspection is distinct from old.inspection then
    if correction_allowed then
      raise exception using errcode = '23514', message = 'a receipt correction cannot change inspection evidence';
    end if;

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
      raise exception using errcode = '23514', message = 'a newly recorded inspection check must be passing';
    end if;
  end if;

  return new;
end;
$$;

-- The audited correction entry point.
create or replace function public.correct_opening_stock_unit_receipt(
  p_unit_id uuid,
  p_invoice_line_id uuid,
  p_reason text
)
returns table (
  unit_id uuid,
  imei text,
  previous_line_number integer,
  corrected_line_number integer,
  previous_model_name text,
  corrected_model_name text,
  previous_unit_cost_pesewas bigint,
  corrected_unit_cost_pesewas bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  caller_membership_id uuid;
  unit_record public.opening_stock_units%rowtype;
  current_line public.supplier_invoice_lines%rowtype;
  target_line public.supplier_invoice_lines%rowtype;
  target_model_id uuid;
  normalized_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  observed_at timestamptz := statement_timestamp();
  previous_line_number integer;
  previous_model_name text;
  corrected_model_name text;
begin
  select unit.* into unit_record
  from public.opening_stock_units unit
  where unit.id = p_unit_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'opening-stock unit not found';
  end if;

  caller_membership_id := private.opening_stock_actor_membership(unit_record.store_id, false);

  if not private.has_store_permission(unit_record.store_id, 'access_manager_workspace') then
    raise exception using errcode = '42501', message = 'manager workspace access required to correct a receipt';
  end if;

  if unit_record.status <> 'staged' then
    raise exception using errcode = '23514', message = 'only a staged unit can be corrected';
  end if;

  if normalized_reason is null
    or length(normalized_reason) > 500
    or normalized_reason ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'a written reason of at most 500 characters is required';
  end if;

  select line.* into current_line
  from public.supplier_invoice_lines line
  where line.id = unit_record.invoice_line_id;

  select line.* into target_line
  from public.supplier_invoice_lines line
  where line.id = p_invoice_line_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'target supplier invoice line not found';
  end if;

  -- Totals must be untouched: the same invoice only.
  if target_line.invoice_id <> current_line.invoice_id then
    raise exception using errcode = '23514', message = 'a correction must stay on the same supplier invoice';
  end if;

  if target_line.removed_at is not null then
    raise exception using errcode = '23514', message = 'target supplier invoice line has been removed';
  end if;

  if p_invoice_line_id = unit_record.invoice_line_id then
    raise exception using errcode = '22023', message = 'the unit is already on that invoice line';
  end if;

  -- The destination line must still have room, counting the unit as moving.
  if (
    select count(*)
    from public.opening_stock_units unit
    where unit.invoice_line_id = target_line.id
      and unit.id <> unit_record.id
  ) >= target_line.quantity_invoiced then
    raise exception using errcode = '23514', message = 'target supplier invoice line has no remaining capacity';
  end if;

  select catalogue.device_model_id into target_model_id
  from public.opening_stock_models catalogue
  where catalogue.id = target_line.model_catalogue_id;

  if target_model_id is null then
    raise exception using errcode = '23514', message = 'target supplier invoice line has no catalogue model';
  end if;

  select line.line_number into previous_line_number
  from public.supplier_invoice_lines line where line.id = unit_record.invoice_line_id;

  select model.model_name into previous_model_name
  from public.device_models model where model.id = unit_record.device_model_id;

  select model.model_name into corrected_model_name
  from public.device_models model where model.id = target_model_id;

  perform set_config('mac_evra.opening_stock_correction', 'on', true);

  update public.opening_stock_units
  set invoice_line_id = target_line.id,
      device_model_id = target_model_id,
      unit_cost_pesewas = target_line.unit_cost_pesewas
  where id = unit_record.id;

  perform set_config('mac_evra.opening_stock_correction', 'off', true);

  perform private.opening_stock_audit(
    unit_record.store_id, caller_user_id, caller_membership_id,
    'opening_stock.receipt_corrected', 'opening_stock_unit', unit_record.id,
    jsonb_build_object(
      'imei', unit_record.imei,
      'reason', normalized_reason,
      'previous_line_number', previous_line_number,
      'corrected_line_number', target_line.line_number,
      'previous_model_name', previous_model_name,
      'corrected_model_name', corrected_model_name,
      'previous_unit_cost_pesewas', unit_record.unit_cost_pesewas,
      'corrected_unit_cost_pesewas', target_line.unit_cost_pesewas
    ),
    observed_at
  );

  return query
  select
    unit_record.id,
    unit_record.imei,
    previous_line_number,
    target_line.line_number,
    previous_model_name,
    corrected_model_name,
    unit_record.unit_cost_pesewas,
    target_line.unit_cost_pesewas;
end;
$$;

revoke all on function public.correct_opening_stock_unit_receipt(uuid, uuid, text) from public, anon;
grant execute on function public.correct_opening_stock_unit_receipt(uuid, uuid, text) to authenticated;

commit;
