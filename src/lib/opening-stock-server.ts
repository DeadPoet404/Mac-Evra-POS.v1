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
  supplierInvoiceNumber: string | null
  invoiceDate: string
  currency: "GHS"
  status: "open" | "closed"
  declaredTotalPesewas: number | null
  costVisible: boolean
  notes: string | null
  confirmedAt: string | null
  confirmedByDisplayName: string | null
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
  lineTotalPesewas: number | null
  currency: "GHS"
  notes: string | null
  createdByDisplayName: string
  createdAt: string
}

export type OpeningStockInvoiceReconciliation = {
  invoiceId: string
  storeId: string
  supplierName: string
  supplierInvoiceNumber: string | null
  invoiceDate: string
  status: "open" | "closed"
  lineCount: number
  quantityInvoiced: number
  declaredTotalPesewas: number | null
  calculatedTotalPesewas: number | null
  differencePesewas: number | null
  reconciled: boolean
  costVisible: boolean
  confirmedAt: string | null
  confirmedByDisplayName: string | null
}

export type OpeningStockUnit = {
  id: string
  storeId: string
  invoiceLineId: string
  deviceModelId: string
  imei: string
  colour: string
  /** `null` until a manager has graded the handset's cosmetic condition. */
  condition: OpeningStockCondition | null
  /** `null` while the physical measurement is still unknown. */
  batteryHealth: number | null
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
  /** Who completed the pending physical checks, and when. */
  inspectionCompletedByDisplayName: string | null
  inspectionCompletedAt: string | null
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

export type DeviceModelCatalogEntry = {
  id: string
  modelName: string
  storageGb: number
  catalogueId: string | null
}

export type OpeningStockDashboard = {
  models: OpeningStockModel[]
  deviceModels: DeviceModelCatalogEntry[]
  invoices: OpeningStockInvoice[]
  lines: OpeningStockInvoiceLine[]
  reconciliations: OpeningStockInvoiceReconciliation[]
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

/**
 * A staged unit may legitimately carry no cosmetic condition yet, because the
 * grading is a physical assessment. `null` here means "not assessed", which is
 * different from an unrecognised value — the latter is still an error.
 */
function optionalConditionValue(value: unknown): OpeningStockCondition | null {
  if (value === null || value === undefined) return null
  return conditionValue(value)
}

function unitStatus(value: unknown): OpeningStockUnitStatus {
  const status = requiredString(value, "unit status")
  if (!openingStockUnitStatuses.includes(status as OpeningStockUnitStatus)) {
    throw new Error("Opening-stock response has an unsupported unit status.")
  }
  return status as OpeningStockUnitStatus
}

function invoiceStatus(value: unknown): "open" | "closed" {
  const status = requiredString(value, "invoice status")
  if (status !== "open" && status !== "closed") throw new Error("Opening-stock response has an invalid invoice status.")
  return status
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
  const costVisible = requiredBoolean(row.cost_visible, "invoice cost visibility")
  return {
    id: requiredString(row.id, "invoice ID"),
    storeId: requiredString(row.store_id, "invoice store ID"),
    supplierName: requiredString(row.supplier_name, "supplier name"),
    supplierInvoiceNumber: optionalString(row.supplier_invoice_number),
    invoiceDate: requiredString(row.invoice_date, "invoice date"),
    currency: currencyValue(row.currency),
    status: invoiceStatus(row.status),
    declaredTotalPesewas: costVisible ? optionalInteger(row.declared_total_pesewas) : null,
    costVisible,
    notes: optionalString(row.notes),
    confirmedAt: optionalString(row.confirmed_at),
    confirmedByDisplayName: optionalString(row.confirmed_by_display_name),
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
    lineTotalPesewas: costVisible ? optionalInteger(row.line_total_pesewas) : null,
    currency: currencyValue(row.currency),
    notes: optionalString(row.notes),
    createdByDisplayName: requiredString(row.created_by_display_name, "line creator"),
    createdAt: requiredString(row.created_at, "line timestamp"),
  }
}

function mapReconciliation(value: unknown): OpeningStockInvoiceReconciliation {
  const row = requiredRecord(value, "invoice reconciliation")
  return {
    invoiceId: requiredString(row.invoice_id, "reconciliation invoice ID"),
    storeId: requiredString(row.store_id, "reconciliation store ID"),
    supplierName: requiredString(row.supplier_name, "reconciliation supplier name"),
    supplierInvoiceNumber: optionalString(row.supplier_invoice_number),
    invoiceDate: requiredString(row.invoice_date, "reconciliation invoice date"),
    status: invoiceStatus(row.status),
    lineCount: requiredInteger(row.line_count, "invoice line count"),
    quantityInvoiced: requiredInteger(row.quantity_invoiced, "invoice quantity"),
    declaredTotalPesewas: optionalInteger(row.declared_total_pesewas),
    calculatedTotalPesewas: optionalInteger(row.calculated_total_pesewas),
    differencePesewas: optionalInteger(row.difference_pesewas),
    reconciled: requiredBoolean(row.reconciled, "invoice reconciliation state"),
    costVisible: requiredBoolean(row.cost_visible, "reconciliation cost visibility"),
    confirmedAt: optionalString(row.confirmed_at),
    confirmedByDisplayName: optionalString(row.confirmed_by_display_name),
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
    condition: optionalConditionValue(row.condition),
    batteryHealth: optionalInteger(row.battery_health),
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
    inspectionCompletedByDisplayName: optionalString(row.inspection_completed_by_display_name),
    inspectionCompletedAt: optionalString(row.inspection_completed_at),
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
  const [models, deviceModels, invoices, lines, units, corrections, priceChanges, reconciliations] = await Promise.all([
    supabase.from("opening_stock_models_view").select("*").eq("store_id", storeId).order("created_at", { ascending: false }),
    supabase.from("device_models").select("id, model_name, storage_gb").order("model_name", { ascending: true }).order("storage_gb", { ascending: true }),
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
    supabase
      .from("opening_stock_invoice_reconciliation_view")
      .select("*")
      .eq("store_id", storeId)
      .order("invoice_date", { ascending: false }),
  ])

  const errors = [models.error, deviceModels.error, invoices.error, lines.error, units.error, corrections.error, priceChanges.error, reconciliations.error]
  if (errors.some(Boolean)) throw new Error("Opening-stock records could not be loaded.")

  const mappedModels = (models.data ?? []).map((row) => mapModel(row as unknown))
  const catalogueIdByDeviceModelId = new Map(mappedModels.map((model) => [model.deviceModelId, model.id]))

  return {
    models: mappedModels,
    deviceModels: (deviceModels.data ?? []).map((row) => {
      const record = requiredRecord(row, "device model")
      const id = requiredString(record.id, "device model ID")
      return {
        id,
        modelName: requiredString(record.model_name, "model name"),
        storageGb: requiredInteger(record.storage_gb, "storage"),
        catalogueId: catalogueIdByDeviceModelId.get(id) ?? null,
      }
    }),
    invoices: (invoices.data ?? []).map((row) => mapInvoice(row as unknown)),
    lines: (lines.data ?? []).map((row) => mapLine(row as unknown)),
    reconciliations: (reconciliations.data ?? []).map((row) => mapReconciliation(row as unknown)),
    units: (units.data ?? []).map((row) => mapUnit(row as unknown)),
    corrections: (corrections.data ?? []).map((row) => mapCorrection(row as unknown)),
    priceChanges: (priceChanges.data ?? []).map((row) => mapPriceChange(row as unknown)),
  }
}
