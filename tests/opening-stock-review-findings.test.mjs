import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import test from "node:test"

import { routeRequirement } from "../src/lib/auth/policy.ts"
import { summarizeInventoryStatuses } from "../src/lib/inventory-status.ts"
import {
  parseBatchDeviceInput,
  parseSupplierInvoiceInput,
  summarizeOpeningStockInvoiceReconciliation,
} from "../src/lib/opening-stock.ts"

function read(relativePath) {
  return readFileSync(path.resolve(relativePath), "utf8")
}

function managerTsxFiles(directory = "src/app/manager") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return managerTsxFiles(entryPath)
    return entry.name.endsWith(".tsx") ? [entryPath] : []
  })
}

function form(entries) {
  const formData = new FormData()
  for (const [key, value] of Object.entries(entries)) formData.set(key, value)
  return formData
}

function batchForm(rows) {
  const formData = new FormData()
  formData.set("deviceCount", String(rows.length))
  for (const [index, row] of rows.entries()) {
    for (const [key, value] of Object.entries(row)) formData.set(`devices.${index}.${key}`, value)
  }
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

const firstDevice = {
  imei: "357000000000025",
  colour: "Blue",
  condition: "excellent",
  batteryHealth: "98",
  ...inspectionChecks,
  inspectionNotes: "First physical device independently inspected",
}

const secondDevice = {
  imei: "357000000000033",
  colour: "White",
  condition: "good",
  batteryHealth: "91",
  ...inspectionChecks,
  inspectionNotes: "Second physical device independently inspected",
}

test("finding 1: manager inventory is a live Supabase view, not invented sample stock", () => {
  const inventoryPage = read("src/app/manager/inventory/page.tsx")
  const managerFiles = managerTsxFiles()

  assert.match(inventoryPage, /listAuthorizedInventory/)
  assert.match(inventoryPage, /requirePermissions\(\["access_manager_workspace", "manage_inventory"\]/)
  assert.match(inventoryPage, /summarizeInventoryStatuses/)
  assert.match(inventoryPage, /Available/)
  assert.match(inventoryPage, /Reserved/)
  assert.match(inventoryPage, /Sold/)
  assert.match(inventoryPage, /\/manager\/opening-stock/)
  assert.doesNotMatch(inventoryPage, /"use client"/)
  assert.doesNotMatch(inventoryPage, /inventoryPhones/)
  assert.doesNotMatch(inventoryPage, /DemoNotice/)
  assert.doesNotMatch(inventoryPage, /useState/)
  for (const file of managerFiles) {
    assert.doesNotMatch(read(file), /inventoryPhones/, `${file} must not show sample devices as manager inventory`)
  }

  assert.deepEqual(summarizeInventoryStatuses(["available", "reserved", "sold", "available"]), {
    available: 2,
    reserved: 1,
    sold: 1,
    total: 4,
  })
  assert.deepEqual(routeRequirement("/manager/inventory"), {
    protected: true,
    permissions: ["access_manager_workspace", "manage_inventory"],
  })
  assert.deepEqual(routeRequirement("/manager/opening-stock"), {
    protected: true,
    permissions: ["access_manager_workspace", "manage_inventory"],
  })
})

test("finding 2: declared totals reconcile from line totals without application constants", () => {
  const openingStockPage = read("src/app/manager/opening-stock/page.tsx")
  const sourceFiles = [
    "src/app/manager/opening-stock/page.tsx",
    "src/app/manager/opening-stock/actions.ts",
    "src/app/manager/opening-stock/batch-receiving-form.tsx",
    "src/lib/opening-stock.ts",
    "src/lib/opening-stock-server.ts",
  ]

  for (const file of sourceFiles) {
    const source = read(file)
    assert.doesNotMatch(source, /146[,\s]?550|14655000|OSEI|15 lines|48 units/i, `${file} must not hardcode the reviewed invoice`)
  }
  assert.match(openingStockPage, /Declared invoice total reconciliation/)
  assert.match(openingStockPage, /Line total/)
  assert.match(openingStockPage, /Confirm invoice totals/)
  assert.match(openingStockPage, /summarizeOpeningStockInvoiceReconciliation/)
  assert.match(read("src/app/manager/opening-stock/actions.ts"), /confirm_supplier_invoice/)

  const lineSpecs = Array.from({ length: 15 }, (_, index) =>
    index < 14
      ? { quantityInvoiced: 3, unitCostPesewas: 300000 }
      : { quantityInvoiced: 6, unitCostPesewas: 342500 }
  )
  const lines = lineSpecs.map((line) => ({
    ...line,
    lineTotalPesewas: line.quantityInvoiced * line.unitCostPesewas,
    costVisible: true,
  }))
  const declaredTotalPesewas = 146550 * 100

  assert.deepEqual(summarizeOpeningStockInvoiceReconciliation(lines, declaredTotalPesewas), {
    lineCount: 15,
    quantityInvoiced: 48,
    declaredTotalPesewas: 14655000,
    calculatedTotalPesewas: 14655000,
    differencePesewas: 0,
    reconciled: true,
    costVisible: true,
  })
  assert.equal(
    summarizeOpeningStockInvoiceReconciliation(lines, declaredTotalPesewas + 100).reconciled,
    false,
    "A declared total that differs from calculated line totals must not reconcile"
  )
  assert.throws(
    () => summarizeOpeningStockInvoiceReconciliation([{ ...lines[0], lineTotalPesewas: 1 }], declaredTotalPesewas),
    /quantity × unit cost/
  )
})

test("finding 3: supplier invoice number/reference is optional", () => {
  const page = read("src/app/manager/opening-stock/page.tsx")
  assert.match(page, /Invoice number \/ reference · optional/)
  assert.doesNotMatch(page, /name="invoiceNumber" required/)

  const missingField = parseSupplierInvoiceInput(form({
    supplierName: "Approved Supplier",
    invoiceDate: "2026-11-23",
    declaredTotalGhs: "146550.00",
    notes: "",
  }))
  assert.equal(missingField.invoiceNumber, null)
  assert.equal(missingField.declaredTotalPesewas, 14655000)

  const blankField = parseSupplierInvoiceInput(form({
    supplierName: "Approved Supplier",
    invoiceNumber: "   ",
    invoiceDate: "2026-11-23",
    declaredTotalGhs: "1.00",
    notes: "",
  }))
  assert.equal(blankField.invoiceNumber, null)
  assert.throws(
    () => parseSupplierInvoiceInput(form({
      supplierName: "Approved Supplier",
      invoiceNumber: "x",
      invoiceDate: "2026-11-23",
      declaredTotalGhs: "1.00",
      notes: "",
    })),
    /valid supplier invoice number/
  )
})

test("finding 4: batch receiving keeps one device's own details and inspection per IMEI", () => {
  const devices = parseBatchDeviceInput(batchForm([firstDevice, secondDevice]))
  assert.equal(devices.length, 2)
  assert.deepEqual(devices.map((device) => device.imei), ["357000000000025", "357000000000033"])
  assert.deepEqual(devices.map((device) => device.colour), ["Blue", "White"])
  assert.deepEqual(devices.map((device) => device.condition), ["excellent", "good"])
  assert.deepEqual(devices.map((device) => device.battery_health), [98, 91])
  assert.deepEqual(
    devices.map((device) => device.inspection.notes),
    ["First physical device independently inspected", "Second physical device independently inspected"]
  )
  assert.notStrictEqual(devices[0].inspection, devices[1].inspection)

  assert.throws(
    () => parseBatchDeviceInput(form({
      deviceCount: "2",
      imeiBatch: "357000000000025\n357000000000033",
      colour: "Blue",
      condition: "excellent",
      batteryHealth: "98",
      ...inspectionChecks,
    })),
    /own details and inspection/
  )
  assert.throws(
    () => parseBatchDeviceInput(batchForm([
      firstDevice,
      {
        imei: "357000000000033",
        colour: "White",
        condition: "good",
        batteryHealth: "91",
        imeiConfirmed: "on",
        labelsMatch: "on",
      },
    ])),
    /every physical inspection check/
  )
  assert.throws(
    () => parseBatchDeviceInput(batchForm([firstDevice, { ...secondDevice, imei: firstDevice.imei }])),
    /unique/
  )

  const actions = read("src/app/manager/opening-stock/actions.ts")
  assert.match(actions, /"receive_opening_stock_devices"/)
  assert.match(actions, /p_devices: devices/)
  assert.doesNotMatch(actions, /Promise\.all\([\s\S]*receive_opening_stock_device/)
})
