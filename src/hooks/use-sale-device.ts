"use client"

import { useEffect, useState } from "react"

import { loadSaleDevice } from "@/lib/employee-sale"
import { inventoryPhones, type Phone } from "@/lib/inventory"

export function useSaleDevice() {
  const [device, setDevice] = useState<Phone>(inventoryPhones[0])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setDevice(loadSaleDevice()))
    return () => window.cancelAnimationFrame(frame)
  }, [])

  return device
}
