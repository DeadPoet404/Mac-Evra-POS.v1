import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import test from "node:test"

const migrations = readdirSync(new URL("../supabase/migrations", import.meta.url))
  .filter((name) => name.endsWith(".sql"))
  .sort()
const suiteFiles = readdirSync(new URL("../supabase/tests", import.meta.url))
  .filter((name) => name.endsWith(".test.sql"))
  .sort()

const VERSION = /^(\d{14})_[a-z0-9_]+\.sql$/
const SUITE = /^(\d{3})_[a-z0-9_]+\.test\.sql$/

/**
 * Supabase applies `supabase/migrations/*.sql` in filename order and records the
 * leading version. Two files sharing a version cannot both be applied to a fresh
 * database, and on an already-migrated database the second is silently skipped —
 * which is how a migration ends up merged but never executed. This suite exists
 * because a new migration once reused `20261124120000`, a version already taken
 * by `20261124120000_seed_iphone_device_models.sql`.
 */
test("every migration filename carries a 14-digit version", () => {
  for (const name of migrations) {
    assert.match(name, VERSION, `${name} must be named <14-digit version>_<snake_case>.sql`)
  }
})

test("no two migrations share a version", () => {
  const byVersion = new Map()
  for (const name of migrations) {
    const [, version] = name.match(VERSION)
    const existing = byVersion.get(version)
    assert.equal(
      existing,
      undefined,
      existing
        ? `${name} reuses version ${version}, already used by ${existing}`
        : `${name} reuses version ${version}`
    )
    byVersion.set(version, name)
  }
})

test("the opening-stock line removal migration sorts after every migration already on main", () => {
  const removal = "20261124130000_opening_stock_line_removal.sql"
  assert.ok(migrations.includes(removal), "the removal migration exists under its current version")

  // These files were merged before the removal migration, so it must sort after
  // all of them or a fresh database would apply it out of order.
  const preExisting = [
    "20261123060000_phase_01_foundation.sql",
    "20261123120000_phase_02_inventory.sql",
    "20261123180000_phase_03_employee_auth.sql",
    "20261123200000_phase_04_employee_management.sql",
    "20261123220000_phase_05_sales_customers.sql",
    "20261123235900_phase_06_manual_payments.sql",
    "20261124000000_opening_stock_intake.sql",
    "20261124120000_seed_iphone_device_models.sql",
  ]
  for (const name of preExisting) {
    assert.ok(migrations.includes(name), `${name} is still present`)
    assert.ok(name < removal, `${removal} must sort after ${name}`)
  }

  // Later forward-only migrations may sort after the removal migration, but the
  // removal migration must never stop sorting after the intake tables it alters.
  const batteryHealth = "20261126081209_unknown_battery_health_staged_units.sql"
  assert.ok(migrations.includes(batteryHealth), "the unknown-battery migration exists")
  assert.ok(removal < batteryHealth, `${batteryHealth} must sort after ${removal}`)

  // Pending-inspection staging follows the unknown-battery relaxation, and the
  // temporary import authorization follows that, because it redefines the
  // reconciliation helper the staging migration does not touch.
  const pendingInspection = "20261126140000_pending_inspection_staging.sql"
  const temporaryAuthorization = "20261126140100_temporary_import_authorization.sql"
  assert.ok(migrations.includes(pendingInspection), "the pending-inspection migration exists")
  assert.ok(migrations.includes(temporaryAuthorization), "the temporary authorization migration exists")
  assert.ok(batteryHealth < pendingInspection, `${pendingInspection} must sort after ${batteryHealth}`)

  // The inspection-completion workflow must sort after the pending-inspection
  // migration whose columns and RPC it builds on, and after the temporary
  // authorization it deliberately does not depend on.
  const inspectionWorkflow = "20261126150000_inspection_completion_workflow.sql"
  assert.ok(migrations.includes(inspectionWorkflow), "the inspection completion migration exists")
  assert.ok(pendingInspection < inspectionWorkflow, `${inspectionWorkflow} must sort after ${pendingInspection}`)
  assert.equal(migrations.at(-1), inspectionWorkflow, "the inspection completion migration is the newest file")
})

test("the removal migration builds on the intake tables it alters", () => {
  const intake = readFileSync(
    new URL("../supabase/migrations/20261124000000_opening_stock_intake.sql", import.meta.url),
    "utf8"
  )
  const removal = readFileSync(
    new URL("../supabase/migrations/20261124130000_opening_stock_line_removal.sql", import.meta.url),
    "utf8"
  )

  // Sorting after intake is not enough on its own: the migration must not depend
  // on anything the intake migration does not create.
  for (const anchor of [
    "create table public.supplier_invoices",
    "create table public.supplier_invoice_lines",
    "create table public.supplier_invoice_corrections",
    "create or replace function private.opening_stock_actor_membership",
    "create or replace function private.opening_stock_audit",
    "create view public.opening_stock_invoice_lines_view",
  ]) {
    assert.ok(intake.includes(anchor), `intake migration provides ${anchor}`)
  }
  assert.match(removal, /alter table public\.supplier_invoice_lines/)
  assert.match(
    removal,
    /create or replace view public\.opening_stock_invoice_lines_view/,
    "the removal migration replaces the line view it filters"
  )
})

test("database suites are numbered uniquely and share the migrations' ordering rule", () => {
  for (const name of suiteFiles) {
    assert.match(name, SUITE, `${name} must be named NNN_<snake_case>.test.sql`)
  }
  const numbers = suiteFiles.map((name) => name.match(SUITE)[1])
  assert.equal(new Set(numbers).size, numbers.length, "two suites must not share a number")
  const removalSuite = "009_opening_stock_line_removal.test.sql"
  assert.ok(suiteFiles.includes(removalSuite), "the removal suite is picked up by db:test")
  assert.ok(suiteFiles.indexOf(removalSuite) >= 0, "the removal suite is registered")
  // A later suite may follow it, but no suite may reuse or precede its number.
  const batterySuite = "010_unknown_battery_health.test.sql"
  if (suiteFiles.includes(batterySuite)) {
    assert.equal(suiteFiles.at(-1), batterySuite, "the newest suite is the unknown-battery suite")
  } else {
    assert.equal(suiteFiles.at(-1), removalSuite, "the removal suite is the newest suite")
  }
})
