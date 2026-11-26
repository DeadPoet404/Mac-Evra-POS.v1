"use server"

import { revalidatePath } from "next/cache"

import { requirePermissions } from "@/lib/auth/server"
import {
  parseActivationInput,
  parseBatteryHealthRecordInput,
  parseConditionRecordInput,
  parseInspectionCompletionInput,
  parseConfirmSupplierInvoiceInput,
  parseInvoiceCorrectionInput,
  parseInvoiceLineCorrectionInput,
  parseInvoiceLineInput,
  parseRepricingInput,
  parseSupplierInvoiceInput,
  parseUuid,
} from "@/lib/opening-stock"
import {
  deviceDraftToRpcPayload,
  validateDeviceEntry,
  validateInvoiceEdit,
  validateLineEdit,
  mergeInvoiceDraft,
  mergeLineDraft,
  hasFieldErrors,
  type FieldErrors,
} from "@/lib/opening-stock-workspace"
import { openingStockInspectionChecks } from "@/lib/opening-stock"
import { createClient } from "@/lib/supabase/server"

/**
 * Result envelope for the inline-editing surfaces.
 *
 * The workspace keeps its page state in the client so a save never reloads the
 * page. Actions therefore return a structured result instead of redirecting:
 * the row can show a field-level error, a spinner and a confirmed tick without
 * losing the user's place.
 *
 * Redirect-based flows are deliberately retained only where the database
 * changes the *shape* of the data (creating an invoice or a line), because the
 * new identifier has to come from the server. Even those return the new id so
 * the client can adopt it without a navigation.
 */
export type ActionResult<T = undefined> =
  | { ok: true; message: string; data: T }
  | { ok: false; message: string; fieldErrors?: FieldErrors; reason?: string }

const route = "/manager/opening-stock"

/** Maps database error codes to a stable reason the UI can explain precisely. */
function rpcErrorReason(error: { code?: string | null; message?: string | null } | null) {
  if (!error) return "operation-failed"
  if (error.code === "23505") return "duplicate"
  if (error.code === "42501" || error.code === "28000") return "access-denied"
  if (error.code === "23514") return "state-conflict"
  if (error.code === "22023") return "invalid-input"
  return "operation-failed"
}

const reasonMessages: Record<string, string> = {
  duplicate: "That value is already recorded. Nothing was saved.",
  "access-denied": "Your active store permissions do not allow this operation.",
  "state-conflict": "The record changed or is no longer in an editable state. Re-read the row and try again.",
  "invalid-input": "The database rejected these values. Check the highlighted fields.",
  "operation-failed": "The operation could not be completed. No partial records were saved.",
}

function failure(error: { code?: string | null; message?: string | null } | null, message?: string): ActionResult<never> {
  const reason = rpcErrorReason(error)
  return { ok: false, reason, message: message ?? reasonMessages[reason] ?? reasonMessages["operation-failed"] }
}

function invalid(fieldErrors: FieldErrors): ActionResult<never> {
  const first = Object.values(fieldErrors)[0]
  return { ok: false, fieldErrors, reason: "invalid-input", message: first ?? "Check the highlighted fields." }
}

async function managerClient(nextPath = route) {
  const { membership } = await requirePermissions(["access_manager_workspace", "manage_inventory"], { nextPath })
  const supabase = await createClient()
  return { membership, supabase }
}

/**
 * Pricing and receiving are separate permissions in the database, so the page
 * asks for the union once and each action re-verifies the exact permission the
 * RPC will demand. Without this, a manager who may manage inventory but not
 * approve pricing sees a successful-looking form that the database rejects.
 */
async function managerClientWithPricing(nextPath = route) {
  const { membership } = await requirePermissions(
    ["access_manager_workspace", "manage_inventory", "approve_inventory_adjustments"],
    { nextPath }
  )
  const supabase = await createClient()
  return { membership, supabase }
}

function firstRow(value: unknown) {
  return Array.isArray(value) && value.length > 0 && value[0] && typeof value[0] === "object"
    ? (value[0] as Record<string, unknown>)
    : null
}

