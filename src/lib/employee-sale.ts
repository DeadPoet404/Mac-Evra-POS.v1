import { findInventoryPhoneByImei, inventoryPhones, type Phone } from "@/lib/inventory"

export const SALE_DEVICE_STORAGE_KEY = "macEvraSaleDeviceImei"
export const SALE_CUSTOMER_STORAGE_KEY = "macEvraCustomer"
export const SALE_PAYMENT_STORAGE_KEY = "macEvraPayment"

export function saveSaleDevice(phone: Phone) {
  sessionStorage.setItem(SALE_DEVICE_STORAGE_KEY, phone.imei)
}

export function loadSaleDevice(): Phone {
  const imei = sessionStorage.getItem(SALE_DEVICE_STORAGE_KEY)
  return (imei ? findInventoryPhoneByImei(imei) : null) ?? inventoryPhones[0]
}

export function startSaleWithDevice(phone: Phone) {
  saveSaleDevice(phone)
  sessionStorage.removeItem(SALE_CUSTOMER_STORAGE_KEY)
  sessionStorage.removeItem(SALE_PAYMENT_STORAGE_KEY)
}
