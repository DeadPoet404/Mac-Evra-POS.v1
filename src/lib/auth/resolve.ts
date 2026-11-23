import type { SupabaseClient, User } from "@supabase/supabase-js"

import type { AccessSnapshot, AuthorizedMembership } from "@/lib/auth/policy"

export const anonymousAccess: AccessSnapshot = {
  state: "anonymous",
  userId: null,
  email: null,
  displayName: null,
  memberships: [],
}

type ProfileRow = {
  id: string
  display_name: string
  status: string
}

type MembershipRow = {
  id: string
  store_id: string
  role_id: string
  status: string
}

type StoreRow = {
  id: string
  name: string
  status: string
}

type RoleRow = {
  id: string
  code: string
  name: string
}

type PermissionRow = {
  id: string
  code: string
}

type RolePermissionRow = {
  role_id: string
  permission_id: string
}

type PermissionOverrideRow = {
  membership_id: string
  permission_id: string
  allowed: boolean
}

function unique(values: string[]) {
  return [...new Set(values)]
}

function inactiveAccess(user: User, displayName: string | null): AccessSnapshot {
  return {
    state: "inactive",
    userId: user.id,
    email: user.email ?? null,
    displayName,
    memberships: [],
  }
}

/**
 * Resolves application access through the caller's own RLS-scoped client.
 * Role and permission values are read from trusted database records and never
 * from form data, user metadata, or JWT custom claims.
 */
export async function resolveAccessForUser(
  supabase: SupabaseClient,
  user: User
): Promise<AccessSnapshot> {
  const { data: profileValue, error: profileError } = await supabase
    .from("profiles")
    .select("id, display_name, status")
    .eq("id", user.id)
    .maybeSingle()

  if (profileError) throw new Error("Unable to resolve employee profile access.")

  const profile = profileValue as ProfileRow | null
  if (!profile || profile.status !== "active") {
    return inactiveAccess(user, profile?.display_name ?? null)
  }

  const { data: membershipValues, error: membershipsError } = await supabase
    .from("store_memberships")
    .select("id, store_id, role_id, status")
    .eq("user_id", user.id)

  if (membershipsError) throw new Error("Unable to resolve employee store access.")

  const memberships = (membershipValues ?? []) as MembershipRow[]
  const activeCandidates = memberships.filter((membership) => membership.status === "active")
  if (activeCandidates.length === 0) return inactiveAccess(user, profile.display_name)

  const storeIds = unique(activeCandidates.map((membership) => membership.store_id))
  const roleIds = unique(activeCandidates.map((membership) => membership.role_id))
  const membershipIds = activeCandidates.map((membership) => membership.id)

  const [storesResult, rolesResult, rolePermissionsResult, permissionsResult, overridesResult] =
    await Promise.all([
      supabase.from("stores").select("id, name, status").in("id", storeIds),
      supabase.from("roles").select("id, code, name").in("id", roleIds),
      supabase.from("role_permissions").select("role_id, permission_id").in("role_id", roleIds),
      supabase.from("permissions").select("id, code"),
      supabase
        .from("membership_permission_overrides")
        .select("membership_id, permission_id, allowed")
        .in("membership_id", membershipIds),
    ])

  if (
    storesResult.error ||
    rolesResult.error ||
    rolePermissionsResult.error ||
    permissionsResult.error ||
    overridesResult.error
  ) {
    throw new Error("Unable to resolve employee permissions.")
  }

  const stores = (storesResult.data ?? []) as StoreRow[]
  const roles = (rolesResult.data ?? []) as RoleRow[]
  const rolePermissions = (rolePermissionsResult.data ?? []) as RolePermissionRow[]
  const permissions = (permissionsResult.data ?? []) as PermissionRow[]
  const overrides = (overridesResult.data ?? []) as PermissionOverrideRow[]

  const storesById = new Map(stores.filter((store) => store.status === "active").map((store) => [store.id, store]))
  const rolesById = new Map(roles.map((role) => [role.id, role]))
  const permissionCodesById = new Map(permissions.map((permission) => [permission.id, permission.code]))
  const rolePermissionIds = new Map<string, Set<string>>()

  for (const row of rolePermissions) {
    const permissionIds = rolePermissionIds.get(row.role_id) ?? new Set<string>()
    permissionIds.add(row.permission_id)
    rolePermissionIds.set(row.role_id, permissionIds)
  }

  const authorizedMemberships: AuthorizedMembership[] = []

  for (const membership of activeCandidates) {
    const store = storesById.get(membership.store_id)
    const role = rolesById.get(membership.role_id)
    if (!store || !role) continue

    const effectivePermissionIds = new Set(rolePermissionIds.get(role.id) ?? [])
    for (const override of overrides) {
      if (override.membership_id !== membership.id) continue
      if (override.allowed) effectivePermissionIds.add(override.permission_id)
      else effectivePermissionIds.delete(override.permission_id)
    }

    authorizedMemberships.push({
      id: membership.id,
      storeId: store.id,
      storeName: store.name,
      roleCode: role.code,
      roleName: role.name,
      permissions: [...effectivePermissionIds]
        .map((permissionId) => permissionCodesById.get(permissionId))
        .filter((code): code is string => Boolean(code))
        .sort(),
    })
  }

  if (authorizedMemberships.length === 0) return inactiveAccess(user, profile.display_name)

  return {
    state: "active",
    userId: user.id,
    email: user.email ?? null,
    displayName: profile.display_name,
    memberships: authorizedMemberships,
  }
}

export async function resolveAccess(supabase: SupabaseClient): Promise<AccessSnapshot> {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return anonymousAccess
  return resolveAccessForUser(supabase, data.user)
}