/* ------------------------------------------------------------------ *
 * Tab A — Supplier invoices
 * ------------------------------------------------------------------ */

export async function createSupplierInvoiceInlineAction(formData: FormData): Promise<ActionResult<{ invoiceId: string }>> {
  let input
  try {
    input = parseSupplierInvoiceInput(formData)
  } catch (error) {
    return invalid({ supplierName: error instanceof Error ? error.message : "Check the invoice details." })
  }

  const { membership, supabase } = await managerClient()
  const { data, error } = await supabase.rpc("create_supplier_invoice", {
    p_store_id: membership.storeId,
    p_supplier_name: input.supplierName,
    p_supplier_invoice_number: input.invoiceNumber,
    p_invoice_date: input.invoiceDate,
    p_declared_total_pesewas: input.declaredTotalPesewas,
    p_notes: input.notes || null,
  })
  if (error) return failure(error)

  const invoiceId = firstRow(data)?.invoice_id
  revalidatePath(route)
  return {
    ok: true,
    message: "Supplier invoice created.",
    data: { invoiceId: typeof invoiceId === "string" ? invoiceId : "" },
  }
}

/**
 * Corrects exactly one invoice.
 *
 * The complete payload is rebuilt from the record the manager is editing
 * (`record`), with only the changed cells overlaid. The database receives the
 * full corrected state plus a mandatory reason and writes an attributed
 * before/after ledger row — the same audited RPC as before, no new write path.
 */
export async function correctSupplierInvoiceInlineAction(
  record: {
    id: string
    supplierName: string
    supplierInvoiceNumber: string | null
    invoiceDate: string
    declaredTotalPesewas: number | null
    notes: string | null
    status: "open" | "closed"
    confirmedAt: string | null
  },
  patch: {
    supplierName?: string
    supplierInvoiceNumber?: string
    invoiceDate?: string
    declaredTotalGhs?: string
    notes?: string
  },
  reason: string
): Promise<ActionResult<{ correctionId: string; confirmationReset: boolean }>> {
  if (record.status !== "open") {
    return { ok: false, reason: "state-conflict", message: "A closed invoice cannot be corrected." }
  }

  const draft = mergeInvoiceDraft(record, patch)
  const fieldErrors = validateInvoiceEdit(draft)
  if (hasFieldErrors(fieldErrors)) return invalid(fieldErrors)

  let input
  try {
    const formData = new FormData()
    formData.set("invoiceId", draft.invoiceId)
    formData.set("supplierName", draft.supplierName)
    formData.set("invoiceNumber", draft.supplierInvoiceNumber)
    formData.set("invoiceDate", draft.invoiceDate)
    formData.set("declaredTotalGhs", draft.declaredTotalGhs)
    formData.set("notes", draft.notes)
    formData.set("reason", reason)
    input = parseInvoiceCorrectionInput(formData)
  } catch (error) {
    return invalid({ reason: error instanceof Error ? error.message : "Enter a correction reason of at least 5 characters." })
  }

  const { supabase } = await managerClient()
  const { data, error } = await supabase.rpc("correct_supplier_invoice", {
    p_invoice_id: input.invoiceId,
    p_supplier_name: input.supplierName,
    p_supplier_invoice_number: input.invoiceNumber,
    p_invoice_date: input.invoiceDate,
    p_declared_total_pesewas: input.declaredTotalPesewas,
    p_notes: input.notes || null,
    p_reason: input.reason,
  })
  if (error) {
    if (error.code === "22023" && /must change/i.test(error.message ?? "")) {
      return { ok: false, reason: "invalid-input", message: "That value is unchanged, so no correction was recorded." }
    }
    return failure(error)
  }

  revalidatePath(route)
  const correctionId = firstRow(data)?.correction_id
  return {
    ok: true,
    message: record.confirmedAt ? "Correction recorded. Invoice totals need re-confirmation." : "Correction recorded.",
    data: { correctionId: typeof correctionId === "string" ? correctionId : "", confirmationReset: true },
  }
}

