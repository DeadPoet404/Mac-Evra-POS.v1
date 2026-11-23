begin;

-- Idempotent seed of official Apple iPhone models and their actual released
-- storage capacities into public.device_models. Existing rows (including
-- iPhone XR 128GB) are preserved untouched via ON CONFLICT DO NOTHING.
insert into public.device_models (model_name, storage_gb)
values
  -- iPhone X / XR / XS / XS Max
  ('iPhone X', 64),
  ('iPhone X', 256),
  ('iPhone XR', 64),
  ('iPhone XR', 128),
  ('iPhone XR', 256),
  ('iPhone XS', 64),
  ('iPhone XS', 256),
  ('iPhone XS', 512),
  ('iPhone XS Max', 64),
  ('iPhone XS Max', 256),
  ('iPhone XS Max', 512),

  -- iPhone 11 series
  ('iPhone 11', 64),
  ('iPhone 11', 128),
  ('iPhone 11', 256),
  ('iPhone 11 Pro', 64),
  ('iPhone 11 Pro', 256),
  ('iPhone 11 Pro', 512),
  ('iPhone 11 Pro Max', 64),
  ('iPhone 11 Pro Max', 256),
  ('iPhone 11 Pro Max', 512),

  -- iPhone 12 series
  ('iPhone 12', 64),
  ('iPhone 12', 128),
  ('iPhone 12', 256),
  ('iPhone 12 mini', 64),
  ('iPhone 12 mini', 128),
  ('iPhone 12 mini', 256),
  ('iPhone 12 Pro', 128),
  ('iPhone 12 Pro', 256),
  ('iPhone 12 Pro', 512),
  ('iPhone 12 Pro Max', 128),
  ('iPhone 12 Pro Max', 256),
  ('iPhone 12 Pro Max', 512),

  -- iPhone 13 series
  ('iPhone 13', 128),
  ('iPhone 13', 256),
  ('iPhone 13', 512),
  ('iPhone 13 mini', 128),
  ('iPhone 13 mini', 256),
  ('iPhone 13 mini', 512),
  ('iPhone 13 Pro', 128),
  ('iPhone 13 Pro', 256),
  ('iPhone 13 Pro', 512),
  ('iPhone 13 Pro', 1024),
  ('iPhone 13 Pro Max', 128),
  ('iPhone 13 Pro Max', 256),
  ('iPhone 13 Pro Max', 512),
  ('iPhone 13 Pro Max', 1024),

  -- iPhone 14 series
  ('iPhone 14', 128),
  ('iPhone 14', 256),
  ('iPhone 14', 512),
  ('iPhone 14 Plus', 128),
  ('iPhone 14 Plus', 256),
  ('iPhone 14 Plus', 512),
  ('iPhone 14 Pro', 128),
  ('iPhone 14 Pro', 256),
  ('iPhone 14 Pro', 512),
  ('iPhone 14 Pro', 1024),
  ('iPhone 14 Pro Max', 128),
  ('iPhone 14 Pro Max', 256),
  ('iPhone 14 Pro Max', 512),
  ('iPhone 14 Pro Max', 1024),

  -- iPhone 15 series
  ('iPhone 15', 128),
  ('iPhone 15', 256),
  ('iPhone 15', 512),
  ('iPhone 15 Plus', 128),
  ('iPhone 15 Plus', 256),
  ('iPhone 15 Plus', 512),
  ('iPhone 15 Pro', 128),
  ('iPhone 15 Pro', 256),
  ('iPhone 15 Pro', 512),
  ('iPhone 15 Pro', 1024),
  ('iPhone 15 Pro Max', 256),
  ('iPhone 15 Pro Max', 512),
  ('iPhone 15 Pro Max', 1024),

  -- iPhone 16 series
  ('iPhone 16', 128),
  ('iPhone 16', 256),
  ('iPhone 16', 512),
  ('iPhone 16 Plus', 128),
  ('iPhone 16 Plus', 256),
  ('iPhone 16 Plus', 512),
  ('iPhone 16 Pro', 128),
  ('iPhone 16 Pro', 256),
  ('iPhone 16 Pro', 512),
  ('iPhone 16 Pro', 1024),
  ('iPhone 16 Pro Max', 256),
  ('iPhone 16 Pro Max', 512),
  ('iPhone 16 Pro Max', 1024),
  ('iPhone 16e', 128),
  ('iPhone 16e', 256),
  ('iPhone 16e', 512),

  -- iPhone 17 series
  ('iPhone 17', 256),
  ('iPhone 17', 512),
  ('iPhone 17 Air', 256),
  ('iPhone 17 Air', 512),
  ('iPhone 17 Air', 1024),
  ('iPhone 17 Pro', 256),
  ('iPhone 17 Pro', 512),
  ('iPhone 17 Pro', 1024),
  ('iPhone 17 Pro Max', 256),
  ('iPhone 17 Pro Max', 512),
  ('iPhone 17 Pro Max', 1024),
  ('iPhone 17 Pro Max', 2048),

  -- iPhone SE series
  ('iPhone SE (1st generation)', 16),
  ('iPhone SE (1st generation)', 32),
  ('iPhone SE (1st generation)', 64),
  ('iPhone SE (1st generation)', 128),
  ('iPhone SE (2nd generation)', 64),
  ('iPhone SE (2nd generation)', 128),
  ('iPhone SE (2nd generation)', 256),
  ('iPhone SE (3rd generation)', 64),
  ('iPhone SE (3rd generation)', 128),
  ('iPhone SE (3rd generation)', 256)
on conflict (lower(model_name), storage_gb) do nothing;

commit;
