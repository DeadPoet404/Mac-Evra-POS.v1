import assert from "node:assert/strict"
import { readFileSync, existsSync } from "node:fs"
import path from "node:path"
import test from "node:test"

import {
  computeLineTotalPesewas,
  describeCorrection,
  deviceDraftToRpcPayload,
  emptyDeviceEntry,
  hasFieldErrors,
  initialInvoiceId,
  IMEI_PLACEHOLDER,
  inspectionChecksFromRecord,
  invoiceProgress,
  invoiceToEditableFields,
  isPlaceholderImei,
  lineToEditableFields,
  mergeInvoiceDraft,
  mergeLineDraft,
  nextDeviceEntry,
  nextFocusKey,
  pesewasToEditableGhs,
  resolveSelectedInvoice,
  validateDeviceEntry,
  validateInvoiceEdit,
  validateLineEdit,
} from "../src/lib/opening-stock-workspace.ts"
import { openingStockInspectionChecks } from "../src/lib/opening-stock.ts"

function read(relativePath) {
  return readFileSync(path.resolve(relativePath), "utf8")
}

const workspacePagePath = "src/app/manager/opening-stock/page.tsx"

/* ------------------------------------------------------------------ *
 * Regression: correction targeting
 *
 * The original defect prefilled correction inputs from `invoices[0]` /
 * `lines[0]` while the submit button wrote whatever the dropdown selected.
 * These tests prove that a payload can only ever be built from the record
 * that is being edited, and that editing B leaves A untouched.
 * ------------------------------------------------------------------ */

const invoiceA = {
  id: "11111111-1111-4111-8111-111111111111",
  supplierName: "Approved Supplier A",
  supplierInvoiceNumber: "INV-0091",
  invoiceDate: "2026-11-20",
  declaredTotalPesewas: 6130000,
  notes: "First delivery",
  status: "open",
}

const invoiceB = {
  id: "22222222-2222-4222-8222-222222222222",
  supplierName: "Titan Traders",
  supplierInvoiceNumber: null,
  invoiceDate: "2026-11-22",
  declaredTotalPesewas: 1840000,
  notes: null,
  status: "open",
}

const lineA = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  invoiceId: invoiceA.id,
  quantityInvoiced: 5,
  unitCostPesewas: 920000,
  quantityReceived: 2,
}

const lineB = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  invoiceId: invoiceB.id,
  quantityInvoiced: 3,
  unitCostPesewas: 510000,
  quantityReceived: 0,
}

test("regression: editing invoice B sends invoice B's id and B's own unchanged values", () => {
  const payload = mergeInvoiceDraft(invoiceB, { declaredTotalGhs: "19000.00" })

  assert.equal(payload.invoiceId, invoiceB.id, "the payload must target the invoice being edited")
  assert.notEqual(payload.invoiceId, invoiceA.id)
  assert.equal(payload.supplierName, "Titan Traders", "unchanged supplier must come from B, not A")
  assert.equal(payload.supplierInvoiceNumber, "", "B's missing reference must not inherit A's")
  assert.equal(payload.invoiceDate, "2026-11-22", "B's date must not inherit A's")
  assert.equal(payload.notes, "", "B's empty notes must not inherit A's notes")
  assert.equal(payload.declaredTotalGhs, "19000.00", "the edited cell is applied")
})

test("regression: editing invoice A cannot produce B's values, and vice versa", () => {
  const forA = mergeInvoiceDraft(invoiceA, { supplierName: "Renamed Supplier" })
  const forB = mergeInvoiceDraft(invoiceB, { supplierName: "Renamed Supplier" })

  for (const payload of [forA, forB]) {
    assert.equal(payload.supplierName, "Renamed Supplier")
  }
  assert.equal(forA.invoiceId, invoiceA.id)
  assert.equal(forB.invoiceId, invoiceB.id)
  assert.equal(forA.invoiceDate, "2026-11-20")
  assert.equal(forB.invoiceDate, "2026-11-22")
  assert.notEqual(forA.declaredTotalGhs, forB.declaredTotalGhs)
})