export async function confirmSupplierInvoiceInlineAction(
  input: {
    invoiceId: string
    declaredTotalPesewas: number
    lineCount: number
    quantityInvoiced: number
    calculatedTotalPesewas: number
  }
): Promise<ActionResult> {
  let parsed
  try {
    const formData = new FormData()
    formData.set("invoiceId", input.invoiceId)
    formData.set("totalsConfirmed", "on")
    formData.set("expectedDeclaredTotalPesewas", String(input.declaredTotalPesewas))
    formData.set("expectedLineCount", String(input.lineCount))
    formData.set("expectedQuantityInvoiced", String(input.quantityInvoiced))
    formData.set("expectedCalculatedTotalPesewas", String(input.calculatedTotalPesewas))
    parsed = parseConfirmSupplierInvoiceInput(formData)
  } catch (error) {
    return invalid({ totals: error instanceof Error ? error.message : "Confirm the totals first." })
  }

  const { supabase } = await managerClient()
  const { error } = await supabase.rpc("confirm_supplier_invoice", {
    p_invoice_id: parsed.invoiceId,
    p_expected_declared_total_pesewas: parsed.expectedDeclaredTotalPesewas,
    p_expected_line_count: parsed.expectedLineCount,
    p_expected_quantity_invoiced: parsed.expectedQuantityInvoiced,
    p_expected_calculated_total_pesewas: parsed.expectedCalculatedTotalPesewas,
    p_totals_confirmed: true,
  })
  if (error) {
    if (error.code === "23514") {
      return {
        ok: false,
        reason: "state-conflict",
        message: "The invoice changed since it loaded. Re-read the totals and confirm again.",
      }
    }
    return failure(error)
  }

  revalidatePath(route)
  return { ok: true, message: "Invoice totals reconciled and confirmed.", data: undefined }
}

/* ------------------------------------------------------------------ *
 * Tab B — Invoice products
 * ------------------------------------------------------------------ */

export async function addSupplierInvoiceLineInlineAction(input: {
  invoiceId: string
  deviceModelId: string
  modelCatalogueId: string | null
  quantityInvoiced: string
  unitCostGhs: string
  notes?: string
}): Promise<ActionResult<{ lineId: string; lineNumber: number }>> {
  let parsed
  try {
    const formData = new FormData()
    formData.set("invoiceId", parseUuid(input.invoiceId, "invoice"))
    formData.set("modelCatalogueId", input.modelCatalogueId ?? "")
    formData.set("quantityInvoiced", input.quantityInvoiced)
    formData.set("unitCostGhs", input.unitCostGhs)
    formData.set("notes", input.notes ?? "")
    // The catalogue id is resolved below when the store has not registered it.
    if (!input.modelCatalogueId) formData.set("modelCatalogueId", parseUuid(input.deviceModelId, "device model"))
    parsed = { ...parseInvoiceLineInput(formData), deviceModelId: input.deviceModelId }
  } catch (error) {
    return invalid({ quantityInvoiced: error instanceof Error ? error.message : "Check the line details." })
  }

  const { membership, supabase } = await managerClient()

  // A store may add an invoice line for a catalogue model it has not registered
  // yet. `register_opening_stock_model` is idempotent for an existing
  // model/storage pair, so reuse it rather than inventing a new operation.
  let catalogueId = input.modelCatalogueId
  if (!catalogueId) {
    const { data: modelRow, error: modelError } = await supabase
      .from("device_models")
      .select("model_name, storage_gb")
      .eq("id", input.deviceModelId)
      .maybeSingle()
    if (modelError || !modelRow) {
      return { ok: false, reason: "state-conflict", message: "That catalogue model is no longer available." }
    }
    const { data: registered, error: registerError } = await supabase.rpc("register_opening_stock_model", {
      p_store_id: membership.storeId,
      p_model_name: modelRow.model_name,
      p_storage_gb: modelRow.storage_gb,
      p_supplier_sku: null,
    })
    const registeredId = firstRow(registered)?.model_catalogue_id
    if (registerError || typeof registeredId !== "string") return failure(registerError)
    catalogueId = registeredId
  }

  const { data, error } = await supabase.rpc("add_supplier_invoice_line", {
    p_invoice_id: parsed.invoiceId,
    p_model_catalogue_id: catalogueId,
    p_quantity_invoiced: parsed.quantityInvoiced,
    p_unit_cost_pesewas: parsed.unitCostPesewas,
    p_notes: parsed.notes,
  })
  if (error) return failure(error)

  revalidatePath(route)
  const row = firstRow(data)
  return {
    ok: true,
    message: "Product line added.",
    data: {
      lineId: typeof row?.invoice_line_id === "string" ? row.invoice_line_id : "",
      lineNumber: typeof row?.line_number === "number" ? row.line_number : 0,
    },
  }
}

