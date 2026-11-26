import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

import { openingStockInspectionChecks, parseBatteryHealthRecordInput, parseOptionalBatteryHealth } from "../src/lib/opening-stock.ts"
import {
  deviceDraftToRpcPayload,
  emptyDeviceEntry,
  nextDeviceEntry,
  validateDeviceEntry,
} from "../src/lib/opening-stock-workspace.ts"

const checks = openingStockInspectionChecks.map((check) => ({ name: check.name, label: check.label }))
const lineId = "11111111-1111-4111-8111-111111111111"

const measuredDevice = {
  invoiceLineId: lineId,
  imei: "860000000000017",
  colour: "Green",
  condition: "good",
  batteryHealth: "87",
  inspectionNotes: "",
  checks: Object.fromEntries(openingStockInspectionChecks.map((check) => [check.name, true])),
}

const unmeasuredDevice = { ...measuredDevice, batteryHealth: "" }

/* ------------------------------------------------------------------ *
 * Reading an absent measurement
 * ------------------------------------------------------------------ */

test("an absent battery reading parses as unknown rather than zero", () => {
  for (const blank of ["", "   ", null, undefined]) {
    assert.equal(parseOptionalBatteryHealth(blank), null, `"${blank}" must be unknown, not 0`)
  }
})

test("a supplied battery reading is still range-checked", () => {
  assert.equal(parseOptionalBatteryHealth("100"), 100)
  assert.equal(parseOptionalBatteryHealth("1"), 1)
  assert.equal(parseOptionalBatteryHealth(" 87 "), 87)
  assert.throws(() => parseOptionalBatteryHealth("0"), /battery health/)
  assert.throws(() => parseOptionalBatteryHealth("101"), /battery health/)
  assert.throws(() => parseOptionalBatteryHealth("85.5"), /battery health/)
  assert.throws(() => parseOptionalBatteryHealth("n/a"), /battery health/)
})

/* ------------------------------------------------------------------ *
 * Staging an unmeasured device
 * ------------------------------------------------------------------ */

test("an unmeasured device can be staged but its payload says nothing about capacity", () => {
  assert.deepEqual(validateDeviceEntry(unmeasuredDevice, { existingImeis: [], inspectionChecks: checks }), {})
  const [payload] = deviceDraftToRpcPayload(unmeasuredDevice, openingStockInspectionChecks)
  assert.equal(payload.battery_health, null)
  assert.equal("battery_health" in payload, true, "the key is present so the RPC can distinguish absent from zero")
})

test("a measured device is unchanged by the unknown-battery path", () => {
  const [payload] = deviceDraftToRpcPayload(measuredDevice, openingStockInspectionChecks)
  assert.equal(payload.battery_health, 87)
})

test("no inspection attestation is waived for an unmeasured device", () => {
  for (const check of openingStockInspectionChecks) {
    const partial = {
      ...unmeasuredDevice,
      checks: { ...unmeasuredDevice.checks, [check.name]: false },
    }
    const errors = validateDeviceEntry(partial, { existingImeis: [], inspectionChecks: checks })
    assert.match(errors.inspection, /1 outstanding/, `a missing ${check.name} must still block receiving`)
  }
})

test("an unmeasured device still needs a real IMEI, colour and condition", () => {
  const context = { existingImeis: [], inspectionChecks: checks }
  assert.ok(validateDeviceEntry({ ...unmeasuredDevice, imei: "" }, context).imei)
  assert.ok(validateDeviceEntry({ ...unmeasuredDevice, colour: "" }, context).colour)
  assert.ok(validateDeviceEntry({ ...unmeasuredDevice, condition: "" }, context).condition)
})

test("every new device row starts unmeasured and uninspected", () => {
  assert.equal(emptyDeviceEntry(lineId).batteryHealth, "")
  assert.equal(nextDeviceEntry(measuredDevice, lineId).batteryHealth, "", "a measurement never carries over")
})

/* ------------------------------------------------------------------ *
 * Recording the measurement
 * ------------------------------------------------------------------ */

