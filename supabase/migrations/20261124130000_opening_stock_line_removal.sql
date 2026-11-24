-- Opening Stock: remove a product line from an open, unreceived invoice.
--
-- Why this needs to be a real backend operation
-- --------------------------------------------
-- `correct_supplier_invoice_line` can change a quantity or a cost but cannot
-- remove a line, and `authenticated` holds no `delete` grant on
-- `supplier_invoice_lines` (by design: the financial record must not simply
-- disappear). A manager who keys the wrong model needs to take that line off the
-- invoice, so removal is a first-class, audited operation instead.
--
-- Design decisions, and why they are the safe ones
-- ------------------------------------------------
-- 1. The line is *retired*, not deleted. `supplier_invoice_corrections` is
--    append-only and its rows carry a foreign key to the line
--    (`(line_id, invoice_id, store_id)` ... on delete restrict). Deleting the
--    line would have to break that ledger; updating the ledger to detach it is
--    refused by `supplier_invoice_corrections_append_only`. Marking the line
--    keeps the ledger immutable, keeps the reference valid, and keeps the
--    history of what was once keyed.
--
-- 2. Stored line numbers stay immutable. `supplier_invoice_lines` has
--    `unique (invoice_id, line_number)` enforced immediately, so renumbering the
--    surviving rows inside one statement can transiently collide depending on
--    the row order the planner picks. Instead the *displayed* numbering is
--    derived in `opening_stock_invoice_lines_view` with `row_number()`, which is
--    computed for free, cannot collide, and also keeps
--    `add_supplier_invoice_line`'s `max(line_number) + 1` correct with no change
--    to that function.
--
-- 3. Every arithmetic path excludes retired lines: the line view, the
--    invoice-total function and the reconciliation function. A retired line
--    therefore disappears from totals, from reconciliation and from "what is
--    outstanding", which is what "remove" has to mean here.
--
-- Rules enforced by the RPC:
--   * manager workspace + inventory authority in the same store;
--   * only an invoice whose status is still `open` may lose a line;
--   * a line with any received device can never be retired;
--   * the invoice can never be left with no lines;
--   * the invoice's confirmation is reset, because the totals that were
--     confirmed no longer describe it;
--   * a reason of 5–500 characters with no control characters is mandatory;
--   * a `supplier_invoice_corrections` row and an
--     `opening_stock.invoice_line_removed` audit event are written.

-- 1. Retirement bookkeeping on the line ----------------------------------------

alter table public.supplier_invoice_lines
  add column if not exists removed_at timestamptz,
  add column if not exists removed_by_user_id uuid references public.profiles(id) on update cascade on delete restrict,
  add column if not exists removed_by_membership_id uuid,
  add column if not exists removed_by_display_name text,
  add column if not exists removal_reason text;

-- A line is either live and untouched, or retired with a complete, attributable
-- and reasoned record. There is no half-removed state.
alter table public.supplier_invoice_lines
  add constraint supplier_invoice_lines_removal_consistent check (
    (removed_at is null
      and removed_by_user_id is null
      and removed_by_membership_id is null
      and removed_by_display_name is null
      and removal_reason is null)
    or (removed_at is not null
      and removed_by_user_id is not null
      and removed_by_membership_id is not null
      and removed_by_display_name is not null
      and removal_reason is not null
      and removal_reason = btrim(removal_reason)
      and length(removal_reason) between 5 and 500)
  );

-- Part of the manager-facing record of what was removed and why.
create index if not exists supplier_invoice_lines_removed_idx
  on public.supplier_invoice_lines (invoice_id)
  where removed_at is not null;

-- 2. Every financial and quantity calculation excludes retired lines -----------

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
          and invoice_line.removed_at is null
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
        and invoice_line.removed_at is null
    )
    and coalesce((
      select sum(invoice_line.line_total_pesewas::numeric)
      from public.supplier_invoice_lines invoice_line
      where invoice_line.invoice_id = invoice.id
        and invoice_line.removed_at is null
    ), 0::numeric) = invoice.declared_total_pesewas::numeric,
    false
  )
  from public.supplier_invoices invoice
  where invoice.id = target_invoice_id;
$$;

-- The line view is the intake migration's definition with exactly two changes:
-- retired lines are filtered out, and the displayed number is re-derived from the
-- surviving rows so a removal cannot leave a gap in the numbering the manager
-- sees. Everything else — the quantity aggregation, the cost masking, the
-- security settings — is unchanged. `::integer` keeps the column type identical,
-- which `create or replace view` requires.
create or replace view public.opening_stock_invoice_lines_view
with (security_invoker = true, security_barrier = true)
as
select
  line.id,
  line.invoice_id,
  line.store_id,
  (row_number() over (partition by line.invoice_id order by line.line_number))::integer as line_number,
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
  and line.removed_at is null
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

-- The line view is `security_invoker = true`, so its predicates are evaluated
-- with the *caller's* privileges: the `removed_at is null` filter above means
-- every reader needs SELECT on that column, or the view fails outright with
-- "permission denied for table supplier_invoice_lines". Grant exactly that one
-- column and nothing more — `removal_reason`, `removed_by_*` and every cost
-- column stay unreadable directly.
grant select (removed_at) on table public.supplier_invoice_lines to authenticated;

-- 3. The audited removal RPC ---------------------------------------------------

