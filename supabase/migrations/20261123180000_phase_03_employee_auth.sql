begin;

-- Invitation metadata is prepared by an authenticated store access manager.
-- Supabase Auth Admin email delivery remains a separate server-only operation.
create or replace function public.prepare_staff_invitation(
  p_store_id uuid,
  p_email text,
  p_role_id uuid,
  p_expires_in_hours integer default 72
)
returns table (
  result text,
  invitation_id uuid,
  email text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  caller_membership_id uuid;
  target_role_code text;
  normalized_email text := lower(btrim(p_email));
  observed_at timestamptz := clock_timestamp();
  existing_invitation public.staff_invitations%rowtype;
  new_invitation_id uuid;
begin
  if caller_user_id is null then
    raise exception using errcode = '28000', message = 'authentication required';
  end if;

  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or length(normalized_email) > 320 then
    raise exception using errcode = '22023', message = 'valid staff email required';
  end if;

  if p_expires_in_hours is null or p_expires_in_hours < 1 or p_expires_in_hours > 168 then
    raise exception using errcode = '22023', message = 'invitation expiry must be between 1 and 168 hours';
  end if;

  -- Serialize permission evaluation with membership/profile/store revocation.
  select membership.id
  into caller_membership_id
  from public.store_memberships membership
  join public.profiles profile on profile.id = membership.user_id
  join public.stores store_record on store_record.id = membership.store_id
  where membership.store_id = p_store_id
    and membership.user_id = caller_user_id
    and membership.status = 'active'
    and profile.status = 'active'
    and store_record.status = 'active'
  for share of membership, profile, store_record;

  if caller_membership_id is null
    or not private.has_store_permission(p_store_id, 'manage_employee_access') then
    raise exception using errcode = '42501', message = 'active manage_employee_access permission required';
  end if;

  select role_record.code
  into target_role_code
  from public.roles role_record
  where role_record.id = p_role_id;

  if target_role_code is null then
    raise exception using errcode = '22023', message = 'staff role does not exist';
  end if;

  -- Managers may onboard employees. Assigning manager or administrator access
  -- additionally requires the administrator-only manage_roles capability.
  if target_role_code <> 'employee'
    and not private.has_store_permission(p_store_id, 'manage_roles') then
    raise exception using errcode = '42501', message = 'manage_roles permission required for elevated roles';
  end if;

  if exists (
    select 1
    from public.profiles profile
    join public.store_memberships membership on membership.user_id = profile.id
    where membership.store_id = p_store_id
      and lower(profile.work_email) = normalized_email
  ) then
    raise exception using errcode = '23505', message = 'staff membership already exists for this store';
  end if;

  update public.staff_invitations invitation
  set status = 'expired'
  where invitation.store_id = p_store_id
    and invitation.email = normalized_email
    and invitation.status = 'pending'
    and invitation.expires_at <= observed_at;

  select invitation.*
  into existing_invitation
  from public.staff_invitations invitation
  where invitation.store_id = p_store_id
    and invitation.email = normalized_email
    and invitation.status = 'pending'
    and invitation.expires_at > observed_at
  for update;

  if found then
    if existing_invitation.role_id <> p_role_id then
      raise exception using errcode = '23505', message = 'a pending invitation already exists with another role';
    end if;

    return query
      select 'existing'::text, existing_invitation.id, existing_invitation.email, existing_invitation.expires_at;
    return;
  end if;

  new_invitation_id := gen_random_uuid();

  insert into public.staff_invitations (
    id,
    store_id,
    email,
    role_id,
    status,
    invited_by,
    expires_at
  )
  values (
    new_invitation_id,
    p_store_id,
    normalized_email,
    p_role_id,
    'pending',
    caller_user_id,
    observed_at + make_interval(hours => p_expires_in_hours)
  );

  insert into public.audit_events (
    store_id,
    actor_user_id,
    actor_membership_id,
    action,
    entity_type,
    entity_id,
    event_data,
    occurred_at
  )
  values (
    p_store_id,
    caller_user_id,
    caller_membership_id,
    'staff.invitation_prepared',
    'staff_invitation',
    new_invitation_id,
    jsonb_build_object('email', normalized_email, 'role_id', p_role_id),
    observed_at
  );

  return query
    select 'prepared'::text, new_invitation_id, normalized_email, observed_at + make_interval(hours => p_expires_in_hours);
end;
$$;

-- The authenticated invitee may accept only unexpired invitation records that
-- match the email owned by their verified Auth account. Store and role values
-- come exclusively from the trusted invitation row.
create or replace function public.accept_staff_invitations()
returns table (
  invitation_id uuid,
  membership_id uuid,
  store_id uuid,
  role_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  caller_email text;
  profile_status text;
  invitation_record public.staff_invitations%rowtype;
  membership_record public.store_memberships%rowtype;
  accepted_membership_id uuid;
  observed_at timestamptz := clock_timestamp();
begin
  if caller_user_id is null then
    raise exception using errcode = '28000', message = 'authentication required';
  end if;

  select lower(auth_user.email), profile.status
  into caller_email, profile_status
  from auth.users auth_user
  join public.profiles profile on profile.id = auth_user.id
  where auth_user.id = caller_user_id;

  if caller_email is null or profile_status <> 'active' then
    raise exception using errcode = '42501', message = 'active staff profile required';
  end if;

  update public.staff_invitations invitation
  set status = 'expired'
  where invitation.email = caller_email
    and invitation.status = 'pending'
    and invitation.expires_at <= observed_at;

  for invitation_record in
    select invitation.*
    from public.staff_invitations invitation
    join public.stores store_record on store_record.id = invitation.store_id
    where invitation.email = caller_email
      and invitation.status = 'pending'
      and invitation.expires_at > observed_at
      and store_record.status = 'active'
    order by invitation.created_at, invitation.id
    for update of invitation
  loop
    select membership.*
    into membership_record
    from public.store_memberships membership
    where membership.store_id = invitation_record.store_id
      and membership.user_id = caller_user_id
    for update;

    if found then
      if membership_record.role_id <> invitation_record.role_id
        or membership_record.status not in ('pending', 'active') then
        raise exception using errcode = '23505', message = 'existing staff membership conflicts with invitation';
      end if;

      accepted_membership_id := membership_record.id;
      if membership_record.status = 'pending' then
        update public.store_memberships
        set status = 'active',
            joined_at = coalesce(joined_at, observed_at)
        where id = membership_record.id;
      end if;
    else
      accepted_membership_id := gen_random_uuid();
      insert into public.store_memberships (
        id,
        store_id,
        user_id,
        role_id,
        status,
        invited_by,
        joined_at
      )
      values (
        accepted_membership_id,
        invitation_record.store_id,
        caller_user_id,
        invitation_record.role_id,
        'active',
        invitation_record.invited_by,
        observed_at
      );
    end if;

    update public.staff_invitations
    set status = 'accepted',
        accepted_by = caller_user_id,
        accepted_at = observed_at
    where id = invitation_record.id;

    insert into public.audit_events (
      store_id,
      actor_user_id,
      actor_membership_id,
      action,
      entity_type,
      entity_id,
      event_data,
      occurred_at
    )
    values (
      invitation_record.store_id,
      caller_user_id,
      accepted_membership_id,
      'staff.invitation_accepted',
      'staff_invitation',
      invitation_record.id,
      jsonb_build_object('membership_id', accepted_membership_id, 'role_id', invitation_record.role_id),
      observed_at
    );

    invitation_id := invitation_record.id;
    membership_id := accepted_membership_id;
    store_id := invitation_record.store_id;
    role_id := invitation_record.role_id;
    return next;
  end loop;
end;
$$;

revoke all on function public.prepare_staff_invitation(uuid, text, uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.accept_staff_invitations()
  from public, anon, authenticated, service_role;
grant execute on function public.prepare_staff_invitation(uuid, text, uuid, integer) to authenticated;
grant execute on function public.accept_staff_invitations() to authenticated;

comment on function public.prepare_staff_invitation(uuid, text, uuid, integer) is
  'Prepares audited staff invitation metadata for a permission-checked store manager. Auth email delivery is server-only.';
comment on function public.accept_staff_invitations() is
  'Atomically activates unexpired staff invitations matching the authenticated user email without accepting caller-supplied roles or stores.';

commit;
