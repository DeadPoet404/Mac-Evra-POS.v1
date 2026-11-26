/**
 * Pure, client-safe logic for the Opening Stock workspace.
 *
 * This module exists so that invoice/line/device editing behaviour can be unit
 * tested in Node without a browser or a database. It deliberately contains no
 * Supabase access and no React.
 *
 * The correction-targeting contract
 * --------------------------------
 * Every merge function below takes the *record being edited* as an explicit
 * first argument and derives the complete payload to send from that record
 * only. There is no lookup of "the first invoice" or "the first line" anywhere
 * in this file, and there is no helper that could reintroduce one: to build a
 * payload you must hand over the record. That is the structural fix for the
 * defect where a correction form was prefilled from the first element of the
 * invoice list while the user had selected a different invoice.
 */

import {
  inspectionFieldByCheck,
  isValidRealImei,
  normalizeOpeningStockImei,
  openingStockConditions,
  type OpeningStockCondition,
} from "./opening-stock.ts"

export type FieldErrors = Record<string, string>

/** The invoice attributes a manager may correct. Mirrors `correct_supplier_invoice`. */
export type InvoiceEditableFields = {
  supplierName: string
  supplierInvoiceNumber: string
  invoiceDate: string
  declaredTotalGhs: string
  notes: string
}

/** The line attributes a manager may correct. Mirrors `correct_supplier_invoice_line`. */
export type LineEditableFields = {
  quantityInvoiced: string
  unitCostGhs: string
}

export type InvoiceEditRecord = {
  id: string
  supplierName: string
  supplierInvoiceNumber: string | null
  invoiceDate: string
  declaredTotalPesewas: number | null
  notes: string | null
  status: "open" | "closed"
}

export type LineEditRecord = {
  id: string
  invoiceId: string
  quantityInvoiced: number
  unitCostPesewas: number | null
  quantityReceived: number
}

/** Amount already sitting in storage, ready for an editable text field. */
export function pesewasToEditableGhs(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isSafeInteger(value)) return ""
  const whole = Math.trunc(value / 100)
  const fraction = Math.abs(value % 100)
  return `${whole}.${fraction.toString().padStart(2, "0")}`
}

/** The editable-field view of one invoice, derived only from that invoice. */
export function invoiceToEditableFields(record: InvoiceEditRecord): InvoiceEditableFields {
  return {
    supplierName: record.supplierName,
    supplierInvoiceNumber: record.supplierInvoiceNumber ?? "",
    invoiceDate: record.invoiceDate,
    declaredTotalGhs: pesewasToEditableGhs(record.declaredTotalPesewas),
    notes: record.notes ?? "",
  }
}

/** The editable-field view of one line, derived only from that line. */
export function lineToEditableFields(record: LineEditRecord): LineEditableFields {
  return {
    quantityInvoiced: String(record.quantityInvoiced),
    unitCostGhs: pesewasToEditableGhs(record.unitCostPesewas),
  }
}

/**
 * Builds the `correct_supplier_invoice` payload for exactly one invoice.
 *
 * `record` is the invoice whose row the manager activated. `patch` carries only
 * the cells that changed. Unchanged cells are taken from `record`, never from
 * any other invoice.
 */
export function mergeInvoiceDraft(
  record: InvoiceEditRecord,
  patch: Partial<InvoiceEditableFields>
): InvoiceEditableFields & { invoiceId: string } {
  const base = invoiceToEditableFields(record)
  return {
    invoiceId: record.id,
    supplierName: patch.supplierName ?? base.supplierName,
    supplierInvoiceNumber: patch.supplierInvoiceNumber ?? base.supplierInvoiceNumber,
    invoiceDate: patch.invoiceDate ?? base.invoiceDate,
    declaredTotalGhs: patch.declaredTotalGhs ?? base.declaredTotalGhs,
    notes: patch.notes ?? base.notes,
  }
}

/**
 * Builds the `correct_supplier_invoice_line` payload for exactly one line.
 * Unchanged cells are taken from `record` only.
 */
export function mergeLineDraft(
  record: LineEditRecord,
  patch: Partial<LineEditableFields>
): LineEditableFields & { lineId: string } {
  const base = lineToEditableFields(record)
  return {
    lineId: record.id,
    quantityInvoiced: patch.quantityInvoiced ?? base.quantityInvoiced,
    unitCostGhs: patch.unitCostGhs ?? base.unitCostGhs,
  }
}

/** True when the requested invoice exists in the loaded set and belongs to this store/session view. */
export function resolveSelectedInvoice<T extends { id: string }>(
  invoices: readonly T[],
  requestedId: string | null | undefined
): T | null {
  if (!requestedId) return null
  return invoices.find((invoice) => invoice.id === requestedId) ?? null
}