test("regression: the invoice draft is a pure function of the record handed in", () => {
  // The same patch applied to two different records must preserve each
  // record's own identity and untouched fields.
  const patch = { notes: "Shared note" }
  const a = mergeInvoiceDraft(invoiceA, patch)
  const b = mergeInvoiceDraft(invoiceB, patch)

  assert.equal(a.invoiceId, invoiceA.id)
  assert.equal(b.invoiceId, invoiceB.id)
  assert.equal(a.supplierName, invoiceA.supplierName)
  assert.equal(b.supplierName, invoiceB.supplierName)
  assert.equal(a.invoiceDate, invoiceA.invoiceDate)
  assert.equal(b.invoiceDate, invoiceB.invoiceDate)
})

test("regression: editing line B sends line B's id and B's own quantity and cost", () => {
  const payload = mergeLineDraft(lineB, { quantityInvoiced: "4" })

  assert.equal(payload.lineId, lineB.id)
  assert.notEqual(payload.lineId, lineA.id)
  assert.equal(payload.quantityInvoiced, "4")
  assert.equal(payload.unitCostGhs, "5100.00", "B's unit cost must come from B")
})

test("regression: editing line A never returns line B's cost", () => {
  const payload = mergeLineDraft(lineA, { unitCostGhs: "9300.00" })
  assert.equal(payload.lineId, lineA.id)
  assert.equal(payload.unitCostGhs, "9300.00")
  assert.notEqual(payload.unitCostPesewas, lineB.unitCostPesewas)
})

