import assert from "node:assert/strict"
import test from "node:test"

import {
  employeeSaleResumeStep,
  employeeSaleStepHref,
  findInventoryByImei,
  normalizeImeiEntry,
} from "../src/lib/sale-journey.ts"

const saleId = "65000000-0000-4000-8000-000000000001"

test("the employee journey uses the exact IMEI, payment, customer, complete route order", () => {
  assert.deepEqual(
    ["imei", "payment", "customer", "complete"].map((step) => employeeSaleStepHref(step, saleId)),
    [
      `/new-sale?sale=${saleId}`,
      `/new-sale/payment?sale=${saleId}`,
      `/new-sale/customer-info?sale=${saleId}`,
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

test("an unfinished sale resumes from persisted payment and customer progress", () => {
  assert.equal(employeeSaleResumeStep(0, false, false), "imei")
  assert.equal(employeeSaleResumeStep(1, false, false), "payment")
  assert.equal(employeeSaleResumeStep(1, true, false), "customer")
  assert.equal(employeeSaleResumeStep(1, true, true), "complete")
  assert.equal(employeeSaleResumeStep(2, true, true), "imei")
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
