"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissions } from "@/lib/auth/server"
import {
  parseActivationInput,
  parseBatchDeviceInput,
  parseConfirmSupplierInvoiceInput,
  parseIndividualDeviceInput,
  parseInvoiceCorrectionInput,
  parseInvoiceLineCorrectionInput,
  parseInvoiceLineInput,
  parseModelRegistrationInput,
  parseRepricingInput,
  parseSupplierInvoiceInput,
  parseUuid,
} from "@/lib/opening-stock"
import { createClient } from "@/lib/supabase/server"

const route = "/manager/opening-stock"

function parseOrRedirect<T>(parse: () => T): T {
  try {
    return parse()
  } catch {
    redirect(`${route}?error=invalid-input`)
  }
}

function rpcErrorReason(error: { code?: string | null } | null) {
  if (error?.code === "23505") return "duplicate-or-race"
  if (error?.code === "42501" || error?.code === "28000") return "access-denied"
  if (error?.code === "23514") return "state-conflict"
  return "operation-failed"
}

async function callOpeningStockRpc(
  name: string,
  payload: Record<string, unknown>,
  notice: string,
  options: { pricing?: boolean; storeParam?: boolean } = {}
): Promise<never> {
  const permissions = options.pricing
    ? (["access_manager_workspace", "manage_inventory", "approve_inventory_adjustments"] as const)
    : (["access_manager_workspace", "manage_inventory"] as const)

  const { membership } = await requirePermissions(permissions, { nextPath: route })
  const supabase = await createClient()
  const args = options.storeParam ? { p_store_id: membership.storeId, ...payload } : payload
  const { error } = await supabase.rpc(name, args)

  if (error) redirect(`${route}?error=${rpcErrorReason(error)}`)
  revalidatePath(route)
  redirect(`${route}?notice=${notice}`)
}

export async function registerOpeningStockModelAction(formData: FormData): Promise<void> {
  const input = parseOrRedirect(() => parseModelRegistrationInput(formData))
  await callOpeningStockRpc(
    "register_opening_stock_model",
    {
      p_model_name: input.modelName,
      p_storage_gb: input.storageGb,
      p_supplier_sku: input.supplierSku || null,
    },
    "model-registered",
    { storeParam: true }
  )
}

export async function createSupplierInvoiceAction(formData: FormData): Promise<void> {
  const input = parseOrRedirect(() => parseSupplierInvoiceInput(formData))
  await callOpeningStockRpc(
    "create_supplier_invoice",
    {
      p_supplier_name: input.supplierName,
      p_supplier_invoice_number: input.invoiceNumber,
      p_invoice_date: input.invoiceDate,
      p_declared_total_pesewas: input.declaredTotalPesewas,
      p_notes: input.notes || null,
    },
    "invoice-created",
    { storeParam: true }
  )
}

export async function confirmSupplierInvoiceAction(formData: FormData): Promise<void> {
  const input = parseOrRedirect(() => parseConfirmSupplierInvoiceInput(formData))
  await callOpeningStockRpc(
    "confirm_supplier_invoice",
    {
      p_invoice_id: input.invoiceId,
      p_expected_declared_total_pesewas: input.expectedDeclaredTotalPesewas,
      p_expected_line_count: input.expectedLineCount,
      p_expected_quantity_invoiced: input.expectedQuantityInvoiced,
      p_expected_calculated_total_pesewas: input.expectedCalculatedTotalPesewas,
      p_totals_confirmed: true,
    },
    "invoice-confirmed"
  )
}