test("a battery measurement is recorded against one staged unit with a valid percentage", () => {
  const form = new Map([
    ["unitId", "22222222-2222-4222-8222-222222222222"],
    ["batteryHealth", "91"],
  ])
  const parsed = parseBatteryHealthRecordInput({ get: (name) => form.get(name) ?? null })
  assert.equal(parsed.unitId, "22222222-2222-4222-8222-222222222222")
  assert.equal(parsed.batteryHealth, 91)
})

test("recording a measurement rejects a missing, non-integer or out-of-range value", () => {
  const build = (batteryHealth) => ({
    get: (name) => (name === "unitId" ? "22222222-2222-4222-8222-222222222222" : batteryHealth),
  })
  assert.throws(() => parseBatteryHealthRecordInput(build("")), /battery health/)
  assert.throws(() => parseBatteryHealthRecordInput(build("0")), /battery health/)
  assert.throws(() => parseBatteryHealthRecordInput(build("101")), /battery health/)
  assert.throws(() => parseBatteryHealthRecordInput(build("abc")), /battery health/)
})

test("recording a measurement requires a real unit identifier", () => {
  const build = (unitId) => ({
    get: (name) => (name === "unitId" ? unitId : "90"),
  })
  assert.throws(() => parseBatteryHealthRecordInput(build("not-a-uuid")), /staged unit/)
  assert.throws(() => parseBatteryHealthRecordInput(build("")), /staged unit/)
})

/* ------------------------------------------------------------------ *
 * The safeguards the feature must not have weakened
 * ------------------------------------------------------------------ */

const migration = readFileSync(
  path.resolve("supabase/migrations/20261126081209_unknown_battery_health_staged_units.sql"),
  "utf8"
)
const read = (relativePath) => readFileSync(path.resolve(relativePath), "utf8")

test("the migration only relaxes the units column, never sellable inventory", () => {
  assert.match(migration, /alter table public\.opening_stock_units\s+alter column battery_health drop not null/)
  assert.doesNotMatch(
    migration,
    /alter table public\.inventory_devices[^;]*drop not null/i,
    "sellable inventory must keep requiring a measured battery"
  )
  assert.doesNotMatch(migration, /drop constraint opening_stock_units_inspection_valid/)
  assert.doesNotMatch(
    migration,
    /create or replace function private\.is_valid_opening_stock_inspection/,
    "the inspection contract must not be redefined"
  )
  assert.doesNotMatch(
    migration,
    /drop constraint opening_stock_units_(inspection|condition|imei)_valid/,
    "no other unit guard may be removed"
  )
})

