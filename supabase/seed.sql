-- Local development data only. This file intentionally creates no Auth users,
-- employees, invitations, credentials, sales, inventory, or financial records.
insert into public.stores (
  id,
  code,
  name,
  timezone,
  currency,
  status
)
values (
  '00000000-0000-4000-8000-000000000001',
  'mac-evra-development',
  'Mac Evra — Development Store',
  'Africa/Accra',
  'GHS',
  'active'
)
on conflict (id) do update
set code = excluded.code,
    name = excluded.name,
    timezone = excluded.timezone,
    currency = excluded.currency,
    status = excluded.status;
