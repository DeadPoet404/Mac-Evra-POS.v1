export const tradeInStatuses = ["draft", "pending", "approved", "declined", "intaken"] as const
export type TradeInStatus = (typeof tradeInStatuses)[number]

export const identifierTypes = ["imei", "serial"] as const
export type TradeInIdentifierType = (typeof identifierTypes)[number]

export const cosmeticConditions = ["unknown", "not_tested", "excellent", "good", "fair", "poor"] as const
export type CosmeticCondition = (typeof cosmeticConditions)[number]

export const inspectionResults = ["unknown", "not_tested", "pass", "issue", "not_applicable"] as const
export type InspectionResult = (typeof inspectionResults)[number]

export type TradeInCustomerInput = {
  fullName: string
  phone: string
  email: string
}

export type TradeInDeviceInput = {
  brand: string
  model: string
  storageGb: number
  colour: string
  identifierType: TradeInIdentifierType
  identifier: string
}

export type TradeInInspectionInput = {
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
  notes: string
}

function normalizedText(value: FormDataEntryValue | string | null | undefined) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : ""
}

export function isValidImei(value: string) {
  if (!/^\d{15}$/.test(value)) return false
  let checksum = 0
  for (let index = 0; index < value.length; index += 1) {
    let digit = Number(value[index])
    if (index < 14 && (index + 1) % 2 === 0) {
      digit *= 2
      digit = Math.floor(digit / 10) + (digit % 10)
    }
    checksum += digit
  }
  return checksum % 10 === 0
}

export function normalizeTradeInCustomer(input: {
  fullName: FormDataEntryValue | string | null | undefined
  phone: FormDataEntryValue | string | null | undefined
  email: FormDataEntryValue | string | null | undefined
}): TradeInCustomerInput {
  const fullName = normalizedText(input.fullName)
  const phone = normalizedText(input.phone)
  const email = normalizedText(input.email).toLowerCase()

  if (fullName.length < 2 || fullName.length > 160) {
    throw new Error("Customer name must contain between 2 and 160 characters.")
  }
  if (phone.length < 7 || phone.length > 32 || !/^[\s()+0-9-]+$/.test(phone)) {
    throw new Error("Enter a valid customer phone number.")
  }
  const digits = phone.replace(/\D/g, "")
  if (digits.length < 7 || digits.length > 15) throw new Error("Enter a valid customer phone number.")
  if (email && (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new Error("Enter a valid customer email address.")
  }
  return { fullName, phone, email }
}

export function normalizeTradeInDevice(input: {
  brand: FormDataEntryValue | string | null | undefined
  model: FormDataEntryValue | string | null | undefined
  storageGb: FormDataEntryValue | string | null | undefined
  colour: FormDataEntryValue | string | null | undefined
  identifierType: FormDataEntryValue | string | null | undefined
  identifier: FormDataEntryValue | string | null | undefined
}): TradeInDeviceInput {
  const brand = normalizedText(input.brand)
  const model = normalizedText(input.model)
  const colour = normalizedText(input.colour)
  const storageText = normalizedText(input.storageGb)
  const storageGb = Number(storageText)
  const identifierType = normalizedText(input.identifierType).toLowerCase()
  const identifier = normalizedText(input.identifier)

  if (!brand || brand.length > 80 || !model || model.length > 160 || !colour || colour.length > 80) {
    throw new Error("Enter a valid brand, model and colour.")
  }
  if (!/^\d{1,4}$/.test(storageText) || !Number.isInteger(storageGb) || storageGb < 1 || storageGb > 2048) {
    throw new Error("Storage must be a whole number between 1 and 2,048 GB.")
  }
  if (!identifierTypes.includes(identifierType as TradeInIdentifierType)) {
    throw new Error("Choose IMEI or serial number.")
  }
  if (identifierType === "imei" && !isValidImei(identifier)) {
    throw new Error("Enter a valid 15-digit Luhn IMEI.")
  }
  if (identifierType === "serial" && (identifier.length < 4 || identifier.length > 80 || !/^[A-Za-z0-9._/-]+$/.test(identifier))) {
    throw new Error("Enter a serial number using 4 to 80 supported characters.")
  }
  return {
    brand,
    model,
    storageGb,
    colour,
    identifierType: identifierType as TradeInIdentifierType,
    identifier: identifierType === "serial" ? identifier.toUpperCase() : identifier,
  }
}

function inspectionResult(value: FormDataEntryValue | string | null | undefined, label: string): InspectionResult {
  const normalized = normalizedText(value).toLowerCase()
  if (!inspectionResults.includes(normalized as InspectionResult)) throw new Error(`Select a valid ${label} result.`)
  return normalized as InspectionResult
}

export function normalizeTradeInInspection(input: {
  cosmeticCondition: FormDataEntryValue | string | null | undefined
  displayCheck: FormDataEntryValue | string | null | undefined
  batteryCheck: FormDataEntryValue | string | null | undefined
  batteryHealth: FormDataEntryValue | string | null | undefined
  camerasCheck: FormDataEntryValue | string | null | undefined
  buttonsCheck: FormDataEntryValue | string | null | undefined
  connectivityCheck: FormDataEntryValue | string | null | undefined
  biometricCheck: FormDataEntryValue | string | null | undefined
  activationLockCheck: FormDataEntryValue | string | null | undefined
  otherFunctionalCheck: FormDataEntryValue | string | null | undefined
  notes: FormDataEntryValue | string | null | undefined
}): TradeInInspectionInput {
  const cosmeticCondition = normalizedText(input.cosmeticCondition).toLowerCase()
  if (!cosmeticConditions.includes(cosmeticCondition as CosmeticCondition)) {
    throw new Error("Select a valid cosmetic condition.")
  }
  const batteryHealthText = normalizedText(input.batteryHealth)
  const batteryHealth = batteryHealthText ? Number(batteryHealthText) : null
  if (batteryHealth !== null && (!/^\d{1,3}$/.test(batteryHealthText) || !Number.isInteger(batteryHealth) || batteryHealth < 1 || batteryHealth > 100)) {
    throw new Error("Battery health must be a whole percentage between 1 and 100.")
  }
  const notes = normalizedText(input.notes)
  if (notes.length > 2000) throw new Error("Inspection notes must not exceed 2,000 characters.")

  return {
    cosmeticCondition: cosmeticCondition as CosmeticCondition,
    displayCheck: inspectionResult(input.displayCheck, "display"),
    batteryCheck: inspectionResult(input.batteryCheck, "battery"),
    batteryHealth,
    camerasCheck: inspectionResult(input.camerasCheck, "camera"),
    buttonsCheck: inspectionResult(input.buttonsCheck, "buttons and ports"),
    connectivityCheck: inspectionResult(input.connectivityCheck, "connectivity"),
    biometricCheck: inspectionResult(input.biometricCheck, "biometric"),
    activationLockCheck: inspectionResult(input.activationLockCheck, "activation-lock"),
    otherFunctionalCheck: inspectionResult(input.otherFunctionalCheck, "other functionality"),
    notes,
  }
}

export function normalizeProposedOffer(value: FormDataEntryValue | string | null | undefined) {
  const input = typeof value === "string" ? value.trim() : ""
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(input)) {
    throw new Error("Enter a valid Ghana cedi amount with no more than two decimal places.")
  }
  const [cedis, fraction = ""] = input.split(".")
  const amount = Number(BigInt(cedis) * BigInt(100) + BigInt(fraction.padEnd(2, "0")))
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 10_000_000_000) {
    throw new Error("Enter a positive proposed offer.")
  }
  return amount
}

