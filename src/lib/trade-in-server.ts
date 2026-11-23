import "server-only"

import { createClient } from "@/lib/supabase/server"
import {
  cosmeticConditions,
  identifierTypes,
  inspectionResults,
  tradeInStatuses,
  type CosmeticCondition,
  type InspectionResult,
  type TradeInIdentifierType,
  type TradeInStatus,
} from "@/lib/trade-in"

export type PersistentTradeIn = {
  id: string
  requestNumber: string
  storeId: string
  requesterUserId: string
  requesterName: string
  customerFullName: string | null
  customerPhone: string | null
  customerEmail: string | null
  deviceBrand: string | null
  deviceModel: string | null
  storageGb: number | null
  colour: string | null
  identifierType: TradeInIdentifierType | null
  imei: string | null
  serialNumber: string | null
  cosmeticCondition: CosmeticCondition
  displayCheck: InspectionResult
  batteryCheck: InspectionResult
  batteryHealth: number | null
  camerasCheck: InspectionResult
  buttonsCheck: InspectionResult
  connectivityCheck: InspectionResult
  biometricCheck: InspectionResult
  activationLockCheck: InspectionResult
  otherFunctionalCheck: InspectionResult
  inspectionNotes: string | null
  proposedOfferPesewas: number | null
  approvedOfferPesewas: number | null
  supportingNotes: string | null
  progressStep: number
  status: TradeInStatus
  submittedAt: string | null
  decision: "approved" | "declined" | null
  decisionNote: string | null
  decidedByName: string | null
  decidedAt: string | null
  intakeIdentityConfirmed: boolean | null
  intakeConditionConfirmed: boolean | null
  intakeNote: string | null
  intakenByName: string | null
  intakenAt: string | null
  intakeStoreInventoryId: string | null
  intakeDeviceId: string | null
  createdAt: string
  updatedAt: string
}

type RawTradeIn = Record<string, unknown>

const tradeInSelection = [
  "id",
  "request_number",
  "store_id",
  "requested_by_user_id",
  "requested_by_display_name",
  "customer_full_name",
  "customer_phone",
  "customer_email",
  "device_brand",
  "device_model",
  "storage_gb",
  "colour",
  "identifier_type",
  "imei",
  "serial_number",
  "cosmetic_condition",
  "display_check",
  "battery_check",
  "battery_health",
  "cameras_check",
  "buttons_check",
  "connectivity_check",
  "biometric_check",
  "activation_lock_check",
  "other_functional_check",
  "inspection_notes",
  "proposed_offer_pesewas",
  "approved_offer_pesewas",
  "supporting_notes",
  "progress_step",
  "status",
  "submitted_at",
  "decision",
  "decision_note",
  "decided_by_display_name",
  "decided_at",
  "intake_identity_confirmed",
  "intake_condition_confirmed",
  "intake_note",
  "intaken_by_display_name",
  "intaken_at",
  "intake_store_inventory_id",
  "intake_device_id",
  "created_at",
  "updated_at",
].join(",")

function requiredString(value: unknown, label: string) {
  if (typeof value !== "string" || !value) throw new Error(`Trade-in response has an invalid ${label}.`)
  return value
}

function optionalString(value: unknown) {
  return typeof value === "string" && value ? value : null
}

function optionalInteger(value: unknown, label: string) {
  if (value === null || value === undefined) return null
  const parsed = typeof value === "number" ? value : Number(value)
  if (!Number.isSafeInteger(parsed)) throw new Error(`Trade-in response has an invalid ${label}.`)
  return parsed
}

function requiredInteger(value: unknown, label: string) {
  const parsed = optionalInteger(value, label)
  if (parsed === null) throw new Error(`Trade-in response has an invalid ${label}.`)
  return parsed
}

function requiredMember<T extends string>(value: unknown, values: readonly T[], label: string) {
  const parsed = requiredString(value, label)
  if (!values.includes(parsed as T)) throw new Error(`Trade-in response has an invalid ${label}.`)
  return parsed as T
}

function optionalMember<T extends string>(value: unknown, values: readonly T[], label: string) {
  if (value === null || value === undefined) return null
  return requiredMember(value, values, label)
}

function optionalBoolean(value: unknown, label: string) {
  if (value === null || value === undefined) return null
  if (typeof value !== "boolean") throw new Error(`Trade-in response has an invalid ${label}.`)
  return value
}

