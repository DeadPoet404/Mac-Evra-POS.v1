export type TradeInCustomer = {
  name: string
  phone: string
  email: string
}

export type TradeInDevice = {
  brand: string
  model: string
  storage: string
  colour: string
  identifier: string
}

export type CosmeticRating = "Not assessed" | "Good" | "Minor wear" | "Damaged"
export type FunctionalRating = "Not assessed" | "Pass" | "Issue"
export type StatusRating = "Not assessed" | "Clear" | "Issue"

export type TradeInInspection = {
  screen: CosmeticRating
  body: CosmeticRating
  battery: string
  camera: FunctionalRating
  buttonsPorts: FunctionalRating
  biometric: FunctionalRating
  network: StatusRating
  activationLock: StatusRating
  notes: string
}

export type DemoAdjustment = {
  label: string
  amount: number
}

export type DemoValuation = {
  baseValue: number
  adjustments: DemoAdjustment[]
  estimatedOffer: number
  requiresAttention: boolean
}

export const emptyTradeInCustomer: TradeInCustomer = { name: "", phone: "", email: "" }
export const emptyTradeInDevice: TradeInDevice = { brand: "Apple", model: "", storage: "", colour: "", identifier: "" }
export const emptyTradeInInspection: TradeInInspection = {
  screen: "Not assessed",
  body: "Not assessed",
  battery: "",
  camera: "Not assessed",
  buttonsPorts: "Not assessed",
  biometric: "Not assessed",
  network: "Not assessed",
  activationLock: "Not assessed",
  notes: "",
}

/**
 * Illustration-only valuation used to demonstrate the interface. These values
 * are not Mac Evra business rules and every resulting estimate remains pending
 * manager review.
 */
export function calculateDemoValuation(inspection: TradeInInspection): DemoValuation {
  const baseValue = 2400
  const adjustments: DemoAdjustment[] = []

  if (inspection.screen === "Minor wear") adjustments.push({ label: "Demo screen wear adjustment", amount: -150 })
  if (inspection.screen === "Damaged") adjustments.push({ label: "Demo damaged screen adjustment", amount: -500 })
  if (inspection.body === "Minor wear") adjustments.push({ label: "Demo body wear adjustment", amount: -100 })
  if (inspection.body === "Damaged") adjustments.push({ label: "Demo frame damage adjustment", amount: -350 })

  const battery = Number(inspection.battery)
  if (battery > 0 && battery < 80) adjustments.push({ label: "Demo battery adjustment", amount: -250 })
  else if (battery > 0 && battery < 85) adjustments.push({ label: "Demo battery adjustment", amount: -125 })

  if (inspection.camera === "Issue") adjustments.push({ label: "Demo camera adjustment", amount: -200 })
  if (inspection.buttonsPorts === "Issue") adjustments.push({ label: "Demo buttons / ports adjustment", amount: -175 })
  if (inspection.biometric === "Issue") adjustments.push({ label: "Demo biometric adjustment", amount: -225 })
  if (inspection.network === "Issue") adjustments.push({ label: "Demo network status adjustment", amount: -400 })
  if (inspection.activationLock === "Issue") adjustments.push({ label: "Demo activation-lock adjustment", amount: -800 })

  const estimatedOffer = Math.max(0, baseValue + adjustments.reduce((total, item) => total + item.amount, 0))
  const requiresAttention =
    inspection.screen === "Damaged" ||
    inspection.body === "Damaged" ||
    battery < 80 ||
    inspection.camera === "Issue" ||
    inspection.buttonsPorts === "Issue" ||
    inspection.biometric === "Issue" ||
    inspection.network === "Issue" ||
    inspection.activationLock === "Issue"

  return { baseValue, adjustments, estimatedOffer, requiresAttention }
}

export function isInspectionComplete(inspection: TradeInInspection) {
  const battery = Number(inspection.battery)
  return (
    inspection.screen !== "Not assessed" &&
    inspection.body !== "Not assessed" &&
    battery > 0 &&
    battery <= 100 &&
    inspection.camera !== "Not assessed" &&
    inspection.buttonsPorts !== "Not assessed" &&
    inspection.biometric !== "Not assessed" &&
    inspection.network !== "Not assessed" &&
    inspection.activationLock !== "Not assessed"
  )
}
