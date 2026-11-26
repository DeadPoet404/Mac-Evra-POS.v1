import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

import { routeRequirement } from "../src/lib/auth/policy.ts"
import {
  openingStockInspectionChecks,
  openingStockPendingInspectionChecks,
  openingStockPreservedInspectionChecks,
  parseConditionRecordInput,
  parseInspectionCompletionInput,
  preservedChecksIntact,
  summarizeInspection,
} from "../src/lib/opening-stock.ts"

function read(relativePath) {
  return readFileSync(path.resolve(relativePath), "utf8")
}

const MIGRATION = "supabase/migrations/20261126150000_inspection_completion_workflow.sql"

/** Exactly what the inspection photos evidence, as stored after receipt. */
const photoEvidence = {
  imei_confirmed_physical: true,
  identity_labels_match: true,
  activation_lock_cleared: true,
}

/** The five checks only a manager holding the handset can earn. */
const allPendingChecks = Object.fromEntries(
  openingStockPendingInspectionChecks.map((name) => [name, true])
)

const completedInspection = {
  ...photoEvidence,
  display_passed: true,
  cameras_passed: true,
  buttons_passed: true,
  connectivity_passed: true,
  charging_port_passed: true,
}

/* ------------------------------------------------------------------ *
 * Reading an inspection's progress
 * ------------------------------------------------------------------ */

test("a partially inspected unit reports the exact checks it still needs", () => {
  const progress = summarizeInspection(photoEvidence)
  assert.equal(progress.complete, false)
  assert.deepEqual([...progress.passed].sort(), [...openingStockPreservedInspectionChecks].sort())
  assert.deepEqual([...progress.pending].sort(), [...openingStockPendingInspectionChecks].sort())
})

test("only a literal true counts as a passed check", () => {
  // A stored `false`, a missing key, and a truthy string are all "not passed".
  // The database would reject the string outright, but the reader must not
  // silently treat it as passing if one ever appeared.
  const progress = summarizeInspection({
    ...photoEvidence,
    display_passed: false,
    cameras_passed: "yes",
    buttons_passed: 1,
  })
  assert.ok(progress.pending.includes("displayPassed"))
  assert.ok(progress.pending.includes("camerasPassed"))
  assert.ok(progress.pending.includes("buttonsPassed"))
  assert.equal(progress.complete, false)
})

test("a fully inspected unit reports complete", () => {
  const progress = summarizeInspection(completedInspection)
  assert.equal(progress.pending.length, 0)
  assert.equal(progress.complete, true)
  assert.equal(progress.passed.length, openingStockInspectionChecks.length)
})

test("a null or missing inspection document reads as fully pending, not complete", () => {
  for (const value of [null, undefined, {}]) {
    const progress = summarizeInspection(value)
    assert.equal(progress.complete, false)
    assert.equal(progress.passed.length, 0)
    assert.equal(progress.pending.length, openingStockInspectionChecks.length)
  }
})

/* ------------------------------------------------------------------ *
 * Requirement 3 — photo-supported evidence is never lost
 * ------------------------------------------------------------------ */

test("the three photo-supported checks are still intact after a completion", () => {
  assert.equal(preservedChecksIntact(photoEvidence), true)
  assert.equal(preservedChecksIntact(completedInspection), true)
})

test("a record that lost its photo evidence is detected", () => {
  for (const name of openingStockPreservedInspectionChecks) {
    const field = {
      imeiConfirmed: "imei_confirmed_physical",
      labelsMatch: "identity_labels_match",
      activationLockCleared: "activation_lock_cleared",
    }[name]
    const damaged = { ...completedInspection }
    delete damaged[field]
    assert.equal(preservedChecksIntact(damaged), false, `dropping ${field} must be detected`)
    assert.equal(preservedChecksIntact({ ...completedInspection, [field]: false }), false)
  }
})

test("the completion payload never contains a photo-supported check", () => {
  // A caller that tries to re-send the evidence is refused rather than quietly
  // filtered: silently dropping it would hide a client that believes it can
  // rewrite the record.
  for (const name of openingStockPreservedInspectionChecks) {
    assert.throws(
      () => parseInspectionCompletionInput({ ...allPendingChecks, [name]: true }, ""),
      /Only the pending physical checks/,
      `re-sending ${name} must be refused`
    )
  }
  // The valid payload contains only pending-check keys, so a merge can only add.
  const { checks } = parseInspectionCompletionInput(allPendingChecks, "")
  for (const name of openingStockPreservedInspectionChecks) {
    assert.equal(name in checks, false, `${name} must not appear in a valid payload`)
  }
})