/** Corrects exactly one invoice line, rebuilt from that line's own record. */
export async function correctSupplierInvoiceLineInlineAction(
  record: { id: string; invoiceId: string; quantityInvoiced: number; unitCostPesewas: number | null; quantityReceived: number },
  patch: { quantityInvoiced?: string; unitCostGhs?: string },
  reason: string
): Promise<ActionResult<{ correctionId: string }>> {
  const draft = mergeLineDraft(record, patch)
  const fieldErrors = validateLineEdit(draft, record)
  if (hasFieldErrors(fieldErrors)) return invalid(fieldErrors)

  let input
  try {
    const formData = new FormData()
    formData.set("lineId", draft.lineId)
    formData.set("quantityInvoiced", draft.quantityInvoiced)
    formData.set("unitCostGhs", draft.unitCostGhs)
    formData.set("reason", reason)
    input = parseInvoiceLineCorrectionInput(formData)
  } catch (error) {
    return invalid({ reason: error instanceof Error ? error.message : "Enter a correction reason of at least 5 characters." })
  }

  const { supabase } = await managerClient()
  const { data, error } = await supabase.rpc("correct_supplier_invoice_line", {
    p_invoice_line_id: input.lineId,
    p_quantity_invoiced: input.quantityInvoiced,
    p_unit_cost_pesewas: input.unitCostPesewas,
    p_reason: input.reason,
  })
  if (error) {
    if (error.code === "23514" && /immutable/i.test(error.message ?? "")) {
      return {
        ok: false,
        reason: "state-conflict",
        fieldErrors: { unitCostGhs: "Unit cost is locked once a device has been received on this line." },
        message: "Unit cost is locked once a device has been received on this line.",
      }
    }
    if (error.code === "23514" && /received devices/i.test(error.message ?? "")) {
      return {
        ok: false,
        reason: "state-conflict",
        fieldErrors: { quantityInvoiced: "Quantity cannot be less than the devices already received." },
        message: "Quantity cannot be less than the devices already received.",
      }
    }
    if (error.code === "22023" && /must change/i.test(error.message ?? "")) {
      return { ok: false, reason: "invalid-input", message: "That value is unchanged, so no correction was recorded." }
    }
    return failure(error)
  }

  revalidatePath(route)
  const correctionId = firstRow(data)?.correction_id
  return {
    ok: true,
    message: "Line correction recorded.",
    data: { correctionId: typeof correctionId === "string" ? correctionId : "" },
  }
}

/* ------------------------------------------------------------------ *
 * Tab C — Devices & IMEIs
 * ------------------------------------------------------------------ */

/**
 * Receives one device row.
 *
 * Each row carries its own colour, condition, battery reading and attested
 * inspection document. Nothing is copied from a neighbouring row, and the
 * payload is validated against the same rules the database enforces before the
 * round trip.
 */