/**
 * Picks the invoice to open on first paint: the requested one when it is valid,
 * otherwise the most recently created invoice, otherwise nothing.
 *
 * Selecting by id (rather than by index) is what keeps tab switching from
 * silently re-targeting a different invoice.
 */
export function initialInvoiceId<T extends { id: string }>(
  invoices: readonly T[],
  requestedId: string | null | undefined
): string | null {
  return resolveSelectedInvoice(invoices, requestedId)?.id ?? invoices[0]?.id ?? null
}

const invoiceReferencePattern = /^[A-Za-z0-9][A-Za-z0-9._/ -]*$/
const ghsPattern = /^\d{1,10}(?:\.\d{1,2})?$/

/** Field-level validation mirroring the database's own constraints. */
export function validateInvoiceEdit(values: InvoiceEditableFields, today = new Date()): FieldErrors {
  const errors: FieldErrors = {}
  const supplier = values.supplierName.trim()
  if (supplier.length < 2 || supplier.length > 160) {
    errors.supplierName = "Supplier must be between 2 and 160 characters."
  }
  const reference = values.supplierInvoiceNumber.trim()
  if (reference && (reference.length < 2 || reference.length > 80)) {
    errors.supplierInvoiceNumber = "Reference must be between 2 and 80 characters, or left blank."
  } else if (reference && !invoiceReferencePattern.test(reference)) {
    errors.supplierInvoiceNumber = "Use letters, numbers, spaces and . _ / - only."
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.invoiceDate)) {
    errors.invoiceDate = "Enter the invoice date."
  } else {
    const parsed = new Date(`${values.invoiceDate}T00:00:00Z`)
    const accraToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Accra" }).format(today)
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== values.invoiceDate) {
      errors.invoiceDate = "Enter a real calendar date."
    } else if (values.invoiceDate > accraToday) {
      errors.invoiceDate = "Invoice date cannot be in the future."
    } else if (values.invoiceDate < "2000-01-01") {
      errors.invoiceDate = "Invoice date cannot be before 2000."
    }
  }
  if (!ghsPattern.test(values.declaredTotalGhs.trim())) {
    errors.declaredTotalGhs = "Enter an amount with at most two decimal places."
  } else if (Number(values.declaredTotalGhs) <= 0) {
    errors.declaredTotalGhs = "Declared total must be greater than zero."
  }
  if (values.notes.trim().length > 1000) {
    errors.notes = "Notes must be 1000 characters or fewer."
  }
  return errors
}

/**
 * Field-level validation for a line correction, including the two rules the
 * database enforces but that are worth surfacing before a round trip:
 * quantity can never fall below what has already been received, and unit cost
 * is immutable once any device exists on the line.
 */
export function validateLineEdit(values: LineEditableFields, record: LineEditRecord): FieldErrors {
  const errors: FieldErrors = {}
  if (!/^\d{1,6}$/.test(values.quantityInvoiced.trim())) {
    errors.quantityInvoiced = "Enter a whole number."
  } else {
    const quantity = Number(values.quantityInvoiced)
    if (quantity < 1 || quantity > 1000) {
      errors.quantityInvoiced = "Quantity must be between 1 and 1000."
    } else if (quantity < record.quantityReceived) {
      errors.quantityInvoiced = `Cannot be less than the ${record.quantityReceived} device${record.quantityReceived === 1 ? "" : "s"} already received.`
    }
  }
  if (!ghsPattern.test(values.unitCostGhs.trim())) {
    errors.unitCostGhs = "Enter an amount with at most two decimal places."
  } else if (Number(values.unitCostGhs) <= 0) {
    errors.unitCostGhs = "Unit cost must be greater than zero."
  } else if (
    record.quantityReceived > 0 &&
    record.unitCostPesewas !== null &&
    Math.round(Number(values.unitCostGhs) * 100) !== record.unitCostPesewas
  ) {
    errors.unitCostGhs = "Unit cost is locked once a device has been received on this line."
  }
  return errors
}

export function hasFieldErrors(errors: FieldErrors) {
  return Object.keys(errors).length > 0
}

/** Line total in pesewas, or null when either side is not a usable number. */
export function computeLineTotalPesewas(quantityInvoiced: string | number, unitCostGhs: string | number) {
  const quantity = typeof quantityInvoiced === "number" ? quantityInvoiced : Number(quantityInvoiced)
  const ghs = typeof unitCostGhs === "number" ? unitCostGhs : Number(unitCostGhs)
  if (!Number.isFinite(quantity) || !Number.isFinite(ghs) || quantity <= 0 || ghs <= 0) return null
  const pesewas = Math.round(ghs * 100)
  if (!Number.isSafeInteger(pesewas)) return null
  const total = quantity * pesewas
  return Number.isSafeInteger(total) ? total : null
}

