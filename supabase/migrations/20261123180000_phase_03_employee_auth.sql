begin;

-- The raw invitation acceptance token is delivered only through email. The
-- database stores its SHA-256 digest so a leaked row cannot be used as a link.
alter table public.staff_invitations
  add column acceptance_token_hash bytea;

comment on column public.staff_invitations.acceptance_token_hash is
  'SHA-256 digest of the invitation-specific email acceptance token. Cleared after acceptance.';

-- Invitation metadata is prepared by an authenticated store access manager.
-- Supabase Auth email delivery remains a separate server-only operation.
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
  expires_at timestamptz,
  acceptance_token text,
  attempt_id uuid
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
  prepared_invitation_id uuid;
  prepared_expires_at timestamptz;
  preparation_result text;
  raw_acceptance_token text := encode(extensions.gen_random_bytes(32), 'hex');
  preparation_attempt_id uuid := gen_random_uuid();
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
  set status = 'expired',
      acceptance_token_hash = null
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

  prepared_expires_at := observed_at + make_interval(hours => p_expires_in_hours);

  if found then
    if existing_invitation.role_id <> p_role_id then
      raise exception using errcode = '23505', message = 'a pending invitation already exists with another role';
    end if;

    prepared_invitation_id := existing_invitation.id;
    preparation_result := 'reprepared';

    -- Every retry rotates the bearer token and records the current actor. An
    -- older email can therefore never consume a later delivery attempt.
    update public.staff_invitations
    set invited_by = caller_user_id,
        expires_at = prepared_expires_at,
        acceptance_token_hash = extensions.digest(raw_acceptance_token, 'sha256')
    where id = prepared_invitation_id;
  else
    prepared_invitation_id := gen_random_uuid();
    preparation_result := 'prepared';

    insert into public.staff_invitations (
      id,
      store_id,
      email,
      role_id,
      status,
      invited_by,
      expires_at,
      acceptance_token_hash
    )
    values (
      prepared_invitation_id,
      p_store_id,
      normalized_email,
      p_role_id,
      'pending',
      caller_user_id,
      prepared_expires_at,
      extensions.digest(raw_acceptance_token, 'sha256')
    );
  end if;

  insert into public.audit_events (
    id,
    store_id,
    actor_user_id,
    actor_membership_id,
    action,
    entity_type,
    entity_id,
    request_id,
    event_data,
    occurred_at
  )
  values (
    preparation_attempt_id,
    p_store_id,
    caller_user_id,
    caller_membership_id,
    'staff.invitation_prepared',
    'staff_invitation',
    prepared_invitation_id,
    preparation_attempt_id::text,
    jsonb_build_object(
      'email', normalized_email,
      'role_id', p_role_id,
      'result', preparation_result
    ),
    observed_at
  );

  return query
    select
      preparation_result,
      prepared_invitation_id,
      normalized_email,
      prepared_expires_at,
      raw_acceptance_token,
      preparation_attempt_id;
end;
$$;

