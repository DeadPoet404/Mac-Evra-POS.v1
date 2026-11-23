import assert from "node:assert/strict"
import test from "node:test"

import {
  employeeSaleStepHref,
  findInventoryByImei,
  normalizeImeiEntry,
} from "../src/lib/sale-journey.ts"

const saleId = "65000000-0000-4000-8000-000000000001"

test("the simplified employee journey uses four focused sale routes", () => {
  assert.deepEqual(
    ["imei", "customer", "review", "status"].map((step) => employeeSaleStepHref(step, saleId)),
    [
      `/new-sale?sale=${saleId}`,
      `/new-sale/customer-info?sale=${saleId}`,
      `/new-sale/checkout?sale=${saleId}`,
      `/new-sale/complete?sale=${saleId}`,
    ]
  )
})

test("sale journey links safely encode persisted sale identifiers", () => {
  assert.equal(
    employeeSaleStepHref("customer", "sale/id?unsafe=true"),
    "/new-sale/customer-info?sale=sale%2Fid%3Funsafe%3Dtrue"
  )
  assert.equal(employeeSaleStepHref("imei"), "/new-sale")
})

test("IMEI entry removes formatting without hiding extra digits", () => {
  assert.equal(normalizeImeiEntry("35 8240-051 111 110"), "358240051111110")
  assert.equal(normalizeImeiEntry("358240051111110999"), "358240051111110999")
})

test("IMEI verification returns only an exact authorized inventory match", () => {
  const inventory = [
    { imei: "358240051111110", model: "iPhone 15 Pro" },
    { imei: "358240051111128", model: "iPhone 14" },
  ]

  assert.equal(findInventoryByImei(inventory, "358240051111110")?.model, "iPhone 15 Pro")
  assert.equal(findInventoryByImei(inventory, "35824005111111"), null)
  assert.equal(findInventoryByImei(inventory, "358240051111119"), null)
})
