import "server-only"

import { createClient } from "@/lib/supabase/server"
import { parseUuid, openingStockConditions, openingStockUnitStatuses } from "@/lib/opening-stock"
import type { OpeningStockCondition, OpeningStockUnitStatus } from "@/lib/opening-stock"

export type OpeningStockModel = {
  id: string
  storeId: string
  deviceModelId: string
  supplierSku: string | null
  status: "active" | "inactive"
  modelName: string
  storageGb: number
  createdByDisplayName: string
  createdAt: string
}

export type OpeningStockInvoice = {
  id: string
  storeId: string
  supplierName: string
  supplierInvoiceNumber: string
  invoiceDate: string
  currency: "GHS"
  status: "open" | "closed"
  notes: string | null
  createdByDisplayName: string
  createdAt: string
}

export type OpeningStockInvoiceLine = {
  id: string
  invoiceId: string
  storeId: string
  lineNumber: number
  modelCatalogueId: string
  deviceModelId: string
  modelName: string
  storageGb: number
  supplierSku: string | null
  quantityInvoiced: number
  quantityReceived: number
  quantityStaged: number
  quantityActivated: number
  quantityOutstanding: number
  costVisible: boolean
  unitCostPesewas: number | null
  currency: "GHS"
  notes: string | null
  createdByDisplayName: string
  createdAt: string
}

export type OpeningStockUnit = {
  id: string
  storeId: string
  invoiceLineId: string
  deviceModelId: string
  imei: string
  colour: string
  condition: OpeningStockCondition
  batteryHealth: number
  inspection: Record<string, unknown>
  status: OpeningStockUnitStatus
  approvedPricePesewas: number | null
  costVisible: boolean
  unitCostPesewas: number | null
  modelName: string
  storageGb: number
  receivedByDisplayName: string
  receivedAt: string
  activatedByDisplayName: string | null
  activatedAt: string | null
}

export type OpeningStockCorrection = {
  id: string
  storeId: string
  invoiceId: string
  lineId: string | null
  entityType: "invoice" | "invoice_line"
  beforeData: Record<string, unknown>
  afterData: Record<string, unknown>
  reason: string
  actorDisplayName: string
  createdAt: string
}

export type OpeningStockPriceChange = {
  id: string
  storeId: string
  unitId: string
  storeInventoryId: string
  oldPricePesewas: number
  newPricePesewas: number
  reason: string
  actorDisplayName: string
  createdAt: string
}

export type OpeningStockDashboard = {
  models: OpeningStockModel[]
  invoices: OpeningStockInvoice[]
  lines: OpeningStockInvoiceLine[]
  units: OpeningStockUnit[]
  corrections: OpeningStockCorrection[]
  priceChanges: OpeningStockPriceChange[]
}

function requiredString(value: unknown, label: string) {
  if (typeof value !== "string" || !value) throw new Error(`Opening-stock response has an invalid ${label}.`)
  return value
}

function optionalString(value: unknown) {
  return typeof value === "string" && value ? value : null
}

function requiredInteger(value: unknown, label: string) {
  const parsed = typeof value === "number" ? value : Number(value)
  if (!Number.isSafeInteger(parsed)) throw new Error(`Opening-stock response has an invalid ${label}.`)
  return parsed
}

