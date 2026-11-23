"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissions } from "@/lib/auth/server"
import { createClient } from "@/lib/supabase/server"
import {
  normalizeMeaningfulNote,
  normalizeProposedOffer,
  normalizeTradeInCustomer,
  normalizeTradeInDevice,
  normalizeTradeInInspection,
} from "@/lib/trade-in"

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

function tradeInPath(requestId: string, suffix: string) {
  return `/trade-in?request=${encodeURIComponent(requestId)}&${suffix}`
}

function refreshTradeIns() {
  revalidatePath("/trade-in")
  revalidatePath("/manager/approvals")
  revalidatePath("/manager/inventory")
  revalidatePath("/inventory")
}

export async function createTradeInDraftAction() {
  const { membership } = await requirePermissions(["access_employee_workspace", "process_trade_ins"], {
    nextPath: "/trade-in",
  })
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("create_trade_in_draft", { p_store_id: membership.storeId })
  const row = firstRow(data)
  if (error || typeof row?.request_id !== "string") redirect("/trade-in?error=draft-create-failed")
  refreshTradeIns()
  redirect(tradeInPath(row.request_id, `notice=${row.result === "resumed" ? "draft-resumed" : "draft-created"}`))
}

export async function saveTradeInCustomerAction(formData: FormData) {
  await requirePermissions(["access_employee_workspace", "process_trade_ins"], { nextPath: "/trade-in" })
  const requestId = formUuid(formData, "requestId")
  let customer
  try {
    customer = normalizeTradeInCustomer({
      fullName: formData.get("fullName"),
      phone: formData.get("phone"),
      email: formData.get("email"),
    })
  } catch {
    redirect(tradeInPath(requestId, "error=invalid-customer&step=1"))
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc("save_trade_in_customer", {
    p_request_id: requestId,
    p_full_name: customer!.fullName,
    p_phone: customer!.phone,
    p_email: customer!.email || null,
  })
  if (error) redirect(tradeInPath(requestId, "error=customer-save-failed&step=1"))
  refreshTradeIns()
  redirect(tradeInPath(requestId, "notice=customer-saved&step=2"))
}

export async function saveTradeInDeviceAction(formData: FormData) {
  await requirePermissions(["access_employee_workspace", "process_trade_ins"], { nextPath: "/trade-in" })
  const requestId = formUuid(formData, "requestId")
  let device
  try {
    device = normalizeTradeInDevice({
      brand: formData.get("brand"),
      model: formData.get("model"),
      storageGb: formData.get("storageGb"),
      colour: formData.get("colour"),
      identifierType: formData.get("identifierType"),
      identifier: formData.get("identifier"),
    })
  } catch {
    redirect(tradeInPath(requestId, "error=invalid-device&step=2"))
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc("save_trade_in_device", {
    p_request_id: requestId,
    p_brand: device!.brand,
    p_model: device!.model,
    p_storage_gb: device!.storageGb,
    p_colour: device!.colour,
    p_identifier_type: device!.identifierType,
    p_identifier: device!.identifier,
  })
  if (error?.code === "23505") redirect(tradeInPath(requestId, "error=identifier-in-use&step=2"))
  if (error) redirect(tradeInPath(requestId, "error=device-save-failed&step=2"))
  refreshTradeIns()
  redirect(tradeInPath(requestId, "notice=device-saved&step=3"))
}

export async function saveTradeInInspectionAction(formData: FormData) {
  await requirePermissions(["access_employee_workspace", "process_trade_ins"], { nextPath: "/trade-in" })
  const requestId = formUuid(formData, "requestId")
  let inspection
  try {
    inspection = normalizeTradeInInspection({
      cosmeticCondition: formData.get("cosmeticCondition"),
      displayCheck: formData.get("displayCheck"),
      batteryCheck: formData.get("batteryCheck"),
      batteryHealth: formData.get("batteryHealth"),
      camerasCheck: formData.get("camerasCheck"),
      buttonsCheck: formData.get("buttonsCheck"),
      connectivityCheck: formData.get("connectivityCheck"),
      biometricCheck: formData.get("biometricCheck"),
      activationLockCheck: formData.get("activationLockCheck"),
      otherFunctionalCheck: formData.get("otherFunctionalCheck"),
      notes: formData.get("notes"),
    })
  } catch {
    redirect(tradeInPath(requestId, "error=invalid-inspection&step=3"))
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc("save_trade_in_inspection", {
    p_request_id: requestId,
    p_cosmetic_condition: inspection!.cosmeticCondition,
    p_display_check: inspection!.displayCheck,
    p_battery_check: inspection!.batteryCheck,
    p_battery_health: inspection!.batteryHealth,
    p_cameras_check: inspection!.camerasCheck,
    p_buttons_check: inspection!.buttonsCheck,
    p_connectivity_check: inspection!.connectivityCheck,
    p_biometric_check: inspection!.biometricCheck,
    p_activation_lock_check: inspection!.activationLockCheck,
    p_other_functional_check: inspection!.otherFunctionalCheck,
    p_notes: inspection!.notes || null,
  })
  if (error) redirect(tradeInPath(requestId, "error=inspection-save-failed&step=3"))
  refreshTradeIns()
  redirect(tradeInPath(requestId, "notice=inspection-saved&step=4"))
}

export async function submitTradeInAction(formData: FormData) {
  await requirePermissions(["access_employee_workspace", "process_trade_ins"], { nextPath: "/trade-in" })
  const requestId = formUuid(formData, "requestId")
  let offer: number
  const notes = String(formData.get("supportingNotes") ?? "").trim()
  try {
    offer = normalizeProposedOffer(formData.get("proposedOfferGhs"))
    if (notes.length > 2000) throw new Error("Supporting notes too long.")
  } catch {
    redirect(tradeInPath(requestId, "error=invalid-offer&step=4"))
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc("submit_trade_in_request", {
    p_request_id: requestId,
    p_proposed_offer_pesewas: offer!,
    p_supporting_notes: notes || null,
  })
  if (error) redirect(tradeInPath(requestId, "error=submit-failed&step=4"))
  refreshTradeIns()
  redirect(tradeInPath(requestId, "notice=submitted"))
}

export async function decideTradeInAction(formData: FormData) {
  await requirePermissions(
    ["access_manager_workspace", "review_approvals", "approve_trade_ins"],
    { nextPath: "/manager/approvals" }
  )
  const requestId = formUuid(formData, "requestId")
  const decision = String(formData.get("decision") ?? "")
  let decisionNote: string
  try {
    if (decision !== "approved" && decision !== "declined") throw new Error("Invalid decision.")
    decisionNote = normalizeMeaningfulNote(formData.get("decisionNote"), "Decision note")
  } catch {
    redirect(`/manager/approvals?request=${encodeURIComponent(requestId)}&error=invalid-decision`)
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc("decide_trade_in_request", {
    p_request_id: requestId,
    p_decision: decision,
    p_decision_note: decisionNote!,
  })
  if (error?.message.includes("own trade-in")) {
    redirect(`/manager/approvals?request=${encodeURIComponent(requestId)}&error=self-decision`)
  }
  if (error?.code === "23514") {
    redirect(`/manager/approvals?request=${encodeURIComponent(requestId)}&error=already-decided`)
  }
  if (error) redirect(`/manager/approvals?request=${encodeURIComponent(requestId)}&error=decision-failed`)
  refreshTradeIns()
  redirect(`/manager/approvals?status=${decision}&request=${encodeURIComponent(requestId)}&notice=${decision}`)
}

export async function intakeTradeInAction(formData: FormData) {
  await requirePermissions(
    ["access_manager_workspace", "review_approvals", "manage_inventory"],
    { nextPath: "/manager/approvals" }
  )
  const requestId = formUuid(formData, "requestId")
  let sellingPricePesewas: number
  let intakeNote: string
  try {
    sellingPricePesewas = normalizeProposedOffer(formData.get("sellingPriceGhs"))
    intakeNote = normalizeMeaningfulNote(formData.get("intakeNote"), "Physical intake note")
    if (formData.get("identityConfirmed") !== "yes" || formData.get("conditionConfirmed") !== "yes") {
      throw new Error("Physical confirmations required.")
    }
  } catch {
    redirect(`/manager/approvals?request=${encodeURIComponent(requestId)}&error=invalid-intake`)
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc("intake_approved_trade_in", {
    p_request_id: requestId,
    p_selling_price_pesewas: sellingPricePesewas!,
    p_identity_confirmed: true,
    p_condition_confirmed: true,
    p_intake_note: intakeNote!,
  })
  if (error?.code === "23505") {
    redirect(`/manager/approvals?request=${encodeURIComponent(requestId)}&error=identifier-in-inventory`)
  }
  if (error?.code === "23514") {
    redirect(`/manager/approvals?request=${encodeURIComponent(requestId)}&error=intake-ineligible`)
  }
  if (error) redirect(`/manager/approvals?request=${encodeURIComponent(requestId)}&error=intake-failed`)
  refreshTradeIns()
  redirect(`/manager/approvals?status=intaken&request=${encodeURIComponent(requestId)}&notice=intaken`)
}