export async function receiveDeviceRowInlineAction(
  input: {
    invoiceLineId: string
    imei: string
    colour: string
    condition: string
    batteryHealth: string
    inspectionNotes: string
    checks: Record<string, boolean>
  },
  existingImeis: readonly string[]
): Promise<ActionResult<{ unitId: string; imei: string; quantityReceived: number; quantityOutstanding: number }>> {
  let invoiceLineId
  try {
    invoiceLineId = parseUuid(input.invoiceLineId, "invoice line")
  } catch (error) {
    return invalid({ invoiceLineId: error instanceof Error ? error.message : "Select an invoice line." })
  }

  const draft = {
    invoiceLineId,
    imei: input.imei,
    colour: input.colour,
    condition: input.condition,
    batteryHealth: input.batteryHealth,
    inspectionNotes: input.inspectionNotes,
    checks: input.checks,
  }

  const fieldErrors = validateDeviceEntry(draft, {
    existingImeis,
    inspectionChecks: openingStockInspectionChecks,
  })
  if (hasFieldErrors(fieldErrors)) return invalid(fieldErrors)

  const devices = deviceDraftToRpcPayload(draft, openingStockInspectionChecks)
  const { supabase } = await managerClient()
  const { data, error } = await supabase.rpc("receive_opening_stock_devices", {
    p_invoice_line_id: invoiceLineId,
    p_devices: devices,
  })
  if (error) {
    if (error.code === "23514" && /totals must be confirmed/i.test(error.message ?? "")) {
      return {
        ok: false,
        reason: "state-conflict",
        message: "Confirm the invoice totals on the Supplier Invoices tab before receiving devices.",
      }
    }
    if (error.code === "23505" && /already recorded/i.test(error.message ?? "")) {
      return {
        ok: false,
        reason: "duplicate",
        fieldErrors: { imei: "This IMEI is already recorded elsewhere in the store." },
        message: "This IMEI is already recorded elsewhere in the store.",
      }
    }
    if (error.code === "23514" && /exceed invoiced/i.test(error.message ?? "")) {
      return {
        ok: false,
        reason: "state-conflict",
        message: "This line has no outstanding units. Increase the invoiced quantity first.",
      }
    }
    return failure(error)
  }

  revalidatePath(route)
  const row = firstRow(data)
  return {
    ok: true,
    message: "Device received and staged.",
    data: {
      unitId: typeof row?.unit_id === "string" ? row.unit_id : "",
      imei: typeof row?.imei === "string" ? row.imei : "",
      quantityReceived: typeof row?.quantity_received === "number" ? row.quantity_received : 0,
      quantityOutstanding: typeof row?.quantity_outstanding === "number" ? row.quantity_outstanding : 0,
    },
  }
}

/**
 * Records a battery measurement that receiving could not obtain.
 *
 * The database restricts this to a staged unit whose measurement is still
 * unknown, so it can never revise a recorded reading and can never touch a
 * unit that is already sellable. Activation stays a separate, separately
 * permissioned step.
 */
export async function recordBatteryHealthInlineAction(
  unitId: string,
  batteryHealth: string
): Promise<ActionResult> {
  let parsed
  try {
    const formData = new FormData()
    formData.set("unitId", parseUuid(unitId, "staged unit"))
    formData.set("batteryHealth", batteryHealth)
    parsed = parseBatteryHealthRecordInput(formData)
  } catch (error) {
    return invalid({ batteryHealth: error instanceof Error ? error.message : "Enter the measured battery health." })
  }

  const { supabase } = await managerClient()
  const { error } = await supabase.rpc("record_opening_stock_unit_battery_health", {
    p_unit_id: parsed.unitId,
    p_battery_health: parsed.batteryHealth,
  })
  if (error) {
    if (error.code === "23514" && /already recorded/i.test(error.message ?? "")) {
      return {
        ok: false,
        reason: "state-conflict",
        message: "Battery health is already recorded for this device. Reload to see the stored value.",
      }
    }
    if (error.code === "23514" && /staged unit/i.test(error.message ?? "")) {
      return {
        ok: false,
        reason: "state-conflict",
        message: "This device is already sellable, so its battery health can no longer change.",
      }
    }
    return failure(error)
  }

  revalidatePath(route)
  return { ok: true, message: "Battery health recorded. The device can now be activated.", data: undefined }
}

