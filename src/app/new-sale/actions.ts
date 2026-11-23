"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissions } from "@/lib/auth/server"
import { normalizeCustomerInput, parseGhsToPesewas } from "@/lib/sales"
import { createClient } from "@/lib/supabase/server"

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function formUuid(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? "")
  if (!uuidPattern.test(value)) throw new Error(`Invalid ${name}.`)
  return value
}

function firstRow(value: unknown) {
  return Array.isArray(value) && value.length > 0 && value[0] && typeof value[0] === "object"
    ? (value[0] as Record<string, unknown>)
    : null
}

function refreshSalePages() {
  revalidatePath("/new-sale")
  revalidatePath("/new-sale/customer-info")
  revalidatePath("/new-sale/checkout")
  revalidatePath("/new-sale/complete")
  revalidatePath("/manager/sales")
}

export async function createSaleDraftAction() {
  const { membership } = await requirePermissions(["create_sales"], { nextPath: "/new-sale" })
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("create_sale_draft", { p_store_id: membership.storeId })
  const row = firstRow(data)
  if (error || typeof row?.sale_id !== "string") redirect("/new-sale?error=draft-create-failed")
  refreshSalePages()
  redirect(`/new-sale?sale=${encodeURIComponent(row.sale_id)}&notice=draft-created`)
}

export async function addSaleItemAction(formData: FormData) {
  await requirePermissions(["create_sales", "reserve_inventory"], { nextPath: "/new-sale" })
  const saleId = formUuid(formData, "saleId")
  const deviceId = formUuid(formData, "deviceId")
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("add_sale_item", {
    p_sale_id: saleId,
    p_device_id: deviceId,
  })
  const result = firstRow(data)?.result
  if (error) redirect(`/new-sale?sale=${encodeURIComponent(saleId)}&error=item-add-failed`)
  if (result === "reserved_in_another_draft") {
    redirect(`/new-sale?sale=${encodeURIComponent(saleId)}&error=reserved-in-another-draft`)
  }
  if (!["added", "already_added"].includes(String(result))) {
    redirect(`/new-sale?sale=${encodeURIComponent(saleId)}&error=device-unavailable`)
  }
  refreshSalePages()
  redirect(`/new-sale?sale=${encodeURIComponent(saleId)}&notice=item-added`)
}

export async function removeSaleItemAction(formData: FormData) {
  await requirePermissions(["create_sales", "reserve_inventory"], { nextPath: "/new-sale" })
  const saleId = formUuid(formData, "saleId")
  const saleItemId = formUuid(formData, "saleItemId")
  const supabase = await createClient()
  const { error } = await supabase.rpc("remove_sale_item", {
    p_sale_id: saleId,
    p_sale_item_id: saleItemId,
  })
  if (error) redirect(`/new-sale?sale=${encodeURIComponent(saleId)}&error=item-remove-failed`)
  refreshSalePages()
  redirect(`/new-sale?sale=${encodeURIComponent(saleId)}&notice=item-removed`)
}

export async function updateSaleItemDiscountAction(formData: FormData) {
  await requirePermissions(["create_sales", "approve_discounts"], { nextPath: "/new-sale" })
  const saleId = formUuid(formData, "saleId")
  const saleItemId = formUuid(formData, "saleItemId")
  let discountPesewas: number
  try {
    discountPesewas = parseGhsToPesewas(formData.get("discountGhs"))
  } catch {
    redirect(`/new-sale?sale=${encodeURIComponent(saleId)}&error=invalid-discount`)
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc("set_sale_item_discount", {
    p_sale_id: saleId,
    p_sale_item_id: saleItemId,
    p_discount_pesewas: discountPesewas!,
  })
  if (error) redirect(`/new-sale?sale=${encodeURIComponent(saleId)}&error=discount-failed`)
  refreshSalePages()
  redirect(`/new-sale?sale=${encodeURIComponent(saleId)}&notice=discount-updated`)
}

export async function selectSaleCustomerAction(formData: FormData) {
  await requirePermissions(["create_sales"], { nextPath: "/new-sale/customer-info" })
  const saleId = formUuid(formData, "saleId")
  const customerValue = String(formData.get("customerId") ?? "")
  const customerId = customerValue ? formUuid(formData, "customerId") : null
  const supabase = await createClient()
  const { error } = await supabase.rpc("set_sale_customer", {
    p_sale_id: saleId,
    p_customer_id: customerId,
  })
  if (error) redirect(`/new-sale/customer-info?sale=${encodeURIComponent(saleId)}&error=customer-select-failed`)
  refreshSalePages()
  redirect(`/new-sale/customer-info?sale=${encodeURIComponent(saleId)}&notice=customer-selected`)
}

export async function createSaleCustomerAction(formData: FormData) {
  await requirePermissions(["create_sales"], { nextPath: "/new-sale/customer-info" })
  const saleId = formUuid(formData, "saleId")
  let customer
  try {
    customer = normalizeCustomerInput({
      fullName: String(formData.get("fullName") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      email: String(formData.get("email") ?? ""),
      notes: String(formData.get("notes") ?? ""),
    })
  } catch {
    redirect(`/new-sale/customer-info?sale=${encodeURIComponent(saleId)}&error=invalid-customer`)
  }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("create_sale_customer", {
    p_sale_id: saleId,
    p_full_name: customer!.fullName,
    p_phone: customer!.phone,
    p_email: customer!.email || null,
    p_notes: customer!.notes || null,
  })
  const result = firstRow(data)?.result
  if (error) redirect(`/new-sale/customer-info?sale=${encodeURIComponent(saleId)}&error=customer-create-failed`)
  refreshSalePages()
  redirect(`/new-sale/customer-info?sale=${encodeURIComponent(saleId)}&notice=${result === "existing" ? "customer-existing" : "customer-created"}`)
}

export async function submitSaleForPaymentAction(formData: FormData) {
  await requirePermissions(["create_sales"], { nextPath: "/new-sale/checkout" })
  const saleId = formUuid(formData, "saleId")
  const supabase = await createClient()
  const { error } = await supabase.rpc("submit_sale_for_payment", { p_sale_id: saleId })
  if (error) redirect(`/new-sale/checkout?sale=${encodeURIComponent(saleId)}&error=submit-failed`)
  refreshSalePages()
  redirect(`/new-sale/complete?sale=${encodeURIComponent(saleId)}`)
}

export async function cancelSaleAction(formData: FormData) {
  await requirePermissions(["create_sales"], { nextPath: "/new-sale" })
  const saleId = formUuid(formData, "saleId")
  const reason = String(formData.get("reason") ?? "cancelled by employee").trim()
  const supabase = await createClient()
  const { error } = await supabase.rpc("cancel_sale_draft", {
    p_sale_id: saleId,
    p_reason: reason || "cancelled by employee",
  })
  if (error) redirect(`/new-sale?sale=${encodeURIComponent(saleId)}&error=cancel-failed`)
  refreshSalePages()
  redirect("/new-sale?notice=sale-cancelled")
}

export async function expireSaleDraftsAction() {
  const { membership } = await requirePermissions(["create_sales"], { nextPath: "/new-sale" })
  const supabase = await createClient()
  await supabase.rpc("expire_sale_drafts", { p_store_id: membership.storeId, p_limit: 50 })
  refreshSalePages()
  redirect("/new-sale?notice=expired-drafts-cleared")
}