-- Records the provider result for exactly one audited preparation attempt.
-- This remains callable after a delivery failure and is idempotent per attempt.
create or replace function public.record_staff_invitation_delivery(
  p_invitation_id uuid,
  p_attempt_id uuid,
  p_channel text,
  p_outcome text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  preparation_event public.audit_events%rowtype;
  existing_delivery_id uuid;
  delivery_event_id uuid := gen_random_uuid();
begin
  if caller_user_id is null then
    raise exception using errcode = '28000', message = 'authentication required';
  end if;

  if p_channel not in ('auth_invite', 'existing_account_magic_link')
    or p_outcome not in ('sent', 'failed') then
    raise exception using errcode = '22023', message = 'valid invitation delivery result required';
  end if;

  select event.*
  into preparation_event
  from public.audit_events event
  where event.id = p_attempt_id
    and event.entity_id = p_invitation_id
    and event.action = 'staff.invitation_prepared'
    and event.actor_user_id = caller_user_id;

  if not found then
    raise exception using errcode = '42501', message = 'matching invitation preparation attempt required';
  end if;

  select event.id
  into existing_delivery_id
  from public.audit_events event
  where event.action = 'staff.invitation_delivery'
    and event.request_id = p_attempt_id::text;

  if found then
    return existing_delivery_id;
  end if;

  insert into public.audit_events (
    id,
    store_id,
    actor_user_id,
    actor_membership_id,
    action,
    entity_type,
    entity_id,
    request_id,
    event_data,
    occurred_at
  )
  values (
    delivery_event_id,
    preparation_event.store_id,
    caller_user_id,
    preparation_event.actor_membership_id,
    'staff.invitation_delivery',
    'staff_invitation',
    p_invitation_id,
    p_attempt_id::text,
    jsonb_build_object('channel', p_channel, 'outcome', p_outcome),
    clock_timestamp()
  );

  return delivery_event_id;
end;
$$;

-- Accepts one invitation identified by the email link's database-backed bearer
-- token. The token identifies no store or role by itself; those values still
-- come exclusively from the locked invitation row.
create or replace function public.accept_staff_invitation(
  p_invitation_id uuid,
  p_acceptance_token text
)
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
  caller_email_confirmed_at timestamptz;
  profile_status text;
  invitation_record public.staff_invitations%rowtype;
  membership_record public.store_memberships%rowtype;
  accepted_membership_id uuid;
  store_status text;
  observed_at timestamptz := clock_timestamp();
begin
  if caller_user_id is null then
    raise exception using errcode = '28000', message = 'authentication required';
  end if;

  -- Lock Auth identity and profile together so email changes or suspension
  -- cannot commit between verification and membership activation.
  select lower(auth_user.email), auth_user.email_confirmed_at, profile.status
  into caller_email, caller_email_confirmed_at, profile_status
  from auth.users auth_user
  join public.profiles profile on profile.id = auth_user.id
  where auth_user.id = caller_user_id
  for share of auth_user, profile;

  if caller_email is null
    or caller_email_confirmed_at is null
    or profile_status <> 'active' then
    raise exception using errcode = '42501', message = 'verified active staff profile required';
  end if;

  if p_acceptance_token is null or p_acceptance_token !~ '^[0-9a-fA-F]{64}$' then
    raise exception using errcode = '42501', message = 'valid invitation acceptance required';
  end if;

  select invitation.*
  into invitation_record
  from public.staff_invitations invitation
  where invitation.id = p_invitation_id
  for update;

  if not found
    or invitation_record.status <> 'pending'
    or invitation_record.email <> caller_email
    or invitation_record.acceptance_token_hash is null
    or invitation_record.acceptance_token_hash
      <> extensions.digest(lower(p_acceptance_token), 'sha256') then
    raise exception using errcode = '42501', message = 'valid invitation acceptance required';
  end if;

  if invitation_record.expires_at <= observed_at then
    update public.staff_invitations
    set status = 'expired',
        acceptance_token_hash = null
    where id = invitation_record.id;
    return;
  end if;

  -- Lock the store status through acceptance so deactivation serializes before
  -- or after this transaction rather than racing the membership insert.
  select store_record.status
  into store_status
  from public.stores store_record
  where store_record.id = invitation_record.store_id
  for share;

  if store_status <> 'active' then
    raise exception using errcode = '42501', message = 'active invitation store required';
  end if;

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
      accepted_at = observed_at,
      acceptance_token_hash = null
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
end;
$$;

revoke all on function public.prepare_staff_invitation(uuid, text, uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.record_staff_invitation_delivery(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.accept_staff_invitation(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.prepare_staff_invitation(uuid, text, uuid, integer) to authenticated;
grant execute on function public.record_staff_invitation_delivery(uuid, uuid, text, text) to authenticated;
grant execute on function public.accept_staff_invitation(uuid, text) to authenticated;

comment on function public.prepare_staff_invitation(uuid, text, uuid, integer) is
  'Prepares an audited invitation-specific bearer token for a permission-checked store manager. Auth email delivery is server-only.';
comment on function public.record_staff_invitation_delivery(uuid, uuid, text, text) is
  'Appends one provider delivery result to its authenticated invitation preparation attempt.';
comment on function public.accept_staff_invitation(uuid, text) is
  'Atomically accepts one verified-email invitation using its database-backed bearer token and locked profile/store state.';

commit;