export async function activateUnitInlineAction(
  unitId: string,
  approvedPriceGhs: string
): Promise<ActionResult> {
  let parsed
  try {
    const formData = new FormData()
    formData.set("unitId", parseUuid(unitId, "staged unit"))
    formData.set("approvedPriceGhs", approvedPriceGhs)
    formData.set("priceConfirmed", "on")
    parsed = parseActivationInput(formData)
  } catch (error) {
    return invalid({ approvedPriceGhs: error instanceof Error ? error.message : "Enter the approved sale price." })
  }

  // Activation itself demands the pricing-approval permission in the database.
  const { supabase } = await managerClientWithPricing()
  const { error } = await supabase.rpc("activate_opening_stock_unit", {
    p_unit_id: parsed.unitId,
    p_approved_price_pesewas: parsed.approvedPricePesewas,
    p_price_confirmed: true,
  })
  if (error) {
    if (error.code === "23514" && /measured battery health/i.test(error.message ?? "")) {
      return {
        ok: false,
        reason: "state-conflict",
        message: "Record this device's measured battery health before approving its sale price.",
      }
    }
    return failure(error)
  }

  revalidatePath(route)
  return { ok: true, message: "Device activated into sellable inventory.", data: undefined }
}

export async function repriceInlineAction(
  unitId: string,
  expectedPriceGhs: string,
  newPriceGhs: string,
  reason: string
): Promise<ActionResult> {
  let parsed
  try {
    const formData = new FormData()
    formData.set("unitId", parseUuid(unitId, "activated unit"))
    formData.set("expectedPriceGhs", expectedPriceGhs)
    formData.set("newPriceGhs", newPriceGhs)
    formData.set("reason", reason)
    formData.set("priceConfirmed", "on")
    parsed = parseRepricingInput(formData)
  } catch (error) {
    return invalid({ newPriceGhs: error instanceof Error ? error.message : "Check the new price and reason." })
  }

  const { supabase } = await managerClientWithPricing()
  const { error } = await supabase.rpc("reprice_opening_stock_unit", {
    p_unit_id: parsed.unitId,
    p_expected_price_pesewas: parsed.expectedPricePesewas,
    p_new_price_pesewas: parsed.newPricePesewas,
    p_reason: parsed.reason,
    p_price_confirmed: true,
  })
  if (error) {
    if (error.code === "23514" && /price/i.test(error.message ?? "")) {
      return {
        ok: false,
        reason: "state-conflict",
        message: "The approved price changed since this row loaded. Re-read the row and try again.",
      }
    }
    return failure(error)
  }

  revalidatePath(route)
  return { ok: true, message: "Approved price changed and audited.", data: undefined }
}

/**
 * Retires a keyed product line that was entered by mistake.
 *
 * This is the one genuinely new backend operation. It is not a table delete:
 * `remove_supplier_invoice_line` refuses closed invoices, refuses a line that
 * already has received devices, refuses to leave an invoice with no lines,
 * resets the invoice confirmation, compacts the numbering, and writes both an
 * append-only correction row and an audit event with a mandatory reason.
 */
export async function removeSupplierInvoiceLineInlineAction(
  lineId: string,
  reason: string
): Promise<ActionResult<{ correctionId: string }>> {
  let parsedLineId
  try {
    parsedLineId = parseUuid(lineId, "invoice line")
  } catch (error) {
    return invalid({ line: error instanceof Error ? error.message : "Select an invoice line." })
  }

  const trimmed = reason.trim()
  if (trimmed.length < 5 || trimmed.length > 500) {
    return invalid({ reason: "Give a reason of at least 5 characters so the removal can be audited." })
  }

  const { supabase } = await managerClient()
  const { data, error } = await supabase.rpc("remove_supplier_invoice_line", {
    p_invoice_line_id: parsedLineId,
    p_reason: trimmed,
  })
  if (error) {
    if (error.code === "23514" && /devices are received/i.test(error.message ?? "")) {
      return {
        ok: false,
        reason: "state-conflict",
        message: "This line has devices against it. Reduce the quantity or correct the line instead of removing it.",
      }
    }
    if (error.code === "23514" && /last invoice line/i.test(error.message ?? "")) {
      return {
        ok: false,
        reason: "state-conflict",
        message: "The last line cannot be removed. Close the invoice instead.",
      }
    }
    if (error.code === "23514" && /closed invoice/i.test(error.message ?? "")) {
      return { ok: false, reason: "state-conflict", message: "A closed invoice is read-only." }
    }
    return failure(error)
  }

  revalidatePath(route)
  const correctionId = firstRow(data)?.correction_id
  return {
    ok: true,
    message: "Line removed. The reason is recorded in the audit history.",
    data: { correctionId: typeof correctionId === "string" ? correctionId : "" },
  }
}

