import assert from "node:assert/strict"
import test from "node:test"

import {
  evaluateRouteAccess,
  membershipWithPermissions,
  publicAuthErrorMessage,
  routeRequirement,
  safeInternalPath,
} from "../src/lib/auth/policy.ts"
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

test("post-sign-in destinations reject external and protocol-relative redirects", () => {
  assert.equal(safeInternalPath("/manager/reports"), "/manager/reports")
  assert.equal(safeInternalPath("https://attacker.example"), "/home")
  assert.equal(safeInternalPath("//attacker.example"), "/home")
  assert.equal(safeInternalPath("/\\attacker.example"), "/home")
})

test("sign-in errors are useful without disclosing account existence", () => {
  assert.equal(
    publicAuthErrorMessage({ code: "invalid_credentials", message: "user does not exist" }),
    "We couldn't sign you in. Check your email and password, then try again."
  )
  assert.match(publicAuthErrorMessage({ code: "email_not_confirmed" }), /invitation setup/i)
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