/**
 * A new device row. Every value that the database treats as physical evidence
 * starts empty. Nothing is inherited from a previous row: condition has no
 * default, battery has no default, and no inspection check is pre-ticked.
 */
export type DeviceEntryDraft = {
  invoiceLineId: string
  imei: string
  colour: string
  condition: string
  batteryHealth: string
  inspectionNotes: string
  checks: Record<string, boolean>
}

export const emptyDeviceEntry = (invoiceLineId: string): DeviceEntryDraft => ({
  invoiceLineId,
  imei: "",
  colour: "",
  condition: "",
  batteryHealth: "",
  inspectionNotes: "",
  checks: {},
})

/**
 * A blank row for a *different* line. Deliberately does not carry over colour,
 * condition, battery or inspection attestation — those describe one physical
 * handset and must be entered per device.
 */
export function nextDeviceEntry(previous: DeviceEntryDraft, invoiceLineId: string): DeviceEntryDraft {
  void previous
  return emptyDeviceEntry(invoiceLineId)
}

export const IMEI_PLACEHOLDER = "357000000000017"

/**
 * The database's inspection contract uses snake_case keys, while the shared UI
 * catalogue uses camelCase names. This is the single mapping between them, so a
 * device's attestation is always written with the exact key names that
 * `private.is_valid_opening_stock_inspection` requires.
 */
export const INSPECTION_FIELD_BY_NAME: Record<string, string> = inspectionFieldByCheck

/** Rejects the example IMEI shipped in the input placeholder, and other known fake values. */
export function isPlaceholderImei(value: string) {
  const normalized = normalizeOpeningStockImei(value)
  if (!normalized) return false
  if (normalized === IMEI_PLACEHOLDER) return true
  if (/^(\d)\1{14}$/.test(normalized)) return true
  return false
}

export type DeviceValidationContext = {
  /** IMEIs already present on this line, so a duplicate can be caught before the round trip. */
  existingImeis: readonly string[]
  inspectionChecks: readonly { name: string; label: string }[]
}

/** Validates one device row and returns per-field messages. */
export function validateDeviceEntry(
  draft: DeviceEntryDraft,
  context: DeviceValidationContext
): FieldErrors {
  const errors: FieldErrors = {}
  const imei = normalizeOpeningStockImei(draft.imei)

  if (!imei) {
    errors.imei = "Scan or type the IMEI printed on the device."
  } else if (imei.length !== 15) {
    errors.imei = `IMEI must be 15 digits; ${imei.length} entered.`
  } else if (isPlaceholderImei(imei)) {
    errors.imei = "That is a placeholder IMEI. Enter the real identifier from the device."
  } else if (!isValidRealImei(imei)) {
    errors.imei = "That IMEI failed the Luhn check. Re-scan the device."
  } else if (context.existingImeis.some((existing) => existing === imei)) {
    errors.imei = "This IMEI is already recorded on this line."
  }

  const colour = draft.colour.trim()
  if (colour.length < 2 || colour.length > 60) {
    errors.colour = "Colour must be between 2 and 60 characters."
  }

  if (!draft.condition) {
    errors.condition = "Record the inspected condition."
  } else if (!openingStockConditions.includes(draft.condition as OpeningStockCondition)) {
    errors.condition = "Select excellent, good or fair."
  }

  // A blank battery field is a deliberate "unknown" reading, not a missing
  // required value: many inspection screens report "No Data". Anything the
  // operator does type must still be a whole percentage.
  if (draft.batteryHealth.trim()) {
    if (!/^\d{1,3}$/.test(draft.batteryHealth.trim())) {
      errors.batteryHealth = "Enter a whole percentage, or leave blank if unavailable."
    } else {
      const battery = Number(draft.batteryHealth)
      if (battery < 1 || battery > 100) errors.batteryHealth = "Battery health must be between 1 and 100."
    }
  }

  const missingChecks = context.inspectionChecks.filter((check) => draft.checks[check.name] !== true)
  if (missingChecks.length > 0) {
    errors.inspection = `Confirm all ${context.inspectionChecks.length} inspection checks (${missingChecks.length} outstanding).`
  }

  if (draft.inspectionNotes.trim().length > 500) {
    errors.inspectionNotes = "Notes must be 500 characters or fewer."
  }

  return errors
}

