begin;

select plan(10);

-- 1. Every intended iPhone model/storage combination is registered (109 variants across 35 models).
select is(
  (
    select count(*)::integer
    from public.device_models
    where model_name in (
      'iPhone X', 'iPhone XR', 'iPhone XS', 'iPhone XS Max',
      'iPhone 11', 'iPhone 11 Pro', 'iPhone 11 Pro Max',
      'iPhone 12', 'iPhone 12 mini', 'iPhone 12 Pro', 'iPhone 12 Pro Max',
      'iPhone 13', 'iPhone 13 mini', 'iPhone 13 Pro', 'iPhone 13 Pro Max',
      'iPhone 14', 'iPhone 14 Plus', 'iPhone 14 Pro', 'iPhone 14 Pro Max',
      'iPhone 15', 'iPhone 15 Plus', 'iPhone 15 Pro', 'iPhone 15 Pro Max',
      'iPhone 16', 'iPhone 16 Plus', 'iPhone 16 Pro', 'iPhone 16 Pro Max', 'iPhone 16e',
      'iPhone 17', 'iPhone 17 Air', 'iPhone 17 Pro', 'iPhone 17 Pro Max',
      'iPhone SE (1st generation)', 'iPhone SE (2nd generation)', 'iPhone SE (3rd generation)'
    )
  ),
  111,
  'All 111 official iPhone model/storage variants are registered'
);

select is(
  (
    select count(distinct model_name)::integer
    from public.device_models
    where model_name like 'iPhone %'
  ),
  35,
  'All 35 official iPhone models are registered'
);

-- 2. Existing iPhone XR 128GB is intact and un-duplicated.
select is(
  (select count(*)::integer from public.device_models where lower(model_name) = 'iphone xr' and storage_gb = 128),
  1,
  'iPhone XR 128GB exists exactly once'
);

-- 3. Running the idempotent seed again creates no duplicates.
insert into public.device_models (model_name, storage_gb)
values
  ('iPhone XR', 128),
  ('iPhone 15 Pro Max', 256),
  ('iPhone 17 Pro Max', 2048)
on conflict (lower(model_name), storage_gb) do nothing;

select is(
  (select count(*)::integer from public.device_models where lower(model_name) = 'iphone xr' and storage_gb = 128),
  1,
  'Re-running the seed creates no duplicate iPhone XR 128GB'
);

-- 4. Model-specific storage rules: 15 Pro Max / 16 Pro Max have no 128GB; 17 Pro Max has 2TB.
select is(
  (select count(*)::integer from public.device_models where model_name in ('iPhone 15 Pro Max', 'iPhone 16 Pro Max') and storage_gb = 128),
  0,
  'iPhone 15 Pro Max and 16 Pro Max do not have 128GB'
);
select is(
  (select count(*)::integer from public.device_models where model_name = 'iPhone 17 Pro Max' and storage_gb = 2048),
  1,
  'iPhone 17 Pro Max includes 2TB (2048GB)'
);

-- 5. Seed does not invent inventory devices or supplier invoices.
select is(
  (select count(*)::integer from public.store_inventory),
  0,
  'Model catalogue seed does not create store inventory'
);
select is(
  (select count(*)::integer from public.supplier_invoices),
  0,
  'Model catalogue seed does not create supplier invoices'
);

-- 6. Manager can select a seeded model in opening-stock intake; employee cannot.
set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"17000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.register_opening_stock_model('00000000-0000-4000-8000-000000000009', 'iPhone 15 Pro Max', 256, null)$$,
  '42501', null,
  'Employees cannot register or manage store opening-stock catalogue models'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"17000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select * from public.register_opening_stock_model('00000000-0000-4000-8000-000000000009', 'iPhone 15 Pro Max', 256, null)$$,
  'Manager can select a seeded iPhone model for opening-stock intake'
);

select * from finish();
rollback;
