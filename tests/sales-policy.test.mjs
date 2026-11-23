import assert from "node:assert/strict"
import test from "node:test"

import {
  formatPesewas,
  matchesCustomerSearch,
  matchesSaleSearch,
  normalizeCustomerInput,
  parseGhsToPesewas,
  parsePaymentMethod,
  paymentMethodLabel,
  resolveSaleCompletion,
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

test("manual payment accepts exactly the three supported single-tender methods", () => {
  assert.equal(paymentMethodLabel(parsePaymentMethod("mobile_money")), "Mobile Money")
  assert.equal(paymentMethodLabel(parsePaymentMethod("cash")), "Cash")
  assert.equal(paymentMethodLabel(parsePaymentMethod("bank_transfer")), "Bank transfer")
  assert.throws(() => parsePaymentMethod("card"), /supported payment method/)
  assert.throws(() => parsePaymentMethod(null), /supported payment method/)
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

test("sale statuses distinguish unpaid records from persisted completion", () => {
  assert.equal(saleStatusLabel("draft"), "Draft")
  assert.equal(saleStatusLabel("awaiting_payment"), "Awaiting payment")
  assert.equal(saleStatusLabel("completed"), "Completed")
  assert.equal(saleStatusLabel("cancelled"), "Cancelled")
})

const completionSaleId = "65000000-0000-4000-8000-000000000001"

async function presentationFromDirectCompletionNavigation(status, hasConfirmedPayment = false) {
  const url = new URL(`/new-sale/complete?sale=${completionSaleId}`, "https://pos.example.test")
  assert.equal(url.pathname, "/new-sale/complete")

  let requestedSaleId = null
  const completion = await resolveSaleCompletion(
    url.searchParams.get("sale") ?? undefined,
    async (saleId) => {
      requestedSaleId = saleId
      return {
        id: saleId,
        status,
        totalPesewas: 850000,
        completedAt: status === "completed" ? "2026-11-23T12:00:00.000Z" : null,
        payment: hasConfirmedPayment
          ? { status: "confirmed", amountPesewas: 850000, currency: "GHS" }
          : null,
      }
    }
  )

  assert.equal(requestedSaleId, completionSaleId)
  assert.equal(completion.sale.id, completionSaleId)
  return completion.presentation
}

test("direct completion navigation rejects an awaiting-payment sale", async () => {
  const presentation = await presentationFromDirectCompletionNavigation("awaiting_payment")

  assert.equal(presentation.isSuccess, false)
  assert.equal(presentation.title, "This sale is not complete.")
  assert.equal(presentation.amountLabel, "Amount due")
  assert.equal(presentation.actionHref, `/new-sale/payment?sale=${completionSaleId}`)
  assert.match(presentation.description, /no completed payment/i)
})

test("direct completion navigation rejects a draft and links back to it", async () => {
  const presentation = await presentationFromDirectCompletionNavigation("draft")

  assert.equal(presentation.isSuccess, false)
  assert.equal(presentation.title, "This sale is not complete.")
  assert.equal(presentation.actionLabel, "Return to sale")
  assert.equal(presentation.actionHref, `/new-sale?sale=${completionSaleId}`)
})

test("direct completion navigation rejects cancellation", async () => {
  const presentation = await presentationFromDirectCompletionNavigation("cancelled")

  assert.equal(presentation.isSuccess, false)
  assert.equal(presentation.title, "This sale was cancelled.")
  assert.match(presentation.description, /reservations were released/i)
  assert.equal(presentation.actionHref, "/new-sale")
})

test("completed status without its persisted payment cannot show success", async () => {
  const presentation = await presentationFromDirectCompletionNavigation("completed")

  assert.equal(presentation.isSuccess, false)
  assert.equal(presentation.title, "This sale is not complete.")
  assert.match(presentation.description, /does not have a matching persisted payment/i)
})

test("only completed state plus persisted confirmed payment shows success", async () => {
  const presentation = await presentationFromDirectCompletionNavigation("completed", true)

  assert.equal(presentation.isSuccess, true)
  assert.equal(presentation.title, "Sale complete.")
  assert.equal(presentation.amountLabel, "Amount received")
  assert.match(presentation.description, /full payment and completed sale are persisted/i)
})