/* ------------------------------------------------------------------ *
 * Completing a pending inspection
 * ------------------------------------------------------------------ */

/**
 * Records the physical checks a manager has now performed on a staged handset.
 *
 * Only the five checks the inspection photos could not evidence are ever sent.
 * The database merges them into the stored document without touching the three
 * attestations recorded at receipt, so this action cannot erase evidence even if
 * the client sends something unexpected — and the client is not trusted to be
 * the thing that preserves them.
 */
export async function completeInspectionInlineAction(
  unitId: string,
  checks: Record<string, boolean | undefined>,
  inspectionNotes: string
): Promise<ActionResult<{ inspectionReady: boolean }>> {
  let parsed
  let resolvedUnitId
  try {
    resolvedUnitId = parseUuid(unitId, "staged device")
    parsed = parseInspectionCompletionInput(checks, inspectionNotes)
  } catch (error) {
    return invalid({ inspection: error instanceof Error ? error.message : "Record the checks that passed." })
  }

  const { supabase } = await managerClient()
  const { data, error } = await supabase.rpc("complete_opening_stock_inspection", {
    p_unit_id: resolvedUnitId,
    p_checks: parsed.checks,
    p_inspection_notes: parsed.notes,
  })
  if (error) {
    if (error.code === "23514" && /only staged units can be inspected/i.test(error.message ?? "")) {
      return {
        ok: false,
        reason: "state-conflict",
        message: "Only a staged device can be inspected. This device has already moved on.",
      }
    }
    if (error.code === "23514" && /cannot be removed or overwritten/i.test(error.message ?? "")) {
      return {
        ok: false,
        reason: "state-conflict",
        message: "Recorded inspection evidence cannot be overwritten. Reload the device and try again.",
      }
    }
    return failure(error)
  }

  const ready = firstRow(data)?.inspection_ready === true
  revalidatePath(route)
  return {
    ok: true,
    message: ready
      ? "All eight checks are recorded. Model the cosmetic condition and battery health before activation."
      : "Physical checks recorded. The device stays staged until every check, the condition and the battery reading are in.",
    data: { inspectionReady: ready },
  }
}

/**
 * Records the cosmetic condition a manager assessed on the physical handset.
 * The database accepts this once per unit and only while it is staged.
 */
export async function recordConditionInlineAction(unitId: string, condition: string): Promise<ActionResult> {
  let parsedCondition
  let resolvedUnitId
  try {
    resolvedUnitId = parseUuid(unitId, "staged device")
    parsedCondition = parseConditionRecordInput(condition)
  } catch (error) {
    return invalid({ condition: error instanceof Error ? error.message : "Select the assessed condition." })
  }

  const { supabase } = await managerClient()
  const { error } = await supabase.rpc("record_opening_stock_unit_condition", {
    p_unit_id: resolvedUnitId,
    p_condition: parsedCondition,
  })
  if (error) {
    if (error.code === "23514" && /already recorded/i.test(error.message ?? "")) {
      return {
        ok: false,
        reason: "state-conflict",
        message: "The cosmetic condition is already recorded for this device. Reload to see the stored value.",
      }
    }
    if (error.code === "23514" && /staged unit/i.test(error.message ?? "")) {
      return {
        ok: false,
        reason: "state-conflict",
        message: "Only a staged device can be graded. This device has already moved on.",
      }
    }
    return failure(error)
  }

  revalidatePath(route)
  return { ok: true, message: "Cosmetic condition recorded.", data: undefined }
}