test("regression: no merge helper can fall back to the first invoice or line", () => {
  const source = read("src/lib/opening-stock-workspace.ts")
  // The historical defect looked exactly like this. The only permitted "first
  // element" read is the initial-selection default, which is not a payload.
  assert.doesNotMatch(source, /invoices\s*\[\s*0\s*\][^]*?sellerName/)
  assert.doesNotMatch(source, /lines\s*\[\s*0\s*\]/)
  assert.doesNotMatch(source, /invoices\.at\(\s*0\s*\)/)
  assert.doesNotMatch(source, /lines\.at\(\s*0\s*\)/)
  // merge helpers must require a record argument
  assert.match(source, /export function mergeInvoiceDraft\(\s*record: InvoiceEditRecord/)
  assert.match(source, /export function mergeLineDraft\(\s*record: LineEditRecord/)
  // invoiceToEditableFields / lineToEditableFields must read only their own record
  assert.doesNotMatch(source, /invoiceToEditableFields\([^)]*invoices/)
  assert.doesNotMatch(source, /lineToEditableFields\([^)]*lines/)
})

/* ------------------------------------------------------------------ *
 * Invoice selection and switching
 * ------------------------------------------------------------------ */

test("invoice selection resolves by id, not by position", () => {
  const invoices = [invoiceA, invoiceB]
  assert.equal(resolveSelectedInvoice(invoices, invoiceB.id)?.id, invoiceB.id)
  assert.equal(resolveSelectedInvoice(invoices, invoiceA.id)?.id, invoiceA.id)
  assert.equal(resolveSelectedInvoice(invoices, null), null)
  assert.equal(resolveSelectedInvoice(invoices, "99999999-9999-4999-8999-999999999999"), null)
})

test("initial invoice falls back to the newest invoice, and stays stable across tabs", () => {
  const invoices = [invoiceB, invoiceA]
  assert.equal(initialInvoiceId(invoices, invoiceA.id), invoiceA.id, "explicit selection wins")
  assert.equal(initialInvoiceId(invoices, "not-an-invoice"), invoiceB.id, "invalid selection falls back")
  assert.equal(initialInvoiceId(invoices, null), invoiceB.id, "no selection uses the newest invoice")
  assert.equal(initialInvoiceId([], null), null, "an empty workspace selects nothing")
  // Switching tabs must not change which invoice is selected.
  const selected = initialInvoiceId(invoices, invoiceA.id)
  assert.equal(initialInvoiceId(invoices, selected), selected)
})

test("editable field views are derived per record", () => {
  assert.deepEqual(invoiceToEditableFields(invoiceA), {
    supplierName: "Approved Supplier A",
    supplierInvoiceNumber: "INV-0091",
    invoiceDate: "2026-11-20",
    declaredTotalGhs: "61300.00",
    notes: "First delivery",
  })
  assert.deepEqual(invoiceToEditableFields(invoiceB), {
    supplierName: "Titan Traders",
    supplierInvoiceNumber: "",
    invoiceDate: "2026-11-22",
    declaredTotalGhs: "18400.00",
    notes: "",
  })
  assert.deepEqual(lineToEditableFields(lineA), { quantityInvoiced: "5", unitCostGhs: "9200.00" })
  assert.deepEqual(lineToEditableFields(lineB), { quantityInvoiced: "3", unitCostGhs: "5100.00" })
})

test("hidden purchase cost yields an empty editable value, never a fabricated one", () => {
  assert.equal(pesewasToEditableGhs(null), "")
  assert.equal(pesewasToEditableGhs(undefined), "")
  assert.equal(pesewasToEditableGhs(0), "0.00")
  assert.equal(pesewasToEditableGhs(5), "0.05")
  assert.equal(pesewasToEditableGhs(14655000), "146550.00")
  assert.equal(invoiceToEditableFields({ ...invoiceB, declaredTotalPesewas: null }).declaredTotalGhs, "")
  assert.equal(lineToEditableFields({ ...lineB, unitCostPesewas: null }).unitCostGhs, "")
})

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

const validInvoiceEdit = {
  supplierName: "Approved Supplier",
  supplierInvoiceNumber: "INV-0001",
  invoiceDate: "2026-11-20",
  declaredTotalGhs: "1000.00",
  notes: "Delivery",
}

test("invoice validation accepts a well-formed correction", () => {
  assert.deepEqual(validateInvoiceEdit(validInvoiceEdit, new Date("2026-11-24T10:00:00Z")), {})
})

test("invoice validation rejects an optional reference that is too short or illegal", () => {
  assert.ok(
    validateInvoiceEdit({ ...validInvoiceEdit, supplierInvoiceNumber: "x" }, new Date("2026-11-24T10:00:00Z"))
      .supplierInvoiceNumber
  )
  assert.ok(
    validateInvoiceEdit({ ...validInvoiceEdit, supplierInvoiceNumber: "INV#1" }, new Date("2026-11-24T10:00:00Z"))
      .supplierInvoiceNumber
  )
  // blank is allowed because the reference is optional
  assert.equal(
    validateInvoiceEdit({ ...validInvoiceEdit, supplierInvoiceNumber: "  " }, new Date("2026-11-24T10:00:00Z"))
      .supplierInvoiceNumber,
    undefined
  )
})

test("invoice validation rejects a future date and a non-positive total", () => {
  const errors = validateInvoiceEdit(
    { ...validInvoiceEdit, invoiceDate: "2026-12-01", declaredTotalGhs: "0.00" },
    new Date("2026-11-24T10:00:00Z")
  )
  assert.ok(errors.invoiceDate, "future dates must be rejected before the round trip")
  assert.ok(errors.declaredTotalGhs)
})

test("invoice validation rejects malformed money and illegal dates", () => {
  assert.ok(validateInvoiceEdit({ ...validInvoiceEdit, declaredTotalGhs: "10.999" }).declaredTotalGhs)
  assert.ok(validateInvoiceEdit({ ...validInvoiceEdit, declaredTotalGhs: "abc" }).declaredTotalGhs)
  assert.ok(validateInvoiceEdit({ ...validInvoiceEdit, invoiceDate: "2026-02-31" }).invoiceDate)
})

test("line validation blocks a quantity below what has been received", () => {
  const errors = validateLineEdit({ quantityInvoiced: "1", unitCostGhs: "9200.00" }, lineA)
  assert.match(errors.quantityInvoiced, /already received/)
})

test("line validation blocks a unit cost change after receipt", () => {
  const received = validateLineEdit({ quantityInvoiced: "5", unitCostGhs: "9999.00" }, lineA)
  assert.match(received.unitCostGhs, /locked once a device has been received/)

  const unreceived = validateLineEdit({ quantityInvoiced: "3", unitCostGhs: "9999.00" }, lineB)
  assert.equal(unreceived.unitCostGhs, undefined, "cost is still editable before receipt")
})

test("line validation accepts an unchanged cost on a line that has receipts", () => {
  const errors = validateLineEdit({ quantityInvoiced: "5", unitCostGhs: "9200.00" }, lineA)
  assert.deepEqual(errors, {})
})

test("hasFieldErrors distinguishes clean from dirty", () => {
  assert.equal(hasFieldErrors({}), false)
  assert.equal(hasFieldErrors({ imei: "bad" }), true)
})

test("line totals are computed from quantity × unit cost and never invented", () => {
  assert.equal(computeLineTotalPesewas("5", "9200.00"), 4600000)
  assert.equal(computeLineTotalPesewas(3, "5100.50"), 1530150)
  assert.equal(computeLineTotalPesewas("0", "100"), null)
  assert.equal(computeLineTotalPesewas("2", "0"), null)
  assert.equal(computeLineTotalPesewas("", "100"), null)
  assert.equal(computeLineTotalPesewas("abc", "100"), null)
})

/* ------------------------------------------------------------------ *
 * Device entry: no inherited physical evidence
 * ------------------------------------------------------------------ */

const checks = openingStockInspectionChecks.map((check) => ({ name: check.name, label: check.label }))

const completeDevice = {
  invoiceLineId: lineA.id,
  // A Luhn-valid identifier that is not the placeholder shipped in the hint text.
  imei: "352099104567819",
  colour: "Natural Titanium",
  condition: "good",
  batteryHealth: "92",
  inspectionNotes: "Screen flawless",
  checks: Object.fromEntries(openingStockInspectionChecks.map((check) => [check.name, true])),
}

test("a new device row starts with no condition, no battery and no attestation", () => {
  const draft = emptyDeviceEntry(lineA.id)
  assert.equal(draft.condition, "", "condition must never default to excellent")
  assert.equal(draft.batteryHealth, "", "battery health must never default to 100")
  assert.deepEqual(draft.checks, {}, "no inspection check may be pre-ticked")
  assert.equal(draft.imei, "")
  assert.equal(draft.colour, "")
})

test("the next row does not inherit the previous device's physical evidence", () => {
  const next = nextDeviceEntry(completeDevice, lineB.id)
  assert.equal(next.invoiceLineId, lineB.id)
  assert.equal(next.colour, "")
  assert.equal(next.condition, "")
  assert.equal(next.batteryHealth, "")
  assert.deepEqual(next.checks, {})
  assert.notEqual(next.imei, completeDevice.imei)
})

test("device validation rejects a missing condition or battery instead of defaulting them", () => {
  const errors = validateDeviceEntry({ ...completeDevice, condition: "", batteryHealth: "" }, {
    existingImeis: [],
    inspectionChecks: checks,
  })
  assert.ok(errors.condition)
  assert.ok(errors.batteryHealth)
})

test("device validation requires every inspection check for this device", () => {
  const partial = { ...completeDevice, checks: { ...completeDevice.checks, displayPassed: false } }
  const errors = validateDeviceEntry(partial, { existingImeis: [], inspectionChecks: checks })
  assert.match(errors.inspection, /1 outstanding/)
})

test("device validation enforces IMEI length, Luhn and uniqueness", () => {
  const context = { existingImeis: [], inspectionChecks: checks }

  assert.match(validateDeviceEntry({ ...completeDevice, imei: "12345" }, context).imei, /15 digits/)
  // Fails the Luhn check digit.
  assert.match(
    validateDeviceEntry({ ...completeDevice, imei: "357000000000018" }, context).imei,
    /Luhn/
  )
  assert.match(validateDeviceEntry(emptyDeviceEntry(lineA.id), context).imei, /Scan or type/)
  // The example IMEI from the hint text is Luhn-valid, so it is rejected explicitly.
  assert.match(
    validateDeviceEntry({ ...completeDevice, imei: IMEI_PLACEHOLDER }, context).imei,
    /placeholder/,
    "the documented example IMEI must never be accepted as a real device"
  )
  assert.match(
    validateDeviceEntry({ ...completeDevice }, { existingImeis: ["352099104567819"], inspectionChecks: checks }).imei,
    /already recorded/
  )
})

test("device validation rejects placeholder IMEIs from the input hint", () => {
  assert.equal(isPlaceholderImei("357000000000017"), true)
  assert.equal(isPlaceholderImei("000000000000000"), true)
  assert.equal(isPlaceholderImei("860000000000017"), false)
  const context = { existingImeis: [], inspectionChecks: checks }
  assert.match(
    validateDeviceEntry({ ...completeDevice, imei: "357000000000017" }, context).imei,
    /placeholder/
  )
})

test("a fully completed device row validates cleanly", () => {
  assert.deepEqual(
    validateDeviceEntry({ ...completeDevice, imei: "860000000000017" }, { existingImeis: [], inspectionChecks: checks }),
    {}
  )
})

test("the RPC payload carries this device's own attested inspection", () => {
  const payload = deviceDraftToRpcPayload(
    { ...completeDevice, imei: "860000000000017" },
    openingStockInspectionChecks
  )
  assert.equal(payload.length, 1)
  assert.equal(payload[0].imei, "860000000000017")
  assert.equal(payload[0].colour, "Natural Titanium")
  assert.equal(payload[0].condition, "good")
  assert.equal(payload[0].battery_health, 92)
  // The database validates the exact snake_case contract, so the payload must
  // use those keys rather than the UI's camelCase names.
  for (const field of [
    "imei_confirmed_physical",
    "identity_labels_match",
    "display_passed",
    "cameras_passed",
    "buttons_passed",
    "connectivity_passed",
    "charging_port_passed",
    "activation_lock_cleared",
  ]) {
    assert.equal(payload[0].inspection[field], true, `${field} must be attested`)
  }
  assert.equal(payload[0].inspection.notes, "Screen flawless")
  assert.doesNotMatch(JSON.stringify(payload[0].inspection), /imeiConfirmed|labelsMatch/)
})

test("stored inspection documents read back into the UI's check shape", () => {
  const roundTripped = inspectionChecksFromRecord({
    imei_confirmed_physical: true,
    identity_labels_match: true,
    display_passed: false,
    cameras_passed: true,
    buttons_passed: true,
    connectivity_passed: true,
    charging_port_passed: true,
    activation_lock_cleared: true,
    notes: "Charging port scuffed",
  })
  assert.equal(roundTripped.checks.displayPassed, false)
  assert.equal(roundTripped.checks.activationLockCleared, true)
  assert.equal(roundTripped.notes, "Charging port scuffed")
})

test("blank inspection notes are sent as null rather than an empty string", () => {
  const payload = deviceDraftToRpcPayload({ ...completeDevice, inspectionNotes: "   " }, openingStockInspectionChecks)
  assert.equal(payload[0].inspection.notes, null)
})

/* ------------------------------------------------------------------ *
 * Focus management
 * ------------------------------------------------------------------ */

test("focus advances to the next editable cell and stops at the end", () => {
  const order = ["supplierName", "supplierInvoiceNumber", "invoiceDate", "declaredTotalGhs", "notes"]
  assert.equal(nextFocusKey(order, "supplierName"), "supplierInvoiceNumber")
  assert.equal(nextFocusKey(order, "declaredTotalGhs"), "notes")
  assert.equal(nextFocusKey(order, "notes"), null, "the last cell has nowhere further to go")
  assert.equal(nextFocusKey(order, "unknown"), "supplierName", "unknown keys restart at the top")
  assert.equal(nextFocusKey([], "anything"), null)
})

/* ------------------------------------------------------------------ *
 * Summary and audit rendering
 * ------------------------------------------------------------------ */

test("invoice progress is scoped to one invoice", () => {
  const lines = [
    { invoiceId: invoiceA.id, quantityInvoiced: 5, quantityReceived: 5, quantityStaged: 2, quantityActivated: 3, quantityOutstanding: 0 },
    { invoiceId: invoiceA.id, quantityInvoiced: 3, quantityReceived: 0, quantityStaged: 0, quantityActivated: 0, quantityOutstanding: 3 },
    { invoiceId: invoiceB.id, quantityInvoiced: 9, quantityReceived: 9, quantityStaged: 9, quantityActivated: 0, quantityOutstanding: 0 },
  ]
  assert.deepEqual(invoiceProgress(lines, invoiceA.id), {
    lineCount: 2,
    unitsInvoiced: 8,
    unitsReceived: 5,
    unitsStaged: 2,
    unitsActivated: 3,
    unitsOutstanding: 3,
  })
  assert.deepEqual(invoiceProgress(lines, "99999999-9999-4999-8999-999999999999"), {
    lineCount: 0,
    unitsInvoiced: 0,
    unitsReceived: 0,
    unitsStaged: 0,
    unitsActivated: 0,
    unitsOutstanding: 0,
  })
})

test("corrections render as readable changes rather than raw JSON", () => {
  const changes = describeCorrection(
    "invoice",
    { supplier_name: "Old Supplier", declared_total_pesewas: 6090000, notes: "a" },
    { supplier_name: "New Supplier", declared_total_pesewas: 6130000, notes: "a" }
  )
  assert.deepEqual(changes, [
    "Supplier: Old Supplier → New Supplier",
    "Declared total: GH₵60,900.00 → GH₵61,300.00",
  ])

  const lineChanges = describeCorrection(
    "invoice_line",
    { quantity_invoiced: 3, unit_cost_pesewas: 510000 },
    { quantity_invoiced: 4, unit_cost_pesewas: 510000 }
  )
  assert.deepEqual(lineChanges, ["Quantity: 3 → 4"])
})

test("clearing an optional value is described as empty, not undefined", () => {
  const changes = describeCorrection("invoice", { supplier_invoice_number: "INV-1" }, { supplier_invoice_number: null })
  assert.deepEqual(changes, ["Reference: INV-1 → empty"])
})

/* ------------------------------------------------------------------ *
 * Workspace source guarantees
 * ------------------------------------------------------------------ */

test("the workspace page keeps the permission guard and never reads the first record", () => {
  assert.ok(existsSync(path.resolve(workspacePagePath)), "the workspace page must exist")
  const page = read(workspacePagePath)
  assert.match(
    page,
    /requirePermissions\(\["access_manager_workspace", "manage_inventory"\]/,
    "the page must keep its server-side permission guard"
  )
  assert.doesNotMatch(page, /invoices\[0\]/, "the page must not prefill from the first invoice")
  assert.doesNotMatch(page, /lines\[0\]/, "the page must not prefill from the first line")
  assert.doesNotMatch(page, /firstInvoice/, "the historical firstInvoice defect must not return")
  assert.doesNotMatch(page, /firstLine/, "the historical firstLine defect must not return")
})

test("the workspace contains all three tabs and keeps the review-findings anchors", () => {
  const page = read(workspacePagePath)
  const workspace = read("src/app/manager/opening-stock/workspace.tsx")
  const invoicesTab = read("src/app/manager/opening-stock/invoices-tab.tsx")
  const linesTab = read("src/app/manager/opening-stock/lines-tab.tsx")
  const devicesTab = read("src/app/manager/opening-stock/devices-tab.tsx")

  // One page, three tabs, no separate routes.
  assert.match(workspace, /Supplier Invoices/, "tab A must be present")
  assert.match(workspace, /Invoice Products/, "tab B must be present")
  assert.match(workspace, /Devices & IMEIs/, "tab C must be present")
  assert.match(workspace, /role="tablist"/, "the tabs must be a real tab list")
  assert.match(workspace, /aria-selected=\{active\}/, "the active tab must be announced")
  assert.match(workspace, /role="tabpanel"/, "the panel must be associated with its tab")
  // Tabs must be client state, not navigation: no route change on switch.
  assert.doesNotMatch(workspace, /usePathname|router\.push\(`\/manager\/opening-stock\?tab/)

  // Anchors asserted by tests/opening-stock-review-findings.test.mjs.
  assert.match(page, /summarizeOpeningStockInvoiceReconciliation/)
  assert.match(linesTab, /Declared invoice total reconciliation/)
  assert.match(linesTab, /Line total/)
  assert.match(linesTab, /Confirm invoice totals/)
  assert.match(invoicesTab, /Invoice number \/ reference · optional/)
  assert.match(devicesTab, /<option value="" disabled>\s*Select condition\s*<\/option>/)

  // The reviewed production invoice must never be hardcoded anywhere.
  for (const [label, source] of Object.entries({
    page,
    workspace,
    invoicesTab,
    linesTab,
    devicesTab,
  })) {
    assert.doesNotMatch(source, /146[,\s]?550|14655000|31[,\s]?550|OSEI|15 lines|48 units/i, `${label} is hardcoded`)
  }
})

test("the obsolete opening-stock forms are gone", () => {
  assert.equal(
    existsSync(path.resolve("src/app/manager/opening-stock/batch-receiving-form.tsx")),
    false,
    "the duplicate batch receiving form must be removed once the device table replaces it"
  )
  assert.equal(
    existsSync(path.resolve("src/app/manager/opening-stock/model-selector.tsx")),
    false,
    "the two-step model selector is replaced by the searchable catalogue combobox"
  )
})

test("no opening-stock source performs a direct browser table write", () => {
  const files = [
    workspacePagePath,
    "src/app/manager/opening-stock/actions.ts",
    "src/lib/opening-stock-workspace.ts",
  ]
  for (const file of files) {
    const source = read(file)
    assert.doesNotMatch(source, /\.insert\(/, `${file} must not write tables directly`)
    assert.doesNotMatch(source, /\.upsert\(/, `${file} must not upsert tables directly`)
    assert.doesNotMatch(source, /\.delete\(/, `${file} must not delete rows directly`)
    assert.doesNotMatch(source, /\.update\(/, `${file} must not update rows directly`)
  }
})

test("every correction action forwards an explicit record id and a reason", () => {
  const actions = read("src/app/manager/opening-stock/actions.ts")
  assert.match(actions, /p_invoice_id: input\.invoiceId/, "invoice corrections target the parsed invoice id")
  assert.match(actions, /p_invoice_line_id: input\.lineId/, "line corrections target the parsed line id")
  assert.match(actions, /p_reason: input\.reason/, "corrections must carry a reason")
  assert.match(actions, /correct_supplier_invoice/, "invoice corrections use the existing audited RPC")
  assert.match(actions, /correct_supplier_invoice_line/, "line corrections use the existing audited RPC")
  // The new removal path is audited too: id + mandatory reason, no table delete.
  assert.match(actions, /rpc\("remove_supplier_invoice_line", \{\s*p_invoice_line_id: parsedLineId,\s*p_reason: trimmed,/)
  assert.doesNotMatch(actions, /\.from\("supplier_invoice_lines"\)\s*\.delete\(/)
})

test("line removal is refused for received devices, the last line and closed invoices", () => {
  const linesTab = read("src/app/manager/opening-stock/lines-tab.tsx")
  const migration = read("supabase/migrations/20261124130000_opening_stock_line_removal.sql")

  // The affordance is disabled for exactly the cases the database refuses.
  assert.match(linesTab, /disabled=\{closed \|\| line\.quantityReceived > 0 \|\| invoiceLines\.length <= 1\}/)
  assert.match(linesTab, /Remove line/)
  assert.match(linesTab, /onRemoveLine/)

  // The RPC enforces the same rules server-side, so the UI cannot bypass them.
  assert.match(migration, /invoice line cannot be removed after devices are received/)
  assert.match(migration, /the last invoice line cannot be removed/)
  assert.match(migration, /closed invoice line cannot be removed/)
  assert.match(migration, /valid correction reason required/)
  assert.match(migration, /opening_stock\.invoice_line_removed/)
  assert.match(migration, /insert into public\.supplier_invoice_corrections/)
  // Removal must reset any existing confirmation.
  assert.match(migration, /confirmed_at = null/)
  // Retired lines are excluded from arithmetic and from the line view.
  assert.match(migration, /and invoice_line\.removed_at is null/)
  assert.match(migration, /and line\.removed_at is null/)
  // The ledger stays append-only: no update/delete of corrections.
  assert.doesNotMatch(migration, /update public\.supplier_invoice_corrections/)
  assert.doesNotMatch(migration, /delete from public\.supplier_invoice_corrections/)

  // `opening_stock_invoice_lines_view` is security_invoker, so its new
  // `removed_at is null` predicate is evaluated with the caller's privileges.
  // Without this column grant every manager read of the view fails.
  assert.match(
    migration,
    /grant select \(removed_at\) on table public\.supplier_invoice_lines to authenticated/,
    "readers need the column privilege the security_invoker view predicate uses"
  )
  assert.doesNotMatch(
    migration,
    /grant select \([^)]*removal_reason[^)]*\)/,
    "the removal reason stays off the raw table"
  )
})
