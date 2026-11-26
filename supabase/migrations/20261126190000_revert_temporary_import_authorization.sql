-- Revert the temporary import authorization.
--
-- `20261126140100_temporary_import_authorization.sql` (applied in production as
-- 20261126085644) opened a null-JWT path so a JWT-less import session could
-- receive opening stock. The 2026-11-26 import is finished, so this restores the
-- original behaviour before production use.
--
-- Everything restored here is byte-for-byte the pre-relaxation definition taken
-- from the migration that last defined it:
--
--   * `private.opening_stock_cost_visible(uuid)`  -> 20261124000000_opening_stock_intake
--   * `private.opening_stock_invoice_reconciled(uuid)` -> 20261124130000_opening_stock_line_removal
--   * `private.opening_stock_recipient_membership(uuid)` is dropped; it existed
--     only to attribute a null-JWT receipt.
--   * `private.opening_stock_invoice_totals_match(uuid)` is dropped; it existed
--     only to stand in for the permission graph on the null-JWT path.
--
-- `receive_opening_stock_devices` still calls `private.opening_stock_recipient_membership`.
-- Dropping that helper would break receiving entirely, so the function is
-- redefined here to the authenticated-only behaviour: it resolves the actor
-- through the ordinary permission-checked helper and fails closed for any
-- caller without a JWT. Receiving therefore stays usable for a signed-in
-- manager — which is the correct production path — and is no longer reachable
-- anonymously.

begin;

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

-- The helper is retained (the receive RPC depends on it) but now only ever
-- resolves an authenticated caller.
create or replace function private.opening_stock_recipient_membership(target_line_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_store_id uuid;
begin
  select line.store_id into target_store_id
  from public.supplier_invoice_lines line
  where line.id = target_line_id;

  if target_store_id is null then
    raise exception using errcode = '42501', message = 'supplier invoice line not found';
  end if;

  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'an authenticated manager is required to receive opening stock';
  end if;

  return private.opening_stock_actor_membership(target_store_id, false);
end;
$$;

drop function if exists private.opening_stock_invoice_totals_match(uuid);

commit;