test("the battery constraint cannot be satisfied by a NULL comparison", () => {
  // `battery_health between 1 and 100` is NULL for a NULL battery, and a CHECK
  // treats NULL as passed. An activated row must not be able to keep no value.
  const constraint = migration.slice(
    migration.indexOf("add constraint opening_stock_units_battery_valid"),
    migration.indexOf("-- Receiving accepts an absent measurement")
  )
  assert.match(constraint, /coalesce\(/, "the constraint must coalesce NULL to a rejection")
  assert.match(constraint, /when 'activated' then battery_health between 1 and 100/)
  assert.match(constraint, /when 'staged' then battery_health is null or battery_health between 1 and 100/)
})

test("activation refuses a unit whose battery health is unknown", () => {
  const activation = migration.slice(
    migration.indexOf("create or replace function public.activate_opening_stock_unit"),
    migration.indexOf("the post-receipt immutability trigger")
  )
  assert.match(activation, /target_unit\.battery_health is null/)
  assert.match(activation, /record the measured battery health before activation/)
  // The pre-existing activation guards must all still be present.
  assert.match(activation, /only staged units can be activated/)
  assert.match(activation, /stored IMEI or inspection is not eligible for activation/)
  assert.match(activation, /private\.opening_stock_imei_available/)
  assert.match(activation, /opening_stock_actor_membership\(target_unit\.store_id, true\)/)
})

test("the measurement RPC is staged-only, one-way and audited", () => {
  const record = migration.slice(
    migration.indexOf("create or replace function public.record_opening_stock_unit_battery_health"),
    migration.indexOf("revoke all on function public.receive_opening_stock_devices")
  )
  assert.match(record, /status <> 'staged'/)
  assert.match(record, /target_unit\.battery_health is not null/)
  assert.match(record, /opening_stock\.unit_battery_health_recorded/)
  assert.match(record, /for update/)
  // Recording a measurement must not by itself grant pricing approval.
  assert.match(record, /opening_stock_actor_membership\(target_unit\.store_id, false\)/)
  assert.doesNotMatch(record, /'activated'/)
  assert.doesNotMatch(record, /insert into public\.inventory_devices/)
})

test("battery health stays immutable once measured, and on every sellable unit", () => {
  const trigger = migration.slice(
    migration.indexOf("create or replace function private.validate_opening_stock_unit_update"),
    migration.indexOf("create or replace function public.record_opening_stock_unit_battery_health")
  )
  assert.match(trigger, /new\.battery_health is distinct from old\.battery_health/)
  assert.match(trigger, /old\.battery_health is null/)
  assert.match(trigger, /old\.status = 'staged'/)
  assert.match(trigger, /activation requires a measured battery health/)
  // Every identity field remains immutable.
  for (const field of ["imei", "colour", "condition", "inspection", "unit_cost_pesewas"]) {
    assert.match(trigger, new RegExp(`new\\.${field} is distinct from old\\.${field}`), `${field} must stay immutable`)
  }
})

test("the new RPC is not exposed to anonymous callers", () => {
  assert.match(migration, /revoke all on function public\.record_opening_stock_unit_battery_health\(uuid, integer\) from public, anon, authenticated, service_role/)
  assert.match(migration, /grant execute on function public\.record_opening_stock_unit_battery_health\(uuid, integer\) to authenticated/)
  assert.doesNotMatch(migration, /grant execute on function public\.record_opening_stock_unit_battery_health[^;]*to [^;]*anon/)
})

test("the receiving RPC still requires the confirmed invoice and full inspection", () => {
  const receive = migration.slice(
    migration.indexOf("create or replace function public.receive_opening_stock_devices("),
    migration.indexOf("-- The single-device wrapper now forwards")
  )
  assert.match(receive, /totals must be confirmed before receiving devices/)
  assert.match(receive, /active model registration required for receiving/)
  assert.match(receive, /real IMEI and complete passing inspection required/)
  assert.match(receive, /private\.is_valid_opening_stock_inspection/)
  assert.match(receive, /batch contains a duplicate IMEI/)
  assert.match(receive, /received quantity cannot exceed invoiced quantity/)
  assert.match(receive, /IMEI is already recorded/)
})

test("the UI blocks pricing an unmeasured device and offers the measurement instead", () => {
  const devicesTab = read("src/app/manager/opening-stock/devices-tab.tsx")
  assert.match(devicesTab, /unit\.status === "staged" && unit\.batteryHealth === null/)
  assert.match(devicesTab, /onRecordBattery/)
  assert.match(devicesTab, /Not measured/)
  // An unmeasured row must not offer the activation control before the guard.
  const guardIndex = devicesTab.indexOf('unit.status === "staged" && unit.batteryHealth === null')
  const activationIndex = devicesTab.indexOf("onActivate(unit.id, next)")
  assert.ok(guardIndex >= 0 && guardIndex < activationIndex, "the unknown-battery guard must precede activation")
})

test("the server action surfaces the pre-activation measurement requirement", () => {
  const actions = read("src/app/manager/opening-stock/actions.ts")
  assert.match(actions, /record_opening_stock_unit_battery_health/)
  assert.match(actions, /measured battery health before approving its sale price/)
  assert.match(actions, /recordBatteryHealthInlineAction/)
})

test("the manager data mapper accepts an unknown battery rather than throwing", () => {
  const server = read("src/lib/opening-stock-server.ts")
  assert.match(server, /batteryHealth: number \| null/)
  assert.match(server, /batteryHealth: optionalInteger\(row\.battery_health\)/)
})
