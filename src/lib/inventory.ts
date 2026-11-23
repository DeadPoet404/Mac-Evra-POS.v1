export type InventoryStatus = "Available" | "Reserved" | "Sold"

export type Phone = {
  id: number
  model: string
  storage: string
  colour: string
  condition: "Excellent" | "Good" | "Fair"
  battery: number
  imei: string
  cost: number
  price: number
  status: InventoryStatus
  addedAt: string
}

/**
 * Shared demonstration inventory used by both employee and manager previews.
 * Each item represents one physical device with a unique IMEI.
 */
export const inventoryPhones: Phone[] = [
  { id: 1, model: "iPhone 15 Pro", storage: "256GB", colour: "Natural Titanium", condition: "Excellent", battery: 92, imei: "356789104567890", cost: 7200, price: 8500, status: "Available", addedAt: "21 Nov 2026" },
  { id: 2, model: "iPhone 14 Pro", storage: "128GB", colour: "Deep Purple", condition: "Excellent", battery: 89, imei: "356789104567891", cost: 6100, price: 7200, status: "Available", addedAt: "20 Nov 2026" },
  { id: 3, model: "iPhone 13", storage: "128GB", colour: "Midnight", condition: "Good", battery: 86, imei: "356789104567892", cost: 4000, price: 4900, status: "Reserved", addedAt: "18 Nov 2026" },
  { id: 4, model: "iPhone 15", storage: "128GB", colour: "Pink", condition: "Excellent", battery: 96, imei: "356789104567893", cost: 5700, price: 6800, status: "Available", addedAt: "22 Nov 2026" },
  { id: 5, model: "iPhone 14", storage: "128GB", colour: "Blue", condition: "Good", battery: 84, imei: "356789104567894", cost: 4400, price: 5300, status: "Sold", addedAt: "14 Nov 2026" },
  { id: 6, model: "iPhone 13 Pro", storage: "256GB", colour: "Sierra Blue", condition: "Good", battery: 88, imei: "356789104567895", cost: 4850, price: 5900, status: "Available", addedAt: "17 Nov 2026" },
  { id: 7, model: "iPhone 16 Pro", storage: "256GB", colour: "Desert Titanium", condition: "Excellent", battery: 100, imei: "356789104567896", cost: 10100, price: 11800, status: "Reserved", addedAt: "23 Nov 2026" },
  { id: 8, model: "iPhone 12", storage: "64GB", colour: "Black", condition: "Fair", battery: 79, imei: "356789104567897", cost: 2450, price: 3200, status: "Available", addedAt: "12 Nov 2026" },
]

export const formatGhs = (value: number) => `GH₵ ${value.toLocaleString("en-GH")}`

export function findInventoryPhoneByImei(imei: string) {
  return inventoryPhones.find((phone) => phone.imei === imei) ?? null
}

export function isPhoneSelectable(phone: Phone) {
  return phone.status === "Available"
}