/* ------------------------------------------------------------------ *
 * Requirement 2 — recording the five remaining checks
 * ------------------------------------------------------------------ */

test("only ticked checks are sent, so an unticked box is omitted not falsified", () => {
  const { checks } = parseInspectionCompletionInput(
    { displayPassed: true, camerasPassed: false, buttonsPassed: true },
    ""
  )
  assert.deepEqual(Object.keys(checks).sort(), ["buttons_passed", "display_passed"])
  assert.equal("cameras_passed" in checks, false, "an unticked check must be absent, not false")
  assert.ok(Object.values(checks).every((value) => value === true))
})

test("an empty or all-unticked selection is rejected rather than silently discarded", () => {
  for (const input of [{}, { displayPassed: false }, null, undefined]) {
    assert.throws(() => parseInspectionCompletionInput(input, ""), /at least one physical check/)
  }
})

test("a check outside the five pending ones cannot be supplied", () => {
  assert.throws(
    () => parseInspectionCompletionInput({ screenReplaced: true }, ""),
    /Only the pending physical checks/
  )
})

test("inspection notes are trimmed, bounded and control-character checked", () => {
  assert.equal(parseInspectionCompletionInput({ displayPassed: true }, "  clean screen  ").notes, "clean screen")
  assert.equal(parseInspectionCompletionInput({ displayPassed: true }, "   ").notes, null)
  assert.throws(
    () => parseInspectionCompletionInput({ displayPassed: true }, "x".repeat(501)),
    /too long/
  )
  assert.throws(
    () => parseInspectionCompletionInput({ displayPassed: true }, "bad\u0007note"),
    /unsupported character/
  )
})

test("completing every pending check yields the full eight-check contract", () => {
  const { checks } = parseInspectionCompletionInput(allPendingChecks, "")
  const merged = { ...photoEvidence, ...checks }
  assert.equal(summarizeInspection(merged).complete, true)
  assert.equal(Object.keys(merged).filter((key) => key !== "notes").length, 8)
})

/* ------------------------------------------------------------------ *
 * Requirement 2 — cosmetic condition
 * ------------------------------------------------------------------ */

test("a cosmetic condition must be one of the three assessed values", () => {
  for (const value of ["excellent", "good", "fair", " Good ", "EXCELLENT"]) {
    assert.doesNotThrow(() => parseConditionRecordInput(value), `"${value}" should parse`)
  }
  for (const value of ["", "   ", null, undefined, "mint", "like-new", "5/10"]) {
    assert.throws(
      () => parseConditionRecordInput(value),
      /Select the cosmetic condition/,
      `"${value}" must be rejected`
    )
  }
  assert.equal(parseConditionRecordInput(" Good "), "good")
})

/* ------------------------------------------------------------------ *
 * Requirement 8 — permissions
 * ------------------------------------------------------------------ */

test("both completion RPCs resolve the same manager permission gate activation uses", () => {
  const sql = read(MIGRATION)
  const bodies = sql.split("create or replace function")
  const complete = bodies.find((body) => body.includes("complete_opening_stock_inspection"))
  const condition = bodies.find((body) => body.includes("record_opening_stock_unit_condition"))
  assert.ok(complete && condition)

  for (const [label, body] of [["inspection", complete], ["condition", condition]]) {
    assert.match(
      body,
      /private\.opening_stock_actor_membership\(target_unit\.store_id, false\)/,
      `the ${label} RPC must use the shared manager gate`
    )
    assert.match(body, /active manager membership is required/, `the ${label} RPC must fail closed`)
  }

  // Neither RPC may bypass the gate by trusting a caller-supplied identity.
  for (const body of [complete, condition]) {
    assert.doesNotMatch(body, /p_store_id|p_user_id|p_membership_id/)
  }
})

