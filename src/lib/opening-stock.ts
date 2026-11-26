/** Kept client-safe and dependency-free so Node policy tests and server actions share one parser. */
function parseGhsToPesewas(value: FormDataEntryValue | string | null | undefined) {
  const input = typeof value === "string" ? value.trim() : ""
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(input)) {
    throw new Error("Enter a valid Ghana cedi amount with no more than two decimal places.")
  }

  const [cedis, fraction = ""] = input.split(".")
  const pesewas = BigInt(cedis) * BigInt(100) + BigInt(fraction.padEnd(2, "0"))
  if (pesewas > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Money amount is too large.")
  return Number(pesewas)
}

export const openingStockConditions = ["excellent", "good", "fair"] as const
export type OpeningStockCondition = (typeof openingStockConditions)[number]

export const openingStockUnitStatuses = ["staged", "activated"] as const
export type OpeningStockUnitStatus = (typeof openingStockUnitStatuses)[number]

export const openingStockInspectionChecks = [
  { name: "imeiConfirmed", label: "Physical IMEI matches the device" },
  { name: "labelsMatch", label: "Model and storage labels match" },
  { name: "displayPassed", label: "Display and touch pass" },
  { name: "camerasPassed", label: "Cameras pass" },
  { name: "buttonsPassed", label: "Buttons and housing pass" },
  { name: "connectivityPassed", label: "Connectivity and charging pass" },
  { name: "chargingPortPassed", label: "Ports and speakers pass" },
  { name: "activationLockCleared", label: "Activation Lock is cleared" },
] as const

export type OpeningStockInspection = {
  imei_confirmed_physical: true
  identity_labels_match: true
  display_passed: true
  cameras_passed: true
  buttons_passed: true
  connectivity_passed: true
  charging_port_passed: true
  activation_lock_cleared: true
  notes: string
}

export type OpeningStockDeviceInput = {
  imei: string
  colour: string
  condition: OpeningStockCondition
  /**
   * `null` means the inspection screen reported no battery health ("No Data").
   * It is not zero and it is never a default. An unknown reading may be staged
   * but must be measured before the unit can be activated.
   */
  battery_health: number | null
  inspection: OpeningStockInspection
}

export type OpeningStockQuantityLine = {
  quantityInvoiced: number
  quantityReceived: number
  quantityStaged: number
  quantityActivated: number
  quantityOutstanding: number
}

export type OpeningStockQuantitySummary = OpeningStockQuantityLine

export type OpeningStockReconciliationLine = {
  quantityInvoiced: number
  unitCostPesewas: number | null
  lineTotalPesewas?: number | null
  costVisible: boolean
}

export type OpeningStockInvoiceReconciliationSummary = {
  lineCount: number
  quantityInvoiced: number
  declaredTotalPesewas: number
  calculatedTotalPesewas: number | null
  differencePesewas: number | null
  reconciled: boolean
  costVisible: boolean
}