function mapTradeIn(value: RawTradeIn): PersistentTradeIn {
  const decision = optionalString(value.decision)
  if (decision !== null && decision !== "approved" && decision !== "declined") {
    throw new Error("Trade-in response has an invalid decision.")
  }
  return {
    id: requiredString(value.id, "ID"),
    requestNumber: requiredString(value.request_number, "request number"),
    storeId: requiredString(value.store_id, "store ID"),
    requesterUserId: requiredString(value.requested_by_user_id, "requester ID"),
    requesterName: requiredString(value.requested_by_display_name, "requester name"),
    customerFullName: optionalString(value.customer_full_name),
    customerPhone: optionalString(value.customer_phone),
    customerEmail: optionalString(value.customer_email),
    deviceBrand: optionalString(value.device_brand),
    deviceModel: optionalString(value.device_model),
    storageGb: optionalInteger(value.storage_gb, "storage"),
    colour: optionalString(value.colour),
    identifierType: optionalMember(value.identifier_type, identifierTypes, "identifier type"),
    imei: optionalString(value.imei),
    serialNumber: optionalString(value.serial_number),
    cosmeticCondition: requiredMember(value.cosmetic_condition, cosmeticConditions, "cosmetic condition"),
    displayCheck: requiredMember(value.display_check, inspectionResults, "display result"),
    batteryCheck: requiredMember(value.battery_check, inspectionResults, "battery result"),
    batteryHealth: optionalInteger(value.battery_health, "battery health"),
    camerasCheck: requiredMember(value.cameras_check, inspectionResults, "camera result"),
    buttonsCheck: requiredMember(value.buttons_check, inspectionResults, "button result"),
    connectivityCheck: requiredMember(value.connectivity_check, inspectionResults, "connectivity result"),
    biometricCheck: requiredMember(value.biometric_check, inspectionResults, "biometric result"),
    activationLockCheck: requiredMember(value.activation_lock_check, inspectionResults, "activation-lock result"),
    otherFunctionalCheck: requiredMember(value.other_functional_check, inspectionResults, "other functionality result"),
    inspectionNotes: optionalString(value.inspection_notes),
    proposedOfferPesewas: optionalInteger(value.proposed_offer_pesewas, "proposed offer"),
    approvedOfferPesewas: optionalInteger(value.approved_offer_pesewas, "approved offer"),
    supportingNotes: optionalString(value.supporting_notes),
    progressStep: requiredInteger(value.progress_step, "progress step"),
    status: requiredMember(value.status, tradeInStatuses, "status"),
    submittedAt: optionalString(value.submitted_at),
    decision,
    decisionNote: optionalString(value.decision_note),
    decidedByName: optionalString(value.decided_by_display_name),
    decidedAt: optionalString(value.decided_at),
    intakeIdentityConfirmed: optionalBoolean(value.intake_identity_confirmed, "identity confirmation"),
    intakeConditionConfirmed: optionalBoolean(value.intake_condition_confirmed, "condition confirmation"),
    intakeNote: optionalString(value.intake_note),
    intakenByName: optionalString(value.intaken_by_display_name),
    intakenAt: optionalString(value.intaken_at),
    intakeStoreInventoryId: optionalString(value.intake_store_inventory_id),
    intakeDeviceId: optionalString(value.intake_device_id),
    createdAt: requiredString(value.created_at, "created timestamp"),
    updatedAt: requiredString(value.updated_at, "updated timestamp"),
  }
}

export async function listEmployeeTradeIns(storeId: string, userId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("trade_in_requests")
    .select(tradeInSelection)
    .eq("store_id", storeId)
    .eq("requested_by_user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(50)
  if (error) throw new Error("Trade-in requests could not be loaded.")
  return ((data ?? []) as unknown as RawTradeIn[]).map(mapTradeIn)
}

export async function getEmployeeTradeIn(storeId: string, userId: string, requestId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("trade_in_requests")
    .select(tradeInSelection)
    .eq("store_id", storeId)
    .eq("requested_by_user_id", userId)
    .eq("id", requestId)
    .maybeSingle()
  if (error) throw new Error("Trade-in request could not be loaded.")
  return data ? mapTradeIn(data as unknown as RawTradeIn) : null
}

export async function listManagerTradeIns(storeId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("trade_in_requests")
    .select(tradeInSelection)
    .eq("store_id", storeId)
    .neq("status", "draft")
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(500)
  if (error) throw new Error("Trade-in approval queue could not be loaded.")
  return ((data ?? []) as unknown as RawTradeIn[]).map(mapTradeIn)
}