test("the completion RPCs are not executable by anon and are granted to authenticated", () => {
  const sql = read(MIGRATION)
  assert.match(sql, /revoke all on function public\.complete_opening_stock_inspection\([^)]*\) from public, anon/)
  assert.match(sql, /revoke all on function public\.record_opening_stock_unit_condition\([^)]*\) from public, anon/)
  assert.match(sql, /grant execute on function public\.complete_opening_stock_inspection\([^)]*\) to authenticated/)
  assert.match(sql, /grant execute on function public\.record_opening_stock_unit_condition\([^)]*\) to authenticated/)
  assert.doesNotMatch(sql, /grant execute on function public\.(?:complete_opening_stock_inspection|record_opening_stock_unit_condition)[^;]* to anon/)
})

test("the manager workspace route still requires the manager permissions", () => {
  const requirement = routeRequirement("/manager/opening-stock")
  assert.ok(requirement, "the opening-stock route is protected")
  assert.ok(requirement.permissions.includes("access_manager_workspace"))
  assert.ok(requirement.permissions.includes("manage_inventory"))
})

test("every server action for the workflow routes through the permission-checking client", () => {
  const actions = read("src/app/manager/opening-stock/actions.ts")
  for (const name of ["completeInspectionInlineAction", "recordConditionInlineAction"]) {
    const start = actions.indexOf(`export async function ${name}`)
    assert.ok(start > -1, `${name} exists`)
    const body = actions.slice(start, actions.indexOf("\nexport async function", start + 1))
    assert.match(body, /await managerClient\(\)/, `${name} must call the permission-checked client`)
    assert.doesNotMatch(body, /createClient\(\)\s*$/, `${name} must not build its own client`)
  }
})

/* ------------------------------------------------------------------ *
 * Requirement 3 — the database cannot lose evidence either
 * ------------------------------------------------------------------ */

test("the update trigger only allows inspection to gain passing attestations", () => {
  const sql = read(MIGRATION)
  assert.match(sql, /inspection can only change on a staged unit/)
  assert.match(sql, /recorded inspection evidence cannot be removed or overwritten/)
  assert.match(sql, /only passing inspection checks can be added/)
  // Both columns must have been removed from the unconditional identity freeze.
  const freeze = sql.slice(sql.indexOf("if new.id is distinct from old.id"), sql.indexOf("-- An inspection may only ever gain"))
  assert.doesNotMatch(freeze, /new\.inspection is distinct/)
  assert.doesNotMatch(freeze, /new\.condition is distinct/)
})

test("cosmetic condition may only be filled in once, from null, while staged", () => {
  const sql = read(MIGRATION)
  assert.match(sql, /cosmetic condition can only be recorded once, while staged/)
  assert.match(sql, /old\.condition is null/)
})

test("the completion RPCs refuse anything that is not staged", () => {
  const sql = read(MIGRATION)
  assert.match(sql, /only staged units can be inspected/)
  assert.match(sql, /condition can only be recorded on a staged unit/)
})

/* ------------------------------------------------------------------ *
 * Requirement 4 — audit history
 * ------------------------------------------------------------------ */

test("a completion writes an audit event naming the actor and both check sets", () => {
  const sql = read(MIGRATION)
  const start = sql.indexOf("create or replace function public.complete_opening_stock_inspection")
  const body = sql.slice(start, sql.indexOf("create or replace function public.record_opening_stock_unit_condition"))
  assert.match(body, /'opening_stock\.inspection_completed'/)
  assert.match(body, /'recorded_checks'/)
  assert.match(body, /'preserved_checks'/)
  assert.match(body, /'inspection_ready_before'/)
  assert.match(body, /'inspection_ready_after'/)
  // The actor and timestamp travel with the row itself, not only the audit event.
  assert.match(body, /inspection_completed_by_user_id = caller_user_id/)
  assert.match(body, /inspection_completed_by_display_name = caller_display_name/)
  assert.match(body, /inspection_completed_at = observed_at/)
})

test("a condition record writes its own audit event", () => {
  const sql = read(MIGRATION)
  const body = sql.slice(sql.indexOf("create or replace function public.record_opening_stock_unit_condition"))
  assert.match(body, /'opening_stock\.unit_condition_recorded'/)
  assert.match(body, /'condition', normalized_condition/)
  assert.match(body, /private\.opening_stock_audit/)
})