/** Builds the JSON array the `receive_opening_stock_devices` RPC accepts. */
export function deviceDraftToRpcPayload(
  draft: DeviceEntryDraft,
  inspectionChecks: readonly { name: string }[]
) {
  const inspection: Record<string, unknown> = {}
  for (const check of inspectionChecks) {
    const field = INSPECTION_FIELD_BY_NAME[check.name]
    if (!field) throw new Error(`Unknown inspection check: ${check.name}`)
    inspection[field] = draft.checks[check.name] === true
  }
  const notes = draft.inspectionNotes.trim()
  inspection.notes = notes.length ? notes : null
  return [
    {
      imei: normalizeOpeningStockImei(draft.imei),
      colour: draft.colour.trim(),
      condition: draft.condition,
      // A blank field is sent as explicit JSON null so the database stores an
      // unknown measurement rather than rejecting the whole device.
      battery_health: draft.batteryHealth.trim() ? Number(draft.batteryHealth) : null,
      inspection,
    },
  ]
}

/** Reads a stored inspection document back into the UI's check-key shape. */
export function inspectionChecksFromRecord(inspection: Record<string, unknown>) {
  const checks: Record<string, boolean> = {}
  for (const [name, field] of Object.entries(INSPECTION_FIELD_BY_NAME)) {
    checks[name] = inspection[field] === true
  }
  return {
    checks,
    notes: typeof inspection.notes === "string" ? inspection.notes : "",
  }
}

/** Per-invoice progress used by the compact summary panel. */
export type InvoiceProgress = {
  lineCount: number
  unitsInvoiced: number
  unitsReceived: number
  unitsStaged: number
  unitsActivated: number
  unitsOutstanding: number
}

export function invoiceProgress(
  lines: readonly {
    invoiceId: string
    quantityInvoiced: number
    quantityReceived: number
    quantityStaged: number
    quantityActivated: number
    quantityOutstanding: number
  }[],
  invoiceId: string
): InvoiceProgress {
  const scoped = lines.filter((line) => line.invoiceId === invoiceId)
  return scoped.reduce<InvoiceProgress>(
    (progress, line) => ({
      lineCount: progress.lineCount + 1,
      unitsInvoiced: progress.unitsInvoiced + line.quantityInvoiced,
      unitsReceived: progress.unitsReceived + line.quantityReceived,
      unitsStaged: progress.unitsStaged + line.quantityStaged,
      unitsActivated: progress.unitsActivated + line.quantityActivated,
      unitsOutstanding: progress.unitsOutstanding + line.quantityOutstanding,
    }),
    { lineCount: 0, unitsInvoiced: 0, unitsReceived: 0, unitsStaged: 0, unitsActivated: 0, unitsOutstanding: 0 }
  )
}

/**
 * Decides where focus goes after a successful save.
 *
 * Returns the next editable cell key in document order, or the first cell of
 * the next row when the current row is exhausted, or null when there is nowhere
 * sensible to go (the caller then returns focus to the row itself).
 */
export function nextFocusKey(order: readonly string[], currentKey: string): string | null {
  const index = order.indexOf(currentKey)
  if (index < 0) return order[0] ?? null
  return order[index + 1] ?? null
}

/** Human-readable audit text for a correction, built from the recorded before/after data. */
export function describeCorrection(
  entityType: "invoice" | "invoice_line",
  before: Record<string, unknown>,
  after: Record<string, unknown>
): string[] {
  const fields =
    entityType === "invoice"
      ? (["supplier_name", "supplier_invoice_number", "invoice_date", "declared_total_pesewas", "notes"] as const)
      : (["quantity_invoiced", "unit_cost_pesewas"] as const)
  const labels: Record<string, string> = {
    supplier_name: "Supplier",
    supplier_invoice_number: "Reference",
    invoice_date: "Invoice date",
    declared_total_pesewas: "Declared total",
    notes: "Notes",
    quantity_invoiced: "Quantity",
    unit_cost_pesewas: "Unit cost",
  }
  const changes: string[] = []
  for (const field of fields) {
    const previous = before[field]
    const next = after[field]
    if (String(previous ?? "") === String(next ?? "")) continue
    const format = (value: unknown) => {
      if (value === null || value === undefined || value === "") return "empty"
      if (field.endsWith("_pesewas")) return formatPesewaValue(Number(value))
      return String(value)
    }
    changes.push(`${labels[field]}: ${format(previous)} → ${format(next)}`)
  }
  return changes
}

function formatPesewaValue(pesewas: number) {
  if (!Number.isSafeInteger(pesewas)) return String(pesewas)
  const negative = pesewas < 0
  const absolute = Math.abs(pesewas)
  const cedis = new Intl.NumberFormat("en-GH", { maximumFractionDigits: 0 }).format(Math.trunc(absolute / 100))
  const fraction = (absolute % 100).toString().padStart(2, "0")
  return `${negative ? "−" : ""}GH₵${cedis}.${fraction}`
}
