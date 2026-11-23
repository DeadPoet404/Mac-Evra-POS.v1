import assert from "node:assert/strict"
import test from "node:test"

import { routeRequirement } from "../src/lib/auth/policy.ts"
import {
  canViewPurchaseCost,
  isValidLuhnImei,
  isValidRealImei,
  normalizeOpeningStockImei,
  parseActivationInput,
  parseBatchDeviceInput,
  parseImeiBatch,
  parseIndividualDeviceInput,
  parseInspectionInput,
  parseInvoiceCorrectionInput,
  parseInvoiceLineCorrectionInput,
  parseInvoiceLineInput,
  parseModelRegistrationInput,
  parseRepricingInput,
  parseSupplierInvoiceInput,
  summarizeOpeningStockQuantities,
} from "../src/lib/opening-stock.ts"

function form(entries) {
  const formData = new FormData()
  for (const [key, value] of Object.entries(entries)) formData.set(key, value)
  return formData
}

const inspectionChecks = {
  imeiConfirmed: "on",
  labelsMatch: "on",
  displayPassed: "on",
  camerasPassed: "on",
  buttonsPassed: "on",
  connectivityPassed: "on",
  chargingPortPassed: "on",
  activationLockCleared: "on",
}

test("the opening-stock manager route requires manager workspace and inventory permissions", () => {
  assert.deepEqual(routeRequirement("/manager/opening-stock"), {
    protected: true,
    permissions: ["access_manager_workspace", "manage_inventory"],
  })
  assert.deepEqual(routeRequirement("/manager/opening-stock/review"), {
    protected: true,
    permissions: ["access_manager_workspace", "manage_inventory"],
  })
})

test("opening-stock IMEIs require a real Luhn check digit and reject placeholders", () => {
  assert.equal(normalizeOpeningStockImei("35 7000-000 000 017"), "357000000000017")
  assert.equal(isValidLuhnImei("357000000000017"), true)
  assert.equal(isValidRealImei("357000000000017"), true)
  assert.equal(isValidRealImei("35 7000-000 000 017"), true)
  assert.equal(isValidRealImei("357000000000018"), false)
  assert.equal(isValidRealImei("000000000000000"), false)
  assert.equal(isValidRealImei("490154203237518"), false)
  assert.equal(isValidRealImei("012345678901234"), false)
  assert.equal(isValidRealImei("not-an-imei"), false)
})

test("batch input normalizes unique real IMEIs and rejects duplicates or invalid check digits", () => {
  assert.deepEqual(
    parseImeiBatch("357000000000017\n35 7000-000 000 025,357000000000033"),
    ["357000000000017", "357000000000025", "357000000000033"]
  )
  assert.throws(() => parseImeiBatch("357000000000017\n357000000000017"), /unique/)
  assert.throws(() => parseImeiBatch("357000000000018"), /real Luhn-valid/)
  assert.throws(() => parseImeiBatch(""), /between 1 and 100/)
})

test("physical inspection requires every explicit check to pass", () => {
  const inspection = parseInspectionInput(form({ ...inspectionChecks, inspectionNotes: "Screen protector removed" }))
  assert.equal(inspection.display_passed, true)
  assert.equal(inspection.activation_lock_cleared, true)
  assert.equal(inspection.notes, "Screen protector removed")

  const incomplete = { ...inspectionChecks }
  delete incomplete.camerasPassed
  assert.throws(() => parseInspectionInput(form(incomplete)), /every physical inspection check/)
  assert.throws(() => parseInspectionInput(form({ ...inspectionChecks, inspectionNotes: "line\nbreak" })), /control characters/)
})

test("individual and batch receiving derive the same structured device payload", () => {
  const common = {
    lineId: "70000000-0000-4000-8000-000000000001",
    colour: "  Natural Titanium  ",
    condition: "excellent",
    batteryHealth: "98",
    ...inspectionChecks,
    inspectionNotes: "Checked in store",
  }
  const individual = parseIndividualDeviceInput(form({ ...common, imei: "35 7000-000 000 017" }))
  assert.equal(individual.imei, "357000000000017")
  assert.equal(individual.colour, "Natural Titanium")
  assert.equal(individual.battery_health, 98)
  assert.equal(individual.inspection.charging_port_passed, true)

  const batch = parseBatchDeviceInput(form({ ...common, imeiBatch: "357000000000025\n357000000000033" }))
  assert.equal(batch.length, 2)
  assert.deepEqual(batch.map((device) => device.imei), ["357000000000025", "357000000000033"])
  assert.deepEqual(batch.map((device) => device.inspection), [individual.inspection, individual.inspection])
})