create or replace function public.remove_supplier_invoice_line(
  p_invoice_line_id uuid,
  p_reason text
)
returns table (correction_id uuid, invoice_id uuid, result text)
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
  received_device_count integer;
  surviving_line_count integer;
  before_data jsonb;
  new_correction_id uuid := gen_random_uuid();
  confirmation_reset boolean := false;
  observed_at timestamptz := statement_timestamp();
begin
  if p_invoice_line_id is null then
    raise exception using errcode = '22023', message = 'invoice line is required';
  end if;

  select line.* into line_record
  from public.supplier_invoice_lines line
  where line.id = p_invoice_line_id;

  if not found then
    raise exception using errcode = '42501', message = 'supplier invoice line not found';
  end if;

  -- Lock the invoice first, exactly as `correct_supplier_invoice_line` does: a
  -- removal racing a correction, another removal, or a confirmation must
  -- serialise, because the removal resets that confirmation. Verified with two
  -- concurrent sessions — the second waits for the first to finish and then fails
  -- with "invoice line is already removed" rather than removing twice.
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

  -- Same authority resolution as every other opening-stock mutation: inventory
  -- management plus the manager workspace, resolved from the caller's own
  -- membership in this store (so store isolation is inherited, not re-implemented).
  caller_membership_id := private.opening_stock_actor_membership(invoice_record.store_id, false);
  caller_display_name := private.opening_stock_actor_name(caller_user_id);

  if line_record.removed_at is not null then
    raise exception using errcode = '23514', message = 'invoice line is already removed';
  end if;
  if invoice_record.status <> 'open' then
    raise exception using errcode = '23514', message = 'closed invoice line cannot be removed';
  end if;
  if length(normalized_reason) not between 5 and 500
    or normalized_reason ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'valid correction reason required';
  end if;

  select count(*)::integer into received_device_count
  from public.opening_stock_units opening_unit
  where opening_unit.invoice_line_id = line_record.id;

  if received_device_count > 0 then
    raise exception using errcode = '23514',
      message = 'invoice line cannot be removed after devices are received';
  end if;

  select count(*)::integer into surviving_line_count
  from public.supplier_invoice_lines line
  where line.invoice_id = invoice_record.id
    and line.id <> line_record.id
    and line.removed_at is null;

  if surviving_line_count < 1 then
    raise exception using errcode = '23514',
      message = 'the last invoice line cannot be removed; close the invoice instead';
  end if;

  before_data := jsonb_build_object(
    'line_number', line_record.line_number,
    'model_catalogue_id', line_record.model_catalogue_id,
    'device_model_id', line_record.device_model_id,
    'quantity_invoiced', line_record.quantity_invoiced,
    'unit_cost_pesewas', line_record.unit_cost_pesewas,
    'currency', line_record.currency,
    'notes', line_record.notes
  );

  -- Retire the line. `supplier_invoice_lines` has no append-only trigger (only the
  -- two ledger tables do), so this update is legal while the ledger itself stays
  -- untouched. `line_number` is deliberately left alone: stored numbers are
  -- immutable, and the view re-derives the visible numbering.
  update public.supplier_invoice_lines
  set removed_at = observed_at,
      removed_by_user_id = caller_user_id,
      removed_by_membership_id = caller_membership_id,
      removed_by_display_name = caller_display_name,
      removal_reason = normalized_reason,
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

  -- Append-only: insert only. `line_id` stays populated, which is exactly what the
  -- (`entity_type = 'invoice_line'` ⇒ `line_id is not null`) check requires and
  -- what keeps the audit trail pointing at the retired line.
  insert into public.supplier_invoice_corrections (
    id, store_id, invoice_id, line_id, entity_type, before_data, after_data,
    reason, actor_user_id, actor_membership_id, actor_display_name, created_at
  )
  values (
    new_correction_id, line_record.store_id, line_record.invoice_id,
    line_record.id, 'invoice_line', before_data,
    jsonb_build_object(
      'removed', true,
      'removed_by_display_name', caller_display_name
    ),
    normalized_reason, caller_user_id, caller_membership_id, caller_display_name,
    observed_at
  );

  perform private.opening_stock_audit(
    line_record.store_id, caller_user_id, caller_membership_id,
    'opening_stock.invoice_line_removed', 'supplier_invoice_line', line_record.id,
    jsonb_build_object(
      'correction_id', new_correction_id,
      'reason', normalized_reason,
      'confirmation_reset', confirmation_reset,
      'line_number', line_record.line_number
    ),
    observed_at
  );

  update public.supplier_invoices
  set updated_at = observed_at
  where id = invoice_record.id;

  return query select new_correction_id, invoice_record.id, 'removed'::text;
end;
$$;

revoke all on function public.remove_supplier_invoice_line(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.remove_supplier_invoice_line(uuid, text) to authenticated;
grant execute on function private.opening_stock_invoice_total(uuid) to authenticated, service_role;
grant execute on function private.opening_stock_invoice_reconciled(uuid) to authenticated, service_role;

comment on column public.supplier_invoice_lines.removed_at is
  'Set when a manager retired a keyed line before any device was received. Retired lines are excluded from every total, from reconciliation and from the invoice line view, but are kept so the immutable correction ledger keeps a valid reference.';
comment on function public.remove_supplier_invoice_line(uuid, text) is
  'Retires an unreceived line from an open supplier invoice, resets confirmation, and records an audited correction with a mandatory reason. Refuses closed invoices, lines holding devices, and invoices with no other line.';