type FormLike = {
  get(name: string): FormDataEntryValue | null
  entries?(): Iterable<[string, FormDataEntryValue]>
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const knownTestImeis = new Set([
  "000000000000000",
  "490154203237518",
  "356789104567890",
])

export function normalizeOpeningStockImei(value: FormDataEntryValue | string | null | undefined) {
  return typeof value === "string" ? value.replace(/[\s-]/g, "") : ""
}

export function isValidLuhnImei(value: string) {
  if (!/^\d{15}$/.test(value)) return false

  let checksum = 0
  for (let index = 0; index < 14; index += 1) {
    let digit = Number(value[index])
    if ((index + 1) % 2 === 0) {
      digit *= 2
      digit = Math.floor(digit / 10) + (digit % 10)
    }
    checksum += digit
  }
  checksum += Number(value[14])
  return checksum % 10 === 0
}

/** Rejects Luhn-valid placeholders and implausible test patterns in addition to the real check digit. */
export function isValidRealImei(value: string) {
  const imei = normalizeOpeningStockImei(value)
  if (!isValidLuhnImei(imei) || knownTestImeis.has(imei)) return false

  const tac = imei.slice(0, 8)
  if (/^(.)\1{7}$/.test(tac) || tac === "00000000") return false

  let ascending = true
  let descending = true
  for (let index = 1; index < imei.length; index += 1) {
    const previous = Number(imei[index - 1])
    const current = Number(imei[index])
    if (current !== previous + 1) ascending = false
    if (current !== previous - 1) descending = false
  }

  return !ascending && !descending
}

function formString(form: FormLike, name: string) {
  const value = form.get(name)
  return typeof value === "string" ? value : ""
}

function requiredText(value: string, label: string, min: number, max: number) {
  const normalized = value.trim().replace(/\s+/g, " ")
  if (normalized.length < min || normalized.length > max || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error(`Enter a valid ${label}.`)
  }
  return normalized
}

function optionalText(value: string, label: string, max: number) {
  const normalized = value.trim()
  if (normalized.length > max || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error(`${label} is too long or contains control characters.`)
  }
  return normalized
}

function optionalInvoiceReference(value: string, label: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const normalized = requiredText(trimmed, label, 2, 80)
  if (!/^[A-Za-z0-9][A-Za-z0-9._/ -]*$/.test(normalized)) {
    throw new Error(`Enter a valid ${label}.`)
  }
  return normalized
}

export function parseUuid(value: FormDataEntryValue | string | null | undefined, label: string) {
  if (typeof value !== "string" || !uuidPattern.test(value)) throw new Error(`Select a valid ${label}.`)
  return value
}

export function parseDate(value: FormDataEntryValue | string | null | undefined) {
  const input = typeof value === "string" ? value.trim() : ""
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) throw new Error("Enter a valid invoice date.")
  const parsed = new Date(`${input}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== input) {
    throw new Error("Enter a valid invoice date.")
  }
  return input
}

export function parsePositiveInteger(value: FormDataEntryValue | string | null | undefined, label: string, max: number) {
  const input = typeof value === "string" ? value.trim() : ""
  if (!/^\d{1,6}$/.test(input)) throw new Error(`Enter a valid ${label}.`)
  const parsed = Number(input)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) throw new Error(`Enter a valid ${label}.`)
  return parsed
}

function parseIntegerPesewas(value: FormDataEntryValue | string | null | undefined, label: string) {
  const input = typeof value === "string" ? value.trim() : ""
  if (!/^\d{1,15}$/.test(input)) throw new Error(`Enter a valid ${label}.`)
  const parsed = Number(input)
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 100_000_000_000_000) {
    throw new Error(`${label} must be a positive integer-pesewa amount.`)
  }
  return parsed
}

export function parsePesewas(value: FormDataEntryValue | string | null | undefined, label: string) {
  const pesewas = parseGhsToPesewas(value)
  if (pesewas <= 0) throw new Error(`${label} must be greater than zero.`)
  if (pesewas > 100_000_000_000_000) throw new Error(`${label} is too large.`)
  return pesewas
}

export function parseReason(value: FormDataEntryValue | string | null | undefined) {
  return requiredText(typeof value === "string" ? value : "", "correction or repricing reason", 5, 500)
}

export function parseInspectionInput(form: FormLike): OpeningStockInspection {
  for (const check of openingStockInspectionChecks) {
    const value = formString(form, check.name)
    if (!["on", "true", "1", "yes"].includes(value.toLowerCase())) {
      throw new Error("Complete and confirm every physical inspection check.")
    }
  }

  return {
    imei_confirmed_physical: true,
    identity_labels_match: true,
    display_passed: true,
    cameras_passed: true,
    buttons_passed: true,
    connectivity_passed: true,
    charging_port_passed: true,
    activation_lock_cleared: true,
    notes: optionalText(formString(form, "inspectionNotes"), "Inspection notes", 500),
  }
}

function parseCommonDeviceFields(form: FormLike) {
  const colour = requiredText(formString(form, "colour"), "colour", 2, 60)
  const conditionValue = formString(form, "condition").toLowerCase()
  if (!openingStockConditions.includes(conditionValue as OpeningStockCondition)) {
    throw new Error("Select a valid inspected condition.")
  }
  return {
    colour,
    condition: conditionValue as OpeningStockCondition,
    battery_health: parseOptionalBatteryHealth(formString(form, "batteryHealth")),
    inspection: parseInspectionInput(form),
  }
}

/**
 * A blank battery field means the inspection reported no measurement, which is
 * recorded as unknown rather than guessed. A supplied value must still be a
 * whole percentage in 1..100, so a typo can never be stored as "unknown".
 */
export function parseOptionalBatteryHealth(value: FormDataEntryValue | string | null | undefined) {
  const input = typeof value === "string" ? value.trim() : ""
  if (!input) return null
  return parsePositiveInteger(input, "battery health", 100)
}

/** Fills in a battery measurement that receiving recorded as unknown. */
export function parseBatteryHealthRecordInput(form: FormLike) {
  return {
    unitId: parseUuid(formString(form, "unitId"), "staged unit"),
    batteryHealth: parsePositiveInteger(formString(form, "batteryHealth"), "battery health", 100),
  }
}

export function parseImeiBatch(value: FormDataEntryValue | string | null | undefined) {
  const input = typeof value === "string" ? value : ""
  const entries = input
    .split(/[\r\n,;]+/)
    .map((entry) => normalizeOpeningStockImei(entry))
    .filter(Boolean)

  if (entries.length < 1 || entries.length > 100) {
    throw new Error("Enter between 1 and 100 unique IMEIs.")
  }
  if (new Set(entries).size !== entries.length) {
    throw new Error("Each IMEI in a batch must be unique.")
  }
  for (const imei of entries) {
    if (!isValidRealImei(imei)) throw new Error(`IMEI ${imei} is not a real Luhn-valid device identifier.`)
  }
  return entries
}

export function parseIndividualDeviceInput(form: FormLike): OpeningStockDeviceInput {
  const imei = normalizeOpeningStockImei(formString(form, "imei"))
  if (!isValidRealImei(imei)) throw new Error("Enter a real 15-digit IMEI with a valid Luhn check digit.")
  return { imei, ...parseCommonDeviceFields(form) }
}

/**
 * Batch rows are strictly device-scoped. There is no top-level device detail or
 * inspection fallback that could copy one device's attestation to every IMEI.
 */
export function parseBatchDeviceInput(form: FormLike): OpeningStockDeviceInput[] {
  if (typeof form.entries !== "function") {
    throw new Error("Batch receiving requires per-device form fields.")
  }

  const deviceCount = parsePositiveInteger(formString(form, "deviceCount"), "batch device count", 100)
  const sharedFields = [
    "imei",
    "imeiBatch",
    "colour",
    "condition",
    "batteryHealth",
    "inspectionNotes",
    ...openingStockInspectionChecks.map((check) => check.name),
  ]
  if (sharedFields.some((field) => formString(form, field))) {
    throw new Error("Every batch device must provide its own details and inspection attestation.")
  }

  const allowedFields = new Set<string>([
    "imei",
    "colour",
    "condition",
    "batteryHealth",
    "inspectionNotes",
    ...openingStockInspectionChecks.map((check) => check.name),
  ])
  const rows = new Map<number, Map<string, FormDataEntryValue>>()

  for (const [key, value] of form.entries()) {
    if (!key.startsWith("devices.")) continue
    const match = /^devices\.(\d+)\.([A-Za-z][A-Za-z0-9]*)$/.exec(key)
    if (!match) throw new Error("Each batch field must belong to one numbered device.")
    const index = Number(match[1])
    const field = match[2]
    if (!Number.isSafeInteger(index) || index < 0 || index >= deviceCount) {
      throw new Error("Batch device rows are numbered out of range.")
    }
    if (!allowedFields.has(field)) throw new Error("A batch device contains an unsupported field.")
    const row = rows.get(index) ?? new Map<string, FormDataEntryValue>()
    if (row.has(field)) throw new Error("Each batch device field must be supplied once.")
    row.set(field, value)
    rows.set(index, row)
  }

  const devices: OpeningStockDeviceInput[] = []
  const seenImeis = new Set<string>()
  for (let index = 0; index < deviceCount; index += 1) {
    const row = rows.get(index)
    if (!row) throw new Error(`Device ${index + 1} is missing its own details and inspection.`)
    const rowForm: FormLike = { get: (name) => row.get(name) ?? null }
    const imei = normalizeOpeningStockImei(formString(rowForm, "imei"))
    if (!isValidRealImei(imei)) {
      throw new Error(`Device ${index + 1} needs a real 15-digit IMEI with a valid Luhn check digit.`)
    }
    if (seenImeis.has(imei)) throw new Error("Each IMEI in a batch must be unique.")
    seenImeis.add(imei)
    devices.push({ imei, ...parseCommonDeviceFields(rowForm) })
  }

  return devices
}

export function parseModelRegistrationInput(form: FormLike) {
  return {
    modelName: requiredText(formString(form, "modelName"), "model name", 2, 160),
    storageGb: parsePositiveInteger(formString(form, "storageGb"), "storage capacity", 4096),
    supplierSku: optionalText(formString(form, "supplierSku").toUpperCase(), "supplier SKU", 80),
  }
}

export function parseSupplierInvoiceInput(form: FormLike) {
  return {
    supplierName: requiredText(formString(form, "supplierName"), "supplier name", 2, 160),
    invoiceNumber: optionalInvoiceReference(formString(form, "invoiceNumber"), "supplier invoice number or reference"),
    invoiceDate: parseDate(formString(form, "invoiceDate")),
    declaredTotalPesewas: parsePesewas(formString(form, "declaredTotalGhs"), "Declared invoice total"),
    notes: optionalText(formString(form, "notes"), "Invoice notes", 1000),
  }
}

export function parseConfirmSupplierInvoiceInput(form: FormLike) {
  const confirmed = formString(form, "totalsConfirmed").toLowerCase()
  if (!["on", "true", "1", "yes"].includes(confirmed)) {
    throw new Error("Confirm that the line totals match the supplier invoice before continuing.")
  }
  return {
    invoiceId: parseUuid(formString(form, "invoiceId"), "invoice"),
    expectedDeclaredTotalPesewas: parseIntegerPesewas(formString(form, "expectedDeclaredTotalPesewas"), "Expected declared total"),
    expectedLineCount: parsePositiveInteger(formString(form, "expectedLineCount"), "expected line count", 1000),
    expectedQuantityInvoiced: parsePositiveInteger(formString(form, "expectedQuantityInvoiced"), "expected invoice quantity", 100000),
    expectedCalculatedTotalPesewas: parseIntegerPesewas(formString(form, "expectedCalculatedTotalPesewas"), "Expected calculated total"),
  }
}

export function parseInvoiceLineInput(form: FormLike) {
  const notes = optionalText(formString(form, "notes"), "Line notes", 1000)
  return {
    invoiceId: parseUuid(formString(form, "invoiceId"), "invoice"),
    modelCatalogueId: parseUuid(formString(form, "modelCatalogueId"), "registered model"),
    quantityInvoiced: parsePositiveInteger(formString(form, "quantityInvoiced"), "invoiced quantity", 1000),
    unitCostPesewas: parsePesewas(formString(form, "unitCostGhs"), "Unit purchase cost"),
    notes: notes || null,
  }
}

export function parseInvoiceCorrectionInput(form: FormLike) {
  return {
    invoiceId: parseUuid(formString(form, "invoiceId"), "invoice"),
    ...parseSupplierInvoiceInput(form),
    reason: parseReason(formString(form, "reason")),
  }
}

export function parseInvoiceLineCorrectionInput(form: FormLike) {
  return {
    lineId: parseUuid(formString(form, "lineId"), "invoice line"),
    quantityInvoiced: parsePositiveInteger(formString(form, "quantityInvoiced"), "invoiced quantity", 1000),
    unitCostPesewas: parsePesewas(formString(form, "unitCostGhs"), "Unit purchase cost"),
    reason: parseReason(formString(form, "reason")),
  }
}

export function parseActivationInput(form: FormLike) {
  const confirmed = formString(form, "priceConfirmed").toLowerCase()
  if (!["on", "true", "1", "yes"].includes(confirmed)) {
    throw new Error("Confirm that the sale price has been approved before activation.")
  }
  return {
    unitId: parseUuid(formString(form, "unitId"), "staged unit"),
    approvedPricePesewas: parsePesewas(formString(form, "approvedPriceGhs"), "Approved sale price"),
  }
}

export function parseRepricingInput(form: FormLike) {
  const confirmed = formString(form, "priceConfirmed").toLowerCase()
  if (!["on", "true", "1", "yes"].includes(confirmed)) {
    throw new Error("Confirm that the replacement sale price has been approved.")
  }
  return {
    unitId: parseUuid(formString(form, "unitId"), "activated unit"),
    expectedPricePesewas: parsePesewas(formString(form, "expectedPriceGhs"), "Current approved price"),
    newPricePesewas: parsePesewas(formString(form, "newPriceGhs"), "New approved price"),
    reason: parseReason(formString(form, "reason")),
  }
}

export function canViewPurchaseCost(permissions: readonly string[]) {
  return permissions.includes("access_manager_workspace") && permissions.includes("manage_inventory")
}

export function summarizeOpeningStockQuantities(
  lines: readonly OpeningStockQuantityLine[]
): OpeningStockQuantitySummary {
  return lines.reduce<OpeningStockQuantitySummary>(
    (summary, line) => ({
      quantityInvoiced: summary.quantityInvoiced + Math.max(0, line.quantityInvoiced),
      quantityReceived: summary.quantityReceived + Math.max(0, line.quantityReceived),
      quantityStaged: summary.quantityStaged + Math.max(0, line.quantityStaged),
      quantityActivated: summary.quantityActivated + Math.max(0, line.quantityActivated),
      quantityOutstanding: summary.quantityOutstanding + Math.max(0, line.quantityOutstanding),
    }),
    {
      quantityInvoiced: 0,
      quantityReceived: 0,
      quantityStaged: 0,
      quantityActivated: 0,
      quantityOutstanding: 0,
    }
  )
}

/** Calculates every line total from quantity × integer-pesewa unit cost. */
export function summarizeOpeningStockInvoiceReconciliation(
  lines: readonly OpeningStockReconciliationLine[],
  declaredTotalPesewas: number
): OpeningStockInvoiceReconciliationSummary {
  if (!Number.isSafeInteger(declaredTotalPesewas) || declaredTotalPesewas <= 0) {
    throw new Error("Declared invoice total must be a positive integer-pesewa amount.")
  }

  let quantityInvoiced = 0
  let calculatedTotalPesewas = 0
  let costVisible = lines.length > 0

  for (const line of lines) {
    if (!Number.isSafeInteger(line.quantityInvoiced) || line.quantityInvoiced < 1) {
      throw new Error("Each invoice line needs a positive integer quantity.")
    }
    quantityInvoiced += line.quantityInvoiced

    const unitCost = line.costVisible ? line.unitCostPesewas : null
    if (
      unitCost === null ||
      !Number.isSafeInteger(unitCost) ||
      unitCost <= 0 ||
      line.lineTotalPesewas === null
    ) {
      costVisible = false
      continue
    }

    const calculatedLineTotal = line.quantityInvoiced * unitCost
    if (!Number.isSafeInteger(calculatedLineTotal)) {
      throw new Error("Invoice line total is too large.")
    }
    if (line.lineTotalPesewas !== undefined && line.lineTotalPesewas !== calculatedLineTotal) {
      throw new Error("Invoice line total does not equal quantity × unit cost.")
    }
    calculatedTotalPesewas += calculatedLineTotal
    if (!Number.isSafeInteger(calculatedTotalPesewas)) {
      throw new Error("Calculated invoice total is too large.")
    }
  }

  return {
    lineCount: lines.length,
    quantityInvoiced,
    declaredTotalPesewas,
    calculatedTotalPesewas: costVisible ? calculatedTotalPesewas : null,
    differencePesewas: costVisible ? calculatedTotalPesewas - declaredTotalPesewas : null,
    reconciled: costVisible && calculatedTotalPesewas === declaredTotalPesewas,
    costVisible,
  }
}

/**
 * The three attestations the inspection photos actually evidence. They are
 * recorded at receipt and must survive every later inspection update untouched.
 */
export const openingStockPreservedInspectionChecks = [
  "imeiConfirmed",
  "labelsMatch",
  "activationLockCleared",
] as const

/** The five checks that can only be earned by a manager holding the handset. */
export const openingStockPendingInspectionChecks = [
  "displayPassed",
  "camerasPassed",
  "buttonsPassed",
  "connectivityPassed",
  "chargingPortPassed",
] as const

export type InspectionProgress = {
  /** Checks currently recorded as passing. */
  passed: readonly string[]
  /** Checks still missing. */
  pending: readonly string[]
  /** True only when all eight are passing. */
  complete: boolean
}

/**
 * Reads a stored inspection document into progress.
 *
 * A check counts as passed only when its stored value is literally `true`.
 * An absent key and a stored `false` are both "not passed" — the difference
 * matters for the database's merge rule but not for whether the unit can be
 * activated, which requires all eight.
 */
export function summarizeInspection(inspection: Record<string, unknown> | null | undefined): InspectionProgress {
  const document = inspection ?? {}
  const passed: string[] = []
  const pending: string[] = []
  for (const check of openingStockInspectionChecks) {
    const field = inspectionFieldByCheck[check.name]
    if (document[field] === true) passed.push(check.name)
    else pending.push(check.name)
  }
  return { passed, pending, complete: pending.length === 0 }
}

/** True when every check the photos support is still recorded as passing. */
export function preservedChecksIntact(inspection: Record<string, unknown> | null | undefined) {
  const document = inspection ?? {}
  return openingStockPreservedInspectionChecks.every(
    (name) => document[inspectionFieldByCheck[name]] === true
  )
}

/**
 * Builds the `p_checks` payload for `complete_opening_stock_inspection`.
 *
 * Only the five pending checks are ever sent, so an existing attestation cannot
 * be re-sent, re-derived, or accidentally cleared. Supplied values must be
 * exactly `true`: a manager records what passed, and an unticked box is simply
 * omitted rather than written as `false`.
 */
export function parseInspectionCompletionInput(
  checks: Record<string, boolean | undefined> | null | undefined,
  inspectionNotes: string | null | undefined
) {
  const supplied = checks ?? {}
  const payload: Record<string, true> = {}

  for (const name of openingStockPendingInspectionChecks) {
    if (supplied[name] !== true) continue
    payload[inspectionFieldByCheck[name]] = true
  }

  const unsupported = Object.keys(supplied).filter(
    (name) => !(openingStockPendingInspectionChecks as readonly string[]).includes(name)
  )
  if (unsupported.length > 0) {
    throw new Error(
      "Only the pending physical checks can be recorded here. Photo-supported checks are preserved automatically."
    )
  }

  if (Object.keys(payload).length === 0) {
    throw new Error("Record at least one physical check that passed.")
  }

  const notes = typeof inspectionNotes === "string" ? inspectionNotes.trim() : ""
  if (notes.length > 500) throw new Error("Inspection notes are too long.")
  if (/[\u0000-\u001f\u007f]/.test(notes)) {
    throw new Error("Inspection notes contain an unsupported character.")
  }

  return { checks: payload, notes: notes.length > 0 ? notes : null }
}

/** Validates a cosmetic condition a manager has assessed on the handset. */
export function parseConditionRecordInput(value: FormDataEntryValue | string | null | undefined) {
  const condition = typeof value === "string" ? value.trim().toLowerCase() : ""
  if (!openingStockConditions.includes(condition as OpeningStockCondition)) {
    throw new Error("Select the cosmetic condition you assessed: excellent, good or fair.")
  }
  return condition as OpeningStockCondition
}

/**
 * The database key for each UI check name. Declared here (rather than imported
 * from the workspace module) so these parsers stay dependency-free and usable
 * from both the server action and the Node tests.
 */
export const inspectionFieldByCheck: Record<string, string> = {
  imeiConfirmed: "imei_confirmed_physical",
  labelsMatch: "identity_labels_match",
  displayPassed: "display_passed",
  camerasPassed: "cameras_passed",
  buttonsPassed: "buttons_passed",
  connectivityPassed: "connectivity_passed",
  chargingPortPassed: "charging_port_passed",
  activationLockCleared: "activation_lock_cleared",
}
