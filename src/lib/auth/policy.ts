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
const applicationOrigin = "https://mac-evra.invalid"

const protectedRoutes: Array<{
  prefix: string
  permissions: readonly PermissionCode[]
}> = [
  { prefix: "/manager/settings", permissions: ["access_manager_workspace", "manage_store_settings"] },
  { prefix: "/manager/employees", permissions: ["access_manager_workspace", "manage_employee_access"] },
  { prefix: "/manager/inventory", permissions: ["access_manager_workspace", "manage_inventory"] },
  { prefix: "/manager/opening-stock", permissions: ["access_manager_workspace", "manage_inventory"] },
  { prefix: "/manager/approvals", permissions: ["access_manager_workspace", "review_approvals"] },
  { prefix: "/manager/reports", permissions: ["access_manager_workspace", "view_reports"] },
  { prefix: "/manager/sales", permissions: ["access_manager_workspace"] },
  { prefix: "/manager", permissions: ["access_manager_workspace"] },
  { prefix: "/new-sale", permissions: ["access_employee_workspace", "create_sales"] },
  { prefix: "/trade-in", permissions: ["access_employee_workspace", "process_trade_ins"] },
  { prefix: "/inventory", permissions: ["access_employee_workspace"] },
  { prefix: "/home", permissions: ["access_employee_workspace"] },
]

const loginErrorMessages = new Map<string, string>([
  ["inactive", "Your profile, store, or membership is inactive. Contact an administrator."],
  ["access-denied", "Your account does not have access to an application workspace."],
  ["unavailable", "Access could not be checked. Try signing in again shortly."],
  ["invalid-invitation", "This invitation link is invalid or has expired. Request a new invitation."],
])

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

export function defaultWorkspacePath(access: AccessSnapshot): "/home" | "/manager" | null {
  if (membershipWithPermissions(access, ["access_employee_workspace"])) return "/home"
  if (membershipWithPermissions(access, ["access_manager_workspace"])) return "/manager"
  return null
}

export function evaluateRouteAccess(pathname: string, access: AccessSnapshot): AccessDecision {
  const requirement = routeRequirement(pathname)
  const defaultWorkspace = defaultWorkspacePath(access)

  if (pathname === "/" && defaultWorkspace) {
    return { kind: "redirect", location: defaultWorkspace, reason: "already-signed-in" }
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
    const fallback = defaultWorkspace && defaultWorkspace !== pathname
      ? `${defaultWorkspace}?notice=access-denied`
      : "/?error=access-denied"
    return { kind: "redirect", location: fallback, reason: "forbidden" }
  }

  return { kind: "allow" }
}

export function safeInternalPath(value: FormDataEntryValue | string | null | undefined, fallback = "/home") {
  if (typeof value !== "string") return fallback
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback

  try {
    const parsed = new URL(value, applicationOrigin)
    if (parsed.origin !== applicationOrigin) return fallback

    // URL parsing normalizes dot segments before returning pathname. Validate
    // the normalized value as well as encoded separators so inputs such as
    // `/.//evil.example` cannot become a protocol-relative redirect target.
    if (
      !parsed.pathname.startsWith("/") ||
      parsed.pathname.startsWith("//") ||
      parsed.pathname.includes("\\") ||
      /%(?:2f|5c)/i.test(parsed.pathname)
    ) {
      return fallback
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return fallback
  }
}

export function authorizedPostSignInPath(
  access: AccessSnapshot,
  requested: FormDataEntryValue | string | null | undefined
) {
  const fallback = defaultWorkspacePath(access)
  if (!fallback) return null

  const candidate = safeInternalPath(requested, fallback)
  const pathname = new URL(candidate, applicationOrigin).pathname
  const requirement = routeRequirement(pathname)

  if (!requirement.protected || !membershipWithPermissions(access, requirement.permissions)) {
    return fallback
  }

  return candidate
}

export function loginErrorMessage(value: unknown) {
  return typeof value === "string" ? loginErrorMessages.get(value) : undefined
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