export async function addSupplierInvoiceLineAction(formData: FormData): Promise<void> {
  const input = parseOrRedirect(() => parseInvoiceLineInput(formData))
  const rawDeviceModelId = formData.get("deviceModelId")
  const deviceModelId = typeof rawDeviceModelId === "string" && rawDeviceModelId.trim() ? rawDeviceModelId.trim() : null

  let resolvedCatalogueId = input.modelCatalogueId
  if (deviceModelId && resolvedCatalogueId === deviceModelId) {
    const membership = await requirePermissions(["access_manager_workspace", "manage_inventory"])
    const supabase = await createClient()
    const { data: modelRow, error: modelError } = await supabase
      .from("device_models")
      .select("model_name, storage_gb")
      .eq("id", deviceModelId)
      .maybeSingle()

    if (modelError || !modelRow) {
      redirect(`${route}?error=${encodeURIComponent("Selected device model was not found.")}`)
    }

    const { data: regData, error: regError } = await supabase.rpc("register_opening_stock_model", {
      p_store_id: parseUuid(membership.membership.storeId, "store"),
      p_model_name: modelRow.model_name,
      p_storage_gb: modelRow.storage_gb,
      p_supplier_sku: null,
    })

    const registeredId = Array.isArray(regData) ? regData[0]?.catalogue_id : null
    if (regError || typeof registeredId !== "string" || !registeredId) {
      redirect(`${route}?error=${encodeURIComponent(regError?.message || "Could not prepare selected device model for this store.")}`)
    }
    resolvedCatalogueId = registeredId
  }

  await callOpeningStockRpc(
    "add_supplier_invoice_line",
    {
      p_invoice_id: input.invoiceId,
      p_model_catalogue_id: resolvedCatalogueId,
      p_quantity_invoiced: input.quantityInvoiced,
      p_unit_cost_pesewas: input.unitCostPesewas,
      p_notes: input.notes,
    },
    "invoice-line-added"
  )
}

export async function correctSupplierInvoiceAction(formData: FormData): Promise<void> {
  const input = parseOrRedirect(() => parseInvoiceCorrectionInput(formData))
  await callOpeningStockRpc(
    "correct_supplier_invoice",
    {
      p_invoice_id: input.invoiceId,
      p_supplier_name: input.supplierName,
      p_supplier_invoice_number: input.invoiceNumber,
      p_invoice_date: input.invoiceDate,
      p_declared_total_pesewas: input.declaredTotalPesewas,
      p_notes: input.notes || null,
      p_reason: input.reason,
    },
    "invoice-corrected"
  )
}

export async function correctSupplierInvoiceLineAction(formData: FormData): Promise<void> {
  const input = parseOrRedirect(() => parseInvoiceLineCorrectionInput(formData))
  await callOpeningStockRpc(
    "correct_supplier_invoice_line",
    {
      p_invoice_line_id: input.lineId,
      p_quantity_invoiced: input.quantityInvoiced,
      p_unit_cost_pesewas: input.unitCostPesewas,
      p_reason: input.reason,
    },
    "invoice-line-corrected"
  )
}

export async function receiveOpeningStockDeviceAction(formData: FormData): Promise<void> {
  const input = parseOrRedirect(() => parseIndividualDeviceInput(formData))
  const invoiceLineId = parseOrRedirect(() => parseUuidForAction(formData, "lineId"))
  await callOpeningStockRpc(
    "receive_opening_stock_device",
    {
      p_invoice_line_id: invoiceLineId,
      p_imei: input.imei,
      p_colour: input.colour,
      p_condition: input.condition,
      p_battery_health: input.battery_health,
      p_inspection: input.inspection,
    },
    "device-received"
  )
}

export async function receiveOpeningStockBatchAction(formData: FormData): Promise<void> {
  const devices = parseOrRedirect(() => parseBatchDeviceInput(formData))
  const invoiceLineId = parseOrRedirect(() => parseUuidForAction(formData, "lineId"))
  await callOpeningStockRpc(
    "receive_opening_stock_devices",
    {
      p_invoice_line_id: invoiceLineId,
      p_devices: devices,
    },
    "batch-received"
  )
}

export async function activateOpeningStockUnitAction(formData: FormData): Promise<void> {
  const input = parseOrRedirect(() => parseActivationInput(formData))
  await callOpeningStockRpc(
    "activate_opening_stock_unit",
    {
      p_unit_id: input.unitId,
      p_approved_price_pesewas: input.approvedPricePesewas,
      p_price_confirmed: true,
    },
    "unit-activated",
    { pricing: true }
  )
}

export async function repriceOpeningStockUnitAction(formData: FormData): Promise<void> {
  const input = parseOrRedirect(() => parseRepricingInput(formData))
  await callOpeningStockRpc(
    "reprice_opening_stock_unit",
    {
      p_unit_id: input.unitId,
      p_expected_price_pesewas: input.expectedPricePesewas,
      p_new_price_pesewas: input.newPricePesewas,
      p_reason: input.reason,
      p_price_confirmed: true,
    },
    "unit-repriced",
    { pricing: true }
  )
}

function parseUuidForAction(formData: FormData, field: string) {
  const value = formData.get(field)
  if (typeof value !== "string") throw new Error("Invalid identifier.")
  return parseUuid(value, field)
}