export function normalizeMeaningfulNote(
  value: FormDataEntryValue | string | null | undefined,
  label: string,
  maximum = 1000
) {
  const note = normalizedText(value)
  if (note.length < 10 || note.length > maximum) {
    throw new Error(`${label} must contain between 10 and ${maximum.toLocaleString("en-GH")} characters.`)
  }
  return note
}

export function tradeInStatusLabel(status: TradeInStatus) {
  if (status === "pending") return "Pending manager review"
  if (status === "intaken") return "Physically received"
  return status[0].toUpperCase() + status.slice(1)
}

export function tradeInResumeStep(progressStep: number, requestedStep?: string) {
  const progress = Math.min(4, Math.max(1, Number.isInteger(progressStep) ? progressStep : 1))
  const requested = Number(requestedStep)
  return Number.isInteger(requested) && requested >= 1 && requested <= progress ? requested : progress
}

export function tradeInNextAction(status: TradeInStatus, progressStep: number) {
  if (status === "draft") {
    if (progressStep <= 1) return "Save the customer details."
    if (progressStep === 2) return "Save the device and verified identifier."
    if (progressStep === 3) return "Record the structured inspection."
    return "Enter a non-final proposed offer and submit for manager review."
  }
  if (status === "pending") return "A different authorised manager must approve or decline this request."
  if (status === "approved") return "Approval is recorded. Inventory remains unchanged until authorised physical receipt."
  if (status === "declined") return "No further action is available for this declined request."
  return "Physical receipt and inventory provenance are recorded."
}

export function isTradeInInventoryEligible(input: {
  identifierType: TradeInIdentifierType | null
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
}) {
  return input.identifierType === "imei"
    && (["excellent", "good", "fair"] as string[]).includes(input.cosmeticCondition)
    && input.displayCheck === "pass"
    && input.batteryCheck === "pass"
    && input.batteryHealth !== null
    && input.camerasCheck === "pass"
    && input.buttonsCheck === "pass"
    && input.connectivityCheck === "pass"
    && input.activationLockCheck === "pass"
    && (["pass", "not_applicable"] as string[]).includes(input.biometricCheck)
    && (["pass", "not_applicable"] as string[]).includes(input.otherFunctionalCheck)
}

export function matchesTradeInSearch(input: {
  requestNumber: string
  customerName: string | null
  customerPhone: string | null
  requesterName: string
  deviceBrand: string | null
  deviceModel: string | null
  imei: string | null
  serialNumber: string | null
}, query: string) {
  const normalized = query.trim().toLocaleLowerCase("en-GH")
  if (!normalized) return true
  return [
    input.requestNumber,
    input.customerName ?? "",
    input.customerPhone ?? "",
    input.requesterName,
    input.deviceBrand ?? "",
    input.deviceModel ?? "",
    input.imei ?? "",
    input.serialNumber ?? "",
  ].join(" ").toLocaleLowerCase("en-GH").includes(normalized)
}
