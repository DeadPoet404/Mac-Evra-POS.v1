import assert from "node:assert/strict"
import test from "node:test"

import {
  authorizedPostSignInPath,
  defaultWorkspacePath,
  evaluateRouteAccess,
  loginErrorMessage,
  membershipWithPermissions,
  publicAuthErrorMessage,
  routeRequirement,
  safeInternalPath,
} from "../src/lib/auth/policy.ts"
import {
  invitationConfirmationUrl,
  isExistingAuthUserError,
  parseInvitationConfirmation,
} from "../src/lib/auth/invitation.ts"
import { normalizeStaffInvitationInput } from "../src/lib/auth/provisioning-policy.ts"

const anonymous = {
  state: "anonymous",
  userId: null,
  email: null,
  displayName: null,
  memberships: [],
}

function activeAccess(permissions) {
  return {
    state: "active",
    userId: "10000000-0000-4000-8000-000000000001",
    email: "staff@example.test",
    displayName: "Staff Member",
    memberships: [
      {
        id: "20000000-0000-4000-8000-000000000001",
        storeId: "00000000-0000-4000-8000-000000000001",
        storeName: "Mac Evra Test Store",
        roleCode: "test",
        roleName: "Test role",
        permissions,
      },
    ],
  }
}

test("anonymous sessions are redirected away from every protected workspace", () => {
  for (const path of ["/home", "/inventory", "/new-sale/payment", "/trade-in", "/manager/reports"]) {
    const decision = evaluateRouteAccess(path, anonymous)
    assert.equal(decision.kind, "redirect")
    assert.equal(decision.reason, "sign-in")
    assert.match(decision.location, /^\/\?next=/)
  }
})

test("an active employee can use employee routes but cannot open manager routes", () => {
  const employee = activeAccess([
    "access_employee_workspace",
    "create_sales",
    "process_trade_ins",
    "reserve_inventory",
  ])

  assert.deepEqual(evaluateRouteAccess("/home", employee), { kind: "allow" })
  assert.deepEqual(evaluateRouteAccess("/new-sale/checkout", employee), { kind: "allow" })
  assert.equal(evaluateRouteAccess("/manager", employee).reason, "forbidden")
})

test("manager route permissions are enforced independently", () => {
  const managerWithoutReports = activeAccess([
    "access_employee_workspace",
    "access_manager_workspace",
    "manage_inventory",
    "manage_employee_access",
  ])

  assert.deepEqual(evaluateRouteAccess("/manager/inventory", managerWithoutReports), { kind: "allow" })
  assert.equal(evaluateRouteAccess("/manager/reports", managerWithoutReports).reason, "forbidden")
  assert.equal(routeRequirement("/manager/settings").permissions.at(-1), "manage_store_settings")
})

test("a manager-only membership signs in and lands in the manager workspace", () => {
  const managerOnly = activeAccess(["access_manager_workspace", "manage_inventory"])

  assert.equal(defaultWorkspacePath(managerOnly), "/manager")
  assert.equal(authorizedPostSignInPath(managerOnly, "/home"), "/manager")
  assert.deepEqual(evaluateRouteAccess("/", managerOnly), {
    kind: "redirect",
    location: "/manager",
    reason: "already-signed-in",
  })
})

test("denied employee permission never creates a home redirect loop", () => {
  const managerOnly = activeAccess(["access_manager_workspace"])
  assert.deepEqual(evaluateRouteAccess("/home", managerOnly), {
    kind: "redirect",
    location: "/manager?notice=access-denied",
    reason: "forbidden",
  })

  const noWorkspace = activeAccess([])
  assert.deepEqual(evaluateRouteAccess("/home", noWorkspace), {
    kind: "redirect",
    location: "/?error=access-denied",
    reason: "forbidden",
  })
})

test("inactive and suspended memberships fail closed even with stale permission names", () => {
  const inactive = {
    ...activeAccess(["access_employee_workspace", "access_manager_workspace"]),
    state: "inactive",
    memberships: [],
  }

  assert.equal(evaluateRouteAccess("/home", inactive).reason, "inactive")
  assert.equal(evaluateRouteAccess("/manager", inactive).reason, "inactive")
  assert.equal(membershipWithPermissions(inactive, ["access_employee_workspace"]), null)
})

test("a denied effective permission blocks access even when the role would normally grant it", () => {
  const overriddenManager = activeAccess(["access_employee_workspace", "access_manager_workspace"])
  assert.equal(evaluateRouteAccess("/manager/employees", overriddenManager).reason, "forbidden")
})

