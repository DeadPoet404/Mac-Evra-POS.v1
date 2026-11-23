export const permissionCodes = [
  "access_employee_workspace",
  "create_sales",
  "reserve_inventory",
  "process_trade_ins",
  "view_own_performance",
  "access_manager_workspace",
  "manage_inventory",
  "manage_employee_access",
  "review_approvals",
  "approve_discounts",
  "approve_trade_ins",
  "approve_refunds",
  "approve_cancellations",
  "approve_inventory_adjustments",
  "view_reports",
  "manage_store_settings",
  "view_audit_events",
  "manage_roles",
] as const

export type PermissionCode = (typeof permissionCodes)[number]

export type AuthorizedMembership = {
  id: string
  storeId: string
  storeName: string
  roleCode: string
  roleName: string
  permissions: readonly string[]
}

export type AccessSnapshot = {
  state: "anonymous" | "inactive" | "active"
  userId: string | null
  email: string | null
  displayName: string | null
  memberships: readonly AuthorizedMembership[]
}

export type RouteRequirement = {
  protected: boolean
  permissions: readonly PermissionCode[]
}

export type AccessDecision =
  | { kind: "allow" }
  | { kind: "redirect"; location: string; reason: "sign-in" | "inactive" | "forbidden" | "already-signed-in" }

const publicPrefixes = ["/auth/"]

const protectedRoutes: Array<{
  prefix: string
  permissions: readonly PermissionCode[]
}> = [
  { prefix: "/manager/settings", permissions: ["access_manager_workspace", "manage_store_settings"] },
  { prefix: "/manager/employees", permissions: ["access_manager_workspace", "manage_employee_access"] },
  { prefix: "/manager/inventory", permissions: ["access_manager_workspace", "manage_inventory"] },
  { prefix: "/manager/approvals", permissions: ["access_manager_workspace", "review_approvals"] },
  { prefix: "/manager/reports", permissions: ["access_manager_workspace", "view_reports"] },
  { prefix: "/manager/sales", permissions: ["access_manager_workspace"] },
  { prefix: "/manager", permissions: ["access_manager_workspace"] },
  { prefix: "/new-sale", permissions: ["access_employee_workspace", "create_sales"] },
  { prefix: "/trade-in", permissions: ["access_employee_workspace", "process_trade_ins"] },
  { prefix: "/inventory", permissions: ["access_employee_workspace"] },
  { prefix: "/home", permissions: ["access_employee_workspace"] },
]

function pathMatches(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

export function routeRequirement(pathname: string): RouteRequirement {
  if (publicPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return { protected: false, permissions: [] }
  }

  const match = protectedRoutes.find((route) => pathMatches(pathname, route.prefix))
  return match
    ? { protected: true, permissions: match.permissions }
    : { protected: false, permissions: [] }
}

export function membershipWithPermissions(
  access: AccessSnapshot,
  permissions: readonly PermissionCode[],
  storeId?: string
): AuthorizedMembership | null {
  if (access.state !== "active") return null

  return (
    access.memberships.find(
      (membership) =>
        (!storeId || membership.storeId === storeId) &&
        permissions.every((permission) => membership.permissions.includes(permission))
    ) ?? null
  )
}

export function evaluateRouteAccess(pathname: string, access: AccessSnapshot): AccessDecision {
  const requirement = routeRequirement(pathname)

  if (pathname === "/" && membershipWithPermissions(access, ["access_employee_workspace"])) {
    return { kind: "redirect", location: "/home", reason: "already-signed-in" }
  }

  if (!requirement.protected) return { kind: "allow" }

  if (access.state === "anonymous") {
    return {
      kind: "redirect",
      location: `/?next=${encodeURIComponent(pathname)}`,
      reason: "sign-in",
    }
  }

  if (access.state !== "active") {
    return { kind: "redirect", location: "/?error=inactive", reason: "inactive" }
  }

  if (!membershipWithPermissions(access, requirement.permissions)) {
    return { kind: "redirect", location: "/home?notice=access-denied", reason: "forbidden" }
  }

  return { kind: "allow" }
}

export function safeInternalPath(value: FormDataEntryValue | string | null | undefined, fallback = "/home") {
  if (typeof value !== "string") return fallback
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback

  try {
    const parsed = new URL(value, "https://mac-evra.invalid")
    if (parsed.origin !== "https://mac-evra.invalid") return fallback
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return fallback
  }
}

export function publicAuthErrorMessage(error: unknown) {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : ""

  if (code === "email_not_confirmed") {
    return "This account has not completed its secure invitation setup. Contact an administrator."
  }

  return "We couldn't sign you in. Check your email and password, then try again."
}
