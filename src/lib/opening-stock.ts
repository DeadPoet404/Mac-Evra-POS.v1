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
  battery_health: number
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

type FormLike = {
  get(name: string): FormDataEntryValue | null
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

export function parsePesewas(value: FormDataEntryValue | string | null | undefined, label: string) {
  const pesewas = parseGhsToPesewas(value)
  if (pesewas <= 0) throw new Error(`${label} must be greater than zero.`)
  if (pesewas > 100_000_000_000_000) throw new Error(`${label} is too large.`)
  return pesewas
}

export function parseReason(value: FormDataEntryValue | string | null | undefined) {
  const reason = requiredText(typeof value === "string" ? value : "", "correction or repricing reason", 5, 500)
  return reason
}

export function parseInspectionInput(form: FormLike): OpeningStockInspection {
  const requiredChecks = [
    "imeiConfirmed",
    "labelsMatch",
    "displayPassed",
    "camerasPassed",
    "buttonsPassed",
    "connectivityPassed",
    "chargingPortPassed",
    "activationLockCleared",
  ] as const

  for (const name of requiredChecks) {
    const value = formString(form, name)
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
  const batteryHealth = parsePositiveInteger(formString(form, "batteryHealth"), "battery health", 100)
  return {
    colour,
    condition: conditionValue as OpeningStockCondition,
    battery_health: batteryHealth,
    inspection: parseInspectionInput(form),
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

export function parseBatchDeviceInput(form: FormLike): OpeningStockDeviceInput[] {
  const common = parseCommonDeviceFields(form)
  return parseImeiBatch(formString(form, "imeiBatch")).map((imei) => ({ imei, ...common }))
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
    invoiceNumber: requiredText(formString(form, "invoiceNumber"), "supplier invoice number", 2, 80),
    invoiceDate: parseDate(formString(form, "invoiceDate")),
    notes: optionalText(formString(form, "notes"), "Invoice notes", 1000),
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