function optionalInteger(value: unknown) {
  if (value === null || value === undefined || value === "") return null
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function requiredBoolean(value: unknown, label: string) {
  if (typeof value !== "boolean") throw new Error(`Opening-stock response has an invalid ${label}.`)
  return value
}

function requiredRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Opening-stock response has an invalid ${label}.`)
  }
  return value as Record<string, unknown>
}

function conditionValue(value: unknown): OpeningStockCondition {
  const condition = requiredString(value, "device condition")
  if (!openingStockConditions.includes(condition as OpeningStockCondition)) {
    throw new Error("Opening-stock response has an unsupported device condition.")
  }
  return condition as OpeningStockCondition
}

function unitStatus(value: unknown): OpeningStockUnitStatus {
  const status = requiredString(value, "unit status")
  if (!openingStockUnitStatuses.includes(status as OpeningStockUnitStatus)) {
    throw new Error("Opening-stock response has an unsupported unit status.")
  }
  return status as OpeningStockUnitStatus
}

function currencyValue(value: unknown): "GHS" {
  if (requiredString(value, "currency") !== "GHS") throw new Error("Opening-stock response has unsupported currency.")
  return "GHS"
}

function mapModel(value: unknown): OpeningStockModel {
  const row = requiredRecord(value, "model")
  const status = requiredString(row.status, "model status")
  if (status !== "active" && status !== "inactive") throw new Error("Opening-stock response has an invalid model status.")
  return {
    id: requiredString(row.id, "model ID"),
    storeId: requiredString(row.store_id, "model store ID"),
    deviceModelId: requiredString(row.device_model_id, "device model ID"),
    supplierSku: optionalString(row.supplier_sku),
    status,
    modelName: requiredString(row.model_name, "model name"),
    storageGb: requiredInteger(row.storage_gb, "model storage"),
    createdByDisplayName: requiredString(row.created_by_display_name, "model creator"),
    createdAt: requiredString(row.created_at, "model timestamp"),
  }
}

function mapInvoice(value: unknown): OpeningStockInvoice {
  const row = requiredRecord(value, "invoice")
  const status = requiredString(row.status, "invoice status")
  if (status !== "open" && status !== "closed") throw new Error("Opening-stock response has an invalid invoice status.")
  return {
    id: requiredString(row.id, "invoice ID"),
    storeId: requiredString(row.store_id, "invoice store ID"),
    supplierName: requiredString(row.supplier_name, "supplier name"),
    supplierInvoiceNumber: requiredString(row.supplier_invoice_number, "invoice number"),
    invoiceDate: requiredString(row.invoice_date, "invoice date"),
    currency: currencyValue(row.currency),
    status,
    notes: optionalString(row.notes),
    createdByDisplayName: requiredString(row.created_by_display_name, "invoice creator"),
    createdAt: requiredString(row.created_at, "invoice timestamp"),
  }
}

function mapLine(value: unknown): OpeningStockInvoiceLine {
  const row = requiredRecord(value, "invoice line")
  const costVisible = requiredBoolean(row.cost_visible, "cost visibility")
  return {
    id: requiredString(row.id, "invoice line ID"),
    invoiceId: requiredString(row.invoice_id, "line invoice ID"),
    storeId: requiredString(row.store_id, "line store ID"),
    lineNumber: requiredInteger(row.line_number, "line number"),
    modelCatalogueId: requiredString(row.model_catalogue_id, "model catalogue ID"),
    deviceModelId: requiredString(row.device_model_id, "device model ID"),
    modelName: requiredString(row.model_name, "model name"),
    storageGb: requiredInteger(row.storage_gb, "model storage"),
    supplierSku: optionalString(row.supplier_sku),
    quantityInvoiced: requiredInteger(row.quantity_invoiced, "invoiced quantity"),
    quantityReceived: requiredInteger(row.quantity_received, "received quantity"),
    quantityStaged: requiredInteger(row.quantity_staged, "staged quantity"),
    quantityActivated: requiredInteger(row.quantity_activated, "activated quantity"),
    quantityOutstanding: requiredInteger(row.quantity_outstanding, "outstanding quantity"),
    costVisible,
    unitCostPesewas: costVisible ? optionalInteger(row.unit_cost_pesewas) : null,
    currency: currencyValue(row.currency),
    notes: optionalString(row.notes),
    createdByDisplayName: requiredString(row.created_by_display_name, "line creator"),
    createdAt: requiredString(row.created_at, "line timestamp"),
  }
}

function mapUnit(value: unknown): OpeningStockUnit {
  const row = requiredRecord(value, "opening-stock unit")
  const costVisible = requiredBoolean(row.cost_visible, "cost visibility")
  return {
    id: requiredString(row.id, "unit ID"),
    storeId: requiredString(row.store_id, "unit store ID"),
    invoiceLineId: requiredString(row.invoice_line_id, "invoice line ID"),
    deviceModelId: requiredString(row.device_model_id, "device model ID"),
    imei: requiredString(row.imei, "IMEI"),
    colour: requiredString(row.colour, "colour"),
    condition: conditionValue(row.condition),
    batteryHealth: requiredInteger(row.battery_health, "battery health"),
    inspection: requiredRecord(row.inspection, "inspection record"),
    status: unitStatus(row.status),
    approvedPricePesewas: optionalInteger(row.approved_price_pesewas),
    costVisible,
    unitCostPesewas: costVisible ? optionalInteger(row.unit_cost_pesewas) : null,
    modelName: requiredString(row.model_name, "model name"),
    storageGb: requiredInteger(row.storage_gb, "model storage"),
    receivedByDisplayName: requiredString(row.received_by_display_name, "receiver"),
    receivedAt: requiredString(row.received_at, "received timestamp"),
    activatedByDisplayName: optionalString(row.activated_by_display_name),
    activatedAt: optionalString(row.activated_at),
  }
}

function mapCorrection(value: unknown): OpeningStockCorrection {
  const row = requiredRecord(value, "correction")
  const entityType = requiredString(row.entity_type, "correction entity type")
  if (entityType !== "invoice" && entityType !== "invoice_line") {
    throw new Error("Opening-stock response has an invalid correction entity type.")
  }
  return {
    id: requiredString(row.id, "correction ID"),
    storeId: requiredString(row.store_id, "correction store ID"),
    invoiceId: requiredString(row.invoice_id, "correction invoice ID"),
    lineId: optionalString(row.line_id),
    entityType,
    beforeData: requiredRecord(row.before_data, "correction before state"),
    afterData: requiredRecord(row.after_data, "correction after state"),
    reason: requiredString(row.reason, "correction reason"),
    actorDisplayName: requiredString(row.actor_display_name, "correction actor"),
    createdAt: requiredString(row.created_at, "correction timestamp"),
  }
}

function mapPriceChange(value: unknown): OpeningStockPriceChange {
  const row = requiredRecord(value, "price change")
  return {
    id: requiredString(row.id, "price change ID"),
    storeId: requiredString(row.store_id, "price change store ID"),
    unitId: requiredString(row.unit_id, "price change unit ID"),
    storeInventoryId: requiredString(row.store_inventory_id, "price change inventory ID"),
    oldPricePesewas: requiredInteger(row.old_price_pesewas, "old price"),
    newPricePesewas: requiredInteger(row.new_price_pesewas, "new price"),
    reason: requiredString(row.reason, "repricing reason"),
    actorDisplayName: requiredString(row.actor_display_name, "repricing actor"),
    createdAt: requiredString(row.created_at, "repricing timestamp"),
  }
}

/** Reads only RLS/permission-checked opening-stock views through the caller's SSR session. */
export async function loadOpeningStockDashboard(storeId: string): Promise<OpeningStockDashboard> {
  parseUuid(storeId, "store")
  const supabase = await createClient()
  const [models, invoices, lines, units, corrections, priceChanges] = await Promise.all([
    supabase.from("opening_stock_models_view").select("*").eq("store_id", storeId).order("created_at", { ascending: false }),
    supabase.from("opening_stock_invoices_view").select("*").eq("store_id", storeId).order("created_at", { ascending: false }),
    supabase
      .from("opening_stock_invoice_lines_view")
      .select("*")
      .eq("store_id", storeId)
      .order("invoice_id", { ascending: true })
      .order("line_number", { ascending: true }),
    supabase.from("opening_stock_units_view").select("*").eq("store_id", storeId).order("received_at", { ascending: false }),
    supabase
      .from("opening_stock_corrections_view")
      .select("*")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("opening_stock_price_changes_view")
      .select("*")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(20),
  ])

  const errors = [models.error, invoices.error, lines.error, units.error, corrections.error, priceChanges.error]
  if (errors.some(Boolean)) throw new Error("Opening-stock records could not be loaded.")

  return {
    models: (models.data ?? []).map((row) => mapModel(row as unknown)),
    invoices: (invoices.data ?? []).map((row) => mapInvoice(row as unknown)),
    lines: (lines.data ?? []).map((row) => mapLine(row as unknown)),
    units: (units.data ?? []).map((row) => mapUnit(row as unknown)),
    corrections: (corrections.data ?? []).map((row) => mapCorrection(row as unknown)),
    priceChanges: (priceChanges.data ?? []).map((row) => mapPriceChange(row as unknown)),
  }
}
