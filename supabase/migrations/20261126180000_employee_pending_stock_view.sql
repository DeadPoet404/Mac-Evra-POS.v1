-- Employee visibility of pending-inspection stock.
--
-- Why this exists
-- ---------------
-- Stock that has been received but not yet activated lives in
-- `opening_stock_units`. Its only read path was `opening_stock_units_view`,
-- which is gated on `access_manager_workspace`. Employees therefore saw an
-- inventory of zero while 44 handsets were physically on the shelf — they could
-- not tell the difference between "no stock" and "stock that is not sellable
-- yet".
--
-- This view closes that gap without making pending stock sellable.
--
-- Safety properties, deliberately chosen
-- --------------------------------------
--   * Read-only projection of `opening_stock_units`. It writes nothing and
--     creates no `inventory_devices` / `store_inventory` row, so a pending unit
--     cannot be reserved, sold, priced or activated through it. Availability in
--     the employee workspace still comes exclusively from `store_inventory`,
--     which stays empty until a manager activates a unit.
--   * Visibility is limited to `status = 'staged'`. Activated units disappear
--     from this view and appear in real inventory instead, so nothing is
--     double-counted.
--   * No cost, no approved price, no inspection document and no actor identity
--     is exposed. Cost masking is unchanged; there is simply nothing to mask.
--   * The view is NOT `security_invoker`. It cannot be, because the underlying
--     table's SELECT policy requires `access_manager_workspace` and an employee
--     would then see nothing. Instead the row filter below performs the
--     authorization explicitly for the calling user: `auth.uid()` inside the
--     `private.*` helpers resolves to the *invoker*, not the view owner, so a
--     member can only ever read their own store's staged units.

begin;

create or replace view public.pending_stock_view
with (security_barrier = true)
as
select
  unit.id,
  unit.store_id,
  unit.imei,
  unit.colour,
  unit.battery_health,
  unit.status,
  unit.received_at,
  model.model_name,
  model.storage_gb
from public.opening_stock_units unit
join public.device_models model
  on model.id = unit.device_model_id
where unit.status = 'staged'
  and private.is_active_store_member(unit.store_id)
  and private.has_store_permission(unit.store_id, 'access_employee_workspace');

comment on view public.pending_stock_view is
  'Read-only employee-facing projection of received stock that is not yet sellable. Exposes no cost, price or inspection detail.';

revoke all on public.pending_stock_view from public;
revoke all on public.pending_stock_view from anon;
grant select on public.pending_stock_view to authenticated;

commit;