test("invoice, model, correction, activation, and repricing inputs are strictly bounded", () => {
  assert.deepEqual(parseModelRegistrationInput(form({ modelName: "  iPhone 16 Pro ", storageGb: "256", supplierSku: "apl-16p" })), {
    modelName: "iPhone 16 Pro",
    storageGb: 256,
    supplierSku: "APL-16P",
  })
  assert.deepEqual(parseSupplierInvoiceInput(form({ supplierName: "Approved Supplier", invoiceNumber: "SUP-2026-001", invoiceDate: "2026-11-23", notes: "  Delivery 1 " })), {
    supplierName: "Approved Supplier",
    invoiceNumber: "SUP-2026-001",
    invoiceDate: "2026-11-23",
    notes: "Delivery 1",
  })
  assert.equal(parseInvoiceLineInput(form({
    invoiceId: "70000000-0000-4000-8000-000000000001",
    modelCatalogueId: "70000000-0000-4000-8000-000000000002",
    quantityInvoiced: "5",
    unitCostGhs: "7000.00",
    notes: "",
  })).unitCostPesewas, 700000)

  const correction = parseInvoiceCorrectionInput(form({
    invoiceId: "70000000-0000-4000-8000-000000000001",
    supplierName: "Approved Supplier",
    invoiceNumber: "SUP-2026-001A",
    invoiceDate: "2026-11-23",
    notes: "",
    reason: "Supplier reissued the invoice",
  }))
  assert.equal(correction.reason, "Supplier reissued the invoice")

  const lineCorrection = parseInvoiceLineCorrectionInput(form({
    lineId: "70000000-0000-4000-8000-000000000003",
    quantityInvoiced: "8",
    unitCostGhs: "7050.50",
    reason: "Quantity amended before delivery",
  }))
  assert.equal(lineCorrection.unitCostPesewas, 705050)

  assert.throws(() => parseSupplierInvoiceInput(form({ supplierName: "Approved Supplier", invoiceNumber: "SUP-1", invoiceDate: "2026-02-30", notes: "" })), /valid invoice date/)
  assert.throws(() => parseInvoiceLineInput(form({
    invoiceId: "not-a-uuid",
    modelCatalogueId: "70000000-0000-4000-8000-000000000002",
    quantityInvoiced: "1",
    unitCostGhs: "1.00",
    notes: "",
  })), /valid invoice/)
  assert.throws(() => parseInvoiceLineCorrectionInput(form({
    lineId: "70000000-0000-4000-8000-000000000003",
    quantityInvoiced: "1",
    unitCostGhs: "0",
    reason: "Cost cannot be zero",
  })), /greater than zero/)
  assert.throws(() => parseActivationInput(form({ unitId: "70000000-0000-4000-8000-000000000004", approvedPriceGhs: "8500" })), /approved/)
  assert.deepEqual(parseActivationInput(form({ unitId: "70000000-0000-4000-8000-000000000004", approvedPriceGhs: "8500", priceConfirmed: "on" })), {
    unitId: "70000000-0000-4000-8000-000000000004",
    approvedPricePesewas: 850000,
  })
  assert.deepEqual(parseRepricingInput(form({
    unitId: "70000000-0000-4000-8000-000000000004",
    expectedPriceGhs: "8500.00",
    newPriceGhs: "8750.00",
    reason: "Approved market adjustment",
    priceConfirmed: "on",
  })), {
    unitId: "70000000-0000-4000-8000-000000000004",
    expectedPricePesewas: 850000,
    newPricePesewas: 875000,
    reason: "Approved market adjustment",
  })
})

test("purchase cost permission and quantity summaries remain separate", () => {
  assert.equal(canViewPurchaseCost(["access_manager_workspace", "manage_inventory"]), true)
  assert.equal(canViewPurchaseCost(["access_manager_workspace"]), false)
  assert.equal(canViewPurchaseCost(["manage_inventory"]), false)

  assert.deepEqual(summarizeOpeningStockQuantities([
    { quantityInvoiced: 5, quantityReceived: 3, quantityStaged: 1, quantityActivated: 2, quantityOutstanding: 2 },
    { quantityInvoiced: 2, quantityReceived: 2, quantityStaged: 2, quantityActivated: 0, quantityOutstanding: 0 },
  ]), {
    quantityInvoiced: 7,
    quantityReceived: 5,
    quantityStaged: 3,
    quantityActivated: 2,
    quantityOutstanding: 2,
  })
})
