import assert from "node:assert/strict"
import test from "node:test"

import {
  formatPesewas,
  matchesCustomerSearch,
  matchesSaleSearch,
  normalizeCustomerInput,
  parseGhsToPesewas,
  saleStatusLabel,
} from "../src/lib/sales.ts"

test("customer creation input accepts practical Ghana phone formats and normalizes optional fields", () => {
  assert.deepEqual(normalizeCustomerInput({
    fullName: "  Ama   Mensah ",
    phone: " 024 123 4567 ",
    email: " AMA@EXAMPLE.COM ",
    notes: "  Repeat customer  ",
  }), {
    fullName: "Ama Mensah",
    phone: "024 123 4567",
    email: "ama@example.com",
    notes: "Repeat customer",
  })
  assert.equal(normalizeCustomerInput({ fullName: "Kojo", phone: "+233 24 123 4567", email: "", notes: "" }).phone, "+233 24 123 4567")
  assert.throws(() => normalizeCustomerInput({ fullName: "A", phone: "not-a-phone", email: "", notes: "" }), /Customer name/)
})

test("customer search matches name, phone and email without cross-record assumptions", () => {
  const customer = { fullName: "Ama Mensah", phone: "024 123 4567", email: "ama@example.com" }
  assert.equal(matchesCustomerSearch(customer, "mensah"), true)
  assert.equal(matchesCustomerSearch(customer, "123 4567"), true)
  assert.equal(matchesCustomerSearch(customer, "AMA@EXAMPLE"), true)
  assert.equal(matchesCustomerSearch(customer, "other"), false)
})

test("GHS entry is converted to integer pesewas without floating point arithmetic", () => {
  assert.equal(parseGhsToPesewas("0"), 0)
  assert.equal(parseGhsToPesewas("350"), 35000)
  assert.equal(parseGhsToPesewas("12.5"), 1250)
  assert.equal(parseGhsToPesewas("12.05"), 1205)
  assert.throws(() => parseGhsToPesewas("12.345"), /valid Ghana cedi/)
  assert.equal(formatPesewas(850000).includes("8,500.00"), true)
})

test("manager sale search covers persistent identifiers, customer, employee, item and IMEI", () => {
  const sale = {
    saleNumber: "ME-20261123-A1B2C3D4",
    customerName: "Walk-in Test",
    employeeName: "Sales Employee",
    itemDescriptions: ["iPhone 15 Pro · 256GB"],
    imeis: ["358240051111110"],
  }
  for (const query of ["A1B2", "walk-in", "employee", "15 pro", "111110"]) {
    assert.equal(matchesSaleSearch(sale, query), true)
  }
  assert.equal(matchesSaleSearch(sale, "unrelated"), false)
})

test("sale statuses never label an unpaid record as paid or completed", () => {
  assert.equal(saleStatusLabel("draft"), "Draft")
  assert.equal(saleStatusLabel("awaiting_payment"), "Awaiting payment")
  assert.equal(saleStatusLabel("cancelled"), "Cancelled")
})