test("an already authenticated employee leaves the sign-in route", () => {
  const employee = activeAccess(["access_employee_workspace"])
  assert.deepEqual(evaluateRouteAccess("/", employee), {
    kind: "redirect",
    location: "/home",
    reason: "already-signed-in",
  })
})

test("post-sign-in destinations reject raw, normalized, and encoded external redirects", () => {
  assert.equal(safeInternalPath("/manager/reports"), "/manager/reports")
  assert.equal(safeInternalPath("https://attacker.example"), "/home")
  assert.equal(safeInternalPath("//attacker.example"), "/home")
  assert.equal(safeInternalPath("/.//attacker.example"), "/home")
  assert.equal(safeInternalPath("/%2f%2fattacker.example"), "/home")
  assert.equal(safeInternalPath("/\\attacker.example"), "/home")
  assert.equal(safeInternalPath("/%5cattacker.example"), "/home")
})

test("post-sign-in paths must also be authorized for the resolved account", () => {
  const employee = activeAccess(["access_employee_workspace"])
  assert.equal(authorizedPostSignInPath(employee, "/manager"), "/home")
  assert.equal(authorizedPostSignInPath(employee, "/inventory?query=iphone"), "/inventory?query=iphone")
})

test("sign-in errors are useful without disclosing account existence", () => {
  assert.equal(
    publicAuthErrorMessage({ code: "invalid_credentials", message: "user does not exist" }),
    "We couldn't sign you in. Check your email and password, then try again."
  )
  assert.match(publicAuthErrorMessage({ code: "email_not_confirmed" }), /invitation setup/i)
})

test("crafted login error keys never return inherited objects or functions", () => {
  assert.equal(loginErrorMessage("inactive"), "Your profile, store, or membership is inactive. Contact an administrator.")
  assert.equal(loginErrorMessage("constructor"), undefined)
  assert.equal(loginErrorMessage("__proto__"), undefined)
  assert.equal(loginErrorMessage(["inactive"]), undefined)
})

test("invitation confirmation URLs bind one database invitation without role metadata", () => {
  const invitationId = "30000000-0000-4000-8000-000000000001"
  const acceptanceToken = "a".repeat(64)
  const redirect = invitationConfirmationUrl("https://pos.example.test/base", invitationId, acceptanceToken)
  const url = new URL(redirect)

  assert.equal(url.pathname, "/auth/confirm")
  assert.equal(url.searchParams.get("invitation_id"), invitationId)
  assert.equal(url.searchParams.get("acceptance_token"), acceptanceToken)
  assert.equal(url.searchParams.has("store_id"), false)
  assert.equal(url.searchParams.has("role_id"), false)

  url.searchParams.set("token_hash", "supabase-token-hash")
  url.searchParams.set("type", "invite")
  assert.deepEqual(parseInvitationConfirmation(url.searchParams), {
    invitationId,
    acceptanceToken,
    tokenHash: "supabase-token-hash",
    type: "invite",
  })
})

test("confirmation parsing rejects missing, malformed, and unrelated OTP links", () => {
  const params = new URLSearchParams({
    invitation_id: "30000000-0000-4000-8000-000000000001",
    acceptance_token: "b".repeat(64),
    token_hash: "token",
    type: "recovery",
  })
  assert.equal(parseInvitationConfirmation(params), null)
  params.set("type", "magiclink")
  params.set("acceptance_token", "editable-metadata-is-not-authority")
  assert.equal(parseInvitationConfirmation(params), null)
})

test("existing Auth account errors are handled as a separate delivery path", () => {
  assert.equal(isExistingAuthUserError({ code: "email_exists", status: 422 }), true)
  assert.equal(isExistingAuthUserError({ code: "user_already_exists", status: 422 }), true)
  assert.equal(isExistingAuthUserError({ status: 422, message: "User has already been registered" }), true)
  assert.equal(isExistingAuthUserError({ code: "smtp_failed", status: 500 }), false)
})

test("staff invitation input is normalized and strictly bounded", () => {
  const normalized = normalizeStaffInvitationInput({
    storeId: "00000000-0000-4000-8000-000000000001",
    roleId: "00000000-0000-4000-8000-000000000101",
    email: "  New.Employee@Example.COM ",
  })

  assert.equal(normalized.email, "new.employee@example.com")
  assert.equal(normalized.expiresInHours, 72)
  assert.throws(
    () => normalizeStaffInvitationInput({ ...normalized, expiresInHours: 169 }),
    /between 1 and 168/
  )
})
