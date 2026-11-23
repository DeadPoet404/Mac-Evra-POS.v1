import assert from "node:assert/strict"
import test from "node:test"

import * as tradeInPolicy from "../src/lib/trade-in.ts"

const {
  isTradeInInventoryEligible,
  isValidImei,
  matchesTradeInSearch,
  normalizeMeaningfulNote,
  normalizeProposedOffer,
  normalizeTradeInCustomer,
  normalizeTradeInDevice,
  normalizeTradeInInspection,
  tradeInNextAction,
  tradeInResumeStep,
} = tradeInPolicy

test("trade-in intake uses exact IMEI Luhn validation and supported serial identity without invention", () => {
  assert.equal(isValidImei("490154203237518"), true)
  assert.equal(isValidImei("490154203237519"), false)
  assert.equal(isValidImei("49015420323751"), false)
  assert.equal(normalizeTradeInDevice({
    brand: " Apple ", model: " iPhone 13 Pro ", storageGb: "256", colour: " Sierra Blue ",
    identifierType: "imei", identifier: "490154203237518",
  }).identifier, "490154203237518")
  assert.deepEqual(normalizeTradeInDevice({
    brand: "Apple", model: "WiFi Tablet", storageGb: "128", colour: "Silver",
    identifierType: "serial", identifier: " sn-ab_123 ",
  }), {
    brand: "Apple",
    model: "WiFi Tablet",
    storageGb: 128,
    colour: "Silver",
    identifierType: "serial",
    identifier: "SN-AB_123",
  })
  assert.throws(() => normalizeTradeInDevice({
    brand: "Apple", model: "Phone", storageGb: "128", colour: "Blue",
    identifierType: "imei", identifier: "490154203237519",
  }), /valid 15-digit Luhn IMEI/)
})

test("customer and structured inspection inputs normalize while preserving explicit unknown and not-tested values", () => {
  assert.deepEqual(normalizeTradeInCustomer({
    fullName: "  Ama   Mensah ", phone: " 024 123 4567 ", email: " AMA@EXAMPLE.COM ",
  }), { fullName: "Ama Mensah", phone: "024 123 4567", email: "ama@example.com" })

  const inspection = normalizeTradeInInspection({
    cosmeticCondition: "unknown",
    displayCheck: "not_tested",
    batteryCheck: "unknown",
    batteryHealth: "",
    camerasCheck: "not_tested",
    buttonsCheck: "unknown",
    connectivityCheck: "not_tested",
    biometricCheck: "not_applicable",
    activationLockCheck: "unknown",
    otherFunctionalCheck: "not_tested",
    notes: "  Needs   manager review  ",
  })
  assert.equal(inspection.cosmeticCondition, "unknown")
  assert.equal(inspection.displayCheck, "not_tested")
  assert.equal(inspection.batteryHealth, null)
  assert.equal(inspection.notes, "Needs manager review")
})

test("proposed offers convert exact GHS input to integer pesewas without any automatic valuation", () => {
  assert.equal(normalizeProposedOffer("2400"), 240000)
  assert.equal(normalizeProposedOffer("2400.05"), 240005)
  assert.equal(normalizeProposedOffer("0.01"), 1)
  assert.throws(() => normalizeProposedOffer("24.005"), /no more than two decimal/)
  assert.throws(() => normalizeProposedOffer("0"), /positive proposed offer/)
  assert.equal("calculateDemoValuation" in tradeInPolicy, false)
})

test("the guided journey resumes at persisted progress and never lets a URL skip an unsaved step", () => {
  assert.equal(tradeInResumeStep(1), 1)
  assert.equal(tradeInResumeStep(3), 3)
  assert.equal(tradeInResumeStep(3, "2"), 2)
  assert.equal(tradeInResumeStep(2, "4"), 2)
  assert.equal(tradeInResumeStep(9, "4"), 4)
  assert.equal(tradeInResumeStep(Number.NaN, "3"), 1)
  assert.match(tradeInNextAction("draft", 1), /customer details/i)
  assert.match(tradeInNextAction("draft", 4), /non-final proposed offer/i)
  assert.match(tradeInNextAction("pending", 4), /different authorised manager/i)
  assert.match(tradeInNextAction("approved", 4), /Inventory remains unchanged/i)
})

test("sellable inventory eligibility fails closed for serial, unknown, not-tested, issues, and absent battery health", () => {
  const eligible = {
    identifierType: "imei",
    cosmeticCondition: "good",
    displayCheck: "pass",
    batteryCheck: "pass",
    batteryHealth: 90,
    camerasCheck: "pass",
    buttonsCheck: "pass",
    connectivityCheck: "pass",
    biometricCheck: "not_applicable",
    activationLockCheck: "pass",
    otherFunctionalCheck: "pass",
  }
  assert.equal(isTradeInInventoryEligible(eligible), true)
  assert.equal(isTradeInInventoryEligible({ ...eligible, identifierType: "serial" }), false)
  assert.equal(isTradeInInventoryEligible({ ...eligible, displayCheck: "unknown" }), false)
  assert.equal(isTradeInInventoryEligible({ ...eligible, camerasCheck: "issue" }), false)
  assert.equal(isTradeInInventoryEligible({ ...eligible, batteryHealth: null }), false)
})

test("manager queue search covers request, customer, requester, device, IMEI, and serial", () => {
  const request = {
    requestNumber: "TI-20261123-ABC12345",
    customerName: "Ama Mensah",
    customerPhone: "024 123 4567",
    requesterName: "Kojo Employee",
    deviceBrand: "Apple",
    deviceModel: "iPhone 13 Pro",
    imei: "490154203237518",
    serialNumber: null,
  }
  for (const query of ["ABC12345", "Mensah", "123 4567", "Kojo", "iPhone 13", "490154203237518"]) {
    assert.equal(matchesTradeInSearch(request, query), true)
  }
  assert.equal(matchesTradeInSearch(request, "unrelated"), false)
})

test("manager and intake notes enforce meaningful bounded audit content", () => {
  assert.equal(normalizeMeaningfulNote("  Physically   matched exact IMEI  ", "Intake note"), "Physically matched exact IMEI")
  assert.throws(() => normalizeMeaningfulNote("too short", "Decision note"), /between 10 and 1,000/)
})