test("the completer columns are constrained to a real member of the same store", () => {
  const sql = read(MIGRATION)
  assert.match(sql, /opening_stock_units_inspection_completer_fk/)
  assert.match(sql, /references public\.store_memberships\(id, store_id, user_id\)/)
  assert.match(sql, /opening_stock_units_inspection_completer_consistent/)
})

/* ------------------------------------------------------------------ *
 * Requirements 5 and 7 — incomplete inspections and activation rejection
 * ------------------------------------------------------------------ */

test("activation still depends on the unchanged eight-attestation contract", () => {
  const sql = read(MIGRATION)
  // The workflow must not redefine the activation contract itself.
  assert.doesNotMatch(sql, /create or replace function private\.is_valid_opening_stock_inspection/)
  // Nor may it write inventory or prices.
  assert.doesNotMatch(sql, /insert into public\.inventory_devices/)
  assert.doesNotMatch(sql, /insert into public\.store_inventory/)
  // No statement in this migration writes a price or activates a unit. The
  // trigger body only *inspects* `new.approved_price_pesewas` to keep its
  // existing activation-consistency rules, which is why the check is anchored
  // on assignment statements rather than on the column name.
  // Every UPDATE this migration issues must touch only inspection/condition
  // bookkeeping. A comparison like `new.status = 'activated'` inside the
  // trigger is not an assignment, so scan the update statements themselves.
  const updates = [...sql.matchAll(/update\s+public\.opening_stock_units\s+set([\s\S]*?);/gi)].map((m) => m[1])
  assert.ok(updates.length > 0, "the workflow issues its own update statements")
  for (const assignment of updates) {
    assert.doesNotMatch(assignment, /status\s*=/i, "no update may change the unit status")
    assert.doesNotMatch(assignment, /approved_price_pesewas/i, "no update may set a price")
    assert.doesNotMatch(assignment, /inventory_device_id|store_inventory_id/i, "no update may attach inventory")
  }
  // Nor may either new RPC accept a price argument.
  assert.doesNotMatch(sql, /complete_opening_stock_inspection\([^)]*price/)
  assert.doesNotMatch(sql, /record_opening_stock_unit_condition\([^)]*price/)
})

test("a unit missing any check, the condition, or the battery is not activatable", () => {
  const partial = summarizeInspection({ ...photoEvidence, display_passed: true })
  assert.equal(partial.complete, false, "a partial inspection must not read as complete")

  // The activation precondition mirrors the database's own guard order.
  const blockReason = (unit) => {
    if (!summarizeInspection(unit.inspection).complete) return "inspection"
    if (unit.condition === null) return "condition"
    if (unit.batteryHealth === null) return "battery"
    return null
  }
  assert.equal(blockReason({ inspection: partial && { ...photoEvidence }, condition: "good", batteryHealth: 90 }), "inspection")
  assert.equal(blockReason({ inspection: completedInspection, condition: null, batteryHealth: 90 }), "condition")
  assert.equal(blockReason({ inspection: completedInspection, condition: "good", batteryHealth: null }), "battery")
  assert.equal(blockReason({ inspection: completedInspection, condition: "good", batteryHealth: 90 }), null)
})

test("unrelated database constraints are not dropped or weakened by the workflow", () => {
  const sql = read(MIGRATION)
  // The only drops permitted are the two the earlier migration owns and the
  // view, which is recreated below them.
  const drops = [...sql.matchAll(/drop\s+(?:constraint|view|column|table)\s+(?!if exists)([a-z_."]+)/gi)].map((m) => m[1])
  for (const dropped of drops) {
    assert.ok(
      dropped === "public.opening_stock_units_view",
      `unexpected drop of ${dropped}`
    )
  }
  assert.match(sql, /create view public\.opening_stock_units_view/)
  assert.match(sql, /security_invoker = true/)
})

/* ------------------------------------------------------------------ *
 * Requirement 6 — battery health for unmeasured units
 * ------------------------------------------------------------------ */

test("the workflow reuses the existing, staged-only battery RPC", () => {
  const actions = read("src/app/manager/opening-stock/actions.ts")
  assert.match(actions, /rpc\("record_opening_stock_unit_battery_health"/)
  // The workflow must not introduce a second way to write a measurement.
  const sql = read(MIGRATION)
  assert.doesNotMatch(sql, /create or replace function public\.record_opening_stock_unit_battery_health/)
})
