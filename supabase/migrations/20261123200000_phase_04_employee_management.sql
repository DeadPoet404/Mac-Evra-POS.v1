begin;

-- Staff access changes are performed only through this audited, store-scoped RPC.
create or replace function public.update_staff_membership(
  p_membership_id uuid,
  p_role_code text default null,
  p_status text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  caller_membership_id uuid;
  target_membership public.store_memberships%rowtype;
  target_role_code text;
  next_role_id uuid;
  next_role_code text;
  next_status text;
  can_manage_roles boolean;
  observed_at timestamptz := clock_timestamp();
begin
  if caller_user_id is null then
    raise exception using errcode = '28000', message = 'authentication required';
  end if;

  if p_role_code is null and p_status is null then
    raise exception using errcode = '22023', message = 'at least one staff change is required';
  end if;

  if p_role_code is not null and p_role_code not in ('employee', 'manager', 'administrator') then
    raise exception using errcode = '22023', message = 'valid staff role required';
  end if;

  if p_status is not null and p_status not in ('active', 'suspended', 'inactive') then
    raise exception using errcode = '22023', message = 'valid staff status required';
  end if;

  select membership.id
  into caller_membership_id
  from public.store_memberships membership
  join public.profiles profile on profile.id = membership.user_id
  join public.stores store_record on store_record.id = membership.store_id
  where membership.user_id = caller_user_id
    and membership.status = 'active'
    and profile.status = 'active'
    and store_record.status = 'active'
    and private.has_store_permission(membership.store_id, 'manage_employee_access')
  order by membership.created_at
  limit 1
  for share of membership, profile, store_record;

  if caller_membership_id is null then
    raise exception using errcode = '42501', message = 'active employee access management permission required';
  end if;

  select membership.*
  into target_membership
  from public.store_memberships membership
  where membership.id = p_membership_id
    and membership.store_id = (
      select own_membership.store_id
      from public.store_memberships own_membership
      where own_membership.id = caller_membership_id
    )
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'staff membership not found in your store';
  end if;

  if target_membership.user_id = caller_user_id then
    raise exception using errcode = '42501', message = 'you cannot change your own staff access';
  end if;

  select role_record.code
  into target_role_code
  from public.roles role_record
  where role_record.id = target_membership.role_id;

  can_manage_roles := private.has_store_permission(target_membership.store_id, 'manage_roles');

  if p_role_code is not null and p_role_code <> target_role_code and not can_manage_roles then
    raise exception using errcode = '42501', message = 'administrator role permission required for role changes';
  end if;

  if p_status is not null and not can_manage_roles and target_role_code <> 'employee' then
    raise exception using errcode = '42501', message = 'only an administrator can change manager or administrator status';
  end if;

  next_role_code := coalesce(p_role_code, target_role_code);
  next_status := coalesce(p_status, target_membership.status);

  if next_role_code <> 'employee' and not can_manage_roles then
    raise exception using errcode = '42501', message = 'administrator role permission required for elevated access';
  end if;

  select role_record.id
  into next_role_id
  from public.roles role_record
  where role_record.code = next_role_code;

  if next_role_id is null then
    raise exception using errcode = '22023', message = 'staff role not found';
  end if;

  if target_role_code = 'administrator'
    and target_membership.status = 'active'
    and (next_role_code <> 'administrator' or next_status <> 'active')
    and (
      select count(*)
      from public.store_memberships membership
      join public.roles role_record on role_record.id = membership.role_id
      where membership.store_id = target_membership.store_id
        and membership.status = 'active'
        and role_record.code = 'administrator'
    ) <= 1 then
    raise exception using errcode = '23514', message = 'the store must retain at least one active administrator';
  end if;

  update public.store_memberships
  set role_id = next_role_id,
      status = next_status
  where id = target_membership.id;

  insert into public.audit_events (
    store_id, actor_user_id, actor_membership_id, action,
    entity_type, entity_id, event_data, occurred_at
  )
  values (
    target_membership.store_id, caller_user_id, caller_membership_id,
    'staff.membership_updated', 'store_membership', target_membership.id,
    jsonb_build_object(
      'previous_role', target_role_code,
      'new_role', next_role_code,
      'previous_status', target_membership.status,
      'new_status', next_status
    ),
    observed_at
  );
end;
$$;

revoke all on function public.update_staff_membership(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.update_staff_membership(uuid, text, text) to authenticated;

comment on function public.update_staff_membership(uuid, text, text) is
  'Store-scoped staff role/status update. Prevents self-change, enforces administrator-only elevated access and preserves an active administrator.';

commit;
