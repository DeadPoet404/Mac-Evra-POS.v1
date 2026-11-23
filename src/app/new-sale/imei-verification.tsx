"use client"

import { BrowserMultiFormatReader } from "@zxing/browser"
import { BatteryMedium, CircleAlert, ScanLine, ShieldCheck, Smartphone, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { addSaleItemAction } from "@/app/new-sale/actions"
import type { AuthorizedInventoryDevice } from "@/lib/inventory-server"
import { findInventoryByImei, normalizeImeiEntry } from "@/lib/sale-journey"
import { formatPesewas } from "@/lib/sales"

export function ImeiVerification({
  saleId,
  inventory,
  canReserve,
}: {
  saleId: string
  inventory: AuthorizedInventoryDevice[]
  canReserve: boolean
}) {
  const [imei, setImei] = useState("")
  const [isScanning, setIsScanning] = useState(false)
  const [scanError, setScanError] = useState("")
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)
  const device = useMemo(() => findInventoryByImei(inventory, imei), [imei, inventory])
  const completeImei = imei.length === 15
  const available = device?.status === "available"

  useEffect(() => {
    if (!isScanning || !videoRef.current) return
    const reader = new BrowserMultiFormatReader()
    let cancelled = false

    reader
      .decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } } },
        videoRef.current,
        (result) => {
          if (!result || cancelled) return
          const scannedImei = normalizeImeiEntry(result.getText())
          if (scannedImei.length !== 15) {
            setScanError("The scanned code was not a 15-digit IMEI. Try again or enter it manually.")
            return
          }
          setImei(scannedImei)
          setScanError("")
          setIsScanning(false)
          controlsRef.current?.stop()
        }
      )
      .then((controls) => {
        controlsRef.current = controls
        if (cancelled) controls.stop()
      })
      .catch(() => {
        if (!cancelled) {
          setScanError("Camera access is unavailable. Enter the IMEI manually.")
          setIsScanning(false)
        }
      })

    return () => {
      cancelled = true
      controlsRef.current?.stop()
      controlsRef.current = null
    }
  }, [isScanning])

  function stopScanner() {
    controlsRef.current?.stop()
    setIsScanning(false)
  }

  return (
    <>
      <section className="rounded-3xl border border-[#E8E8ED] bg-white p-5 shadow-sm sm:p-8">
        <label htmlFor="imei" className="text-sm font-semibold text-[#1D1D1F]">Device IMEI</label>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <input
            id="imei"
            value={imei}
            onChange={(event) => {
              setImei(normalizeImeiEntry(event.target.value))
              setScanError("")
            }}
            inputMode="numeric"
            autoComplete="off"
            maxLength={15}
            placeholder="Enter 15-digit IMEI"
            className="h-16 min-w-0 flex-1 rounded-2xl border border-[#D8D8DC] bg-[#FAFAFC] px-5 font-mono text-lg tracking-[0.08em] outline-none transition focus:border-[#6E0728] focus:ring-4 focus:ring-[#6E0728]/10"
          />
          <button
            type="button"
            onClick={() => {
              setScanError("")
              setIsScanning(true)
            }}
            className="inline-flex h-16 items-center justify-center gap-2 rounded-2xl border border-[#D8C4CB] px-6 text-base font-semibold text-[#6E0728]"
          >
            <ScanLine size={21} /> Scan
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-[#86868B]">
          <span>Enter the IMEI printed on the device or box.</span>
          <span className="font-mono">{imei.length}/15</span>
        </div>
        {scanError ? <p role="alert" className="mt-3 text-sm font-medium text-[#A13B34]">{scanError}</p> : null}
      </section>

      {device ? (
        <section className="mt-5 rounded-3xl border border-[#DDE8E0] bg-white p-5 shadow-sm sm:p-8">
          <div className="flex items-start gap-4">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[#F5EDF0] text-[#6E0728]"><Smartphone size={27} /></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold">{device.model}</h2>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${available ? "bg-[#F0FAF3] text-[#267343]" : "bg-[#FFF3F2] text-[#A13B34]"}`}>
                  {available ? "Available" : "Unavailable"}
                </span>
              </div>
              <p className="mt-2 text-sm text-[#68686D]">{device.storage} · {device.colour} · {device.condition}</p>
              <p className="mt-2 flex items-center gap-1.5 text-sm text-[#68686D]"><BatteryMedium size={16} /> {device.batteryHealth}% battery health</p>
              <p className="mt-2 font-mono text-xs text-[#86868B]">IMEI {device.imei}</p>
            </div>
          </div>
          <div className="mt-6 flex flex-col gap-4 border-t border-[#EFEFF1] pt-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-medium text-[#86868B]">Selling price</p>
              <p className="mt-1 text-3xl font-semibold tracking-[-0.8px] text-[#6E0728]">{formatPesewas(device.pricePesewas)}</p>
            </div>
            {available && canReserve ? (
              <form action={addSaleItemAction}>
                <input type="hidden" name="saleId" value={saleId} />
                <input type="hidden" name="deviceId" value={device.deviceId} />
                <button type="submit" className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#6E0728] px-8 text-base font-semibold text-white hover:bg-[#57051F] sm:w-auto">
                  <ShieldCheck size={19} /> Verify and continue
                </button>
              </form>
            ) : (
              <p className="max-w-xs text-sm font-medium text-[#A13B34]">
                {canReserve ? "This device cannot be used for a new sale." : "Your account cannot verify sale inventory."}
              </p>
            )}
          </div>
        </section>
      ) : completeImei ? (
        <div className="mt-5 flex gap-3 rounded-2xl border border-[#E8C9D2] bg-white p-5 text-sm text-[#6E0728]">
          <CircleAlert className="size-5 shrink-0" />
          <p>No matching device was found in this store. Check the IMEI and try again.</p>
        </div>
      ) : null}

      {isScanning ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-black">
          <div className="flex items-center justify-between px-6 pb-5 pt-[calc(env(safe-area-inset-top)+16px)] text-white">
            <button type="button" onClick={stopScanner} className="text-sm">Cancel</button>
            <span className="font-semibold">Scan IMEI</span>
            <button type="button" aria-label="Close scanner" onClick={stopScanner}><X size={22} /></button>
          </div>
          <div className="flex flex-1 items-center justify-center px-6">
            <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-[#222]">
              <video ref={videoRef} className="aspect-[3/4] w-full object-cover" autoPlay muted playsInline />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-36 w-[85%] rounded-xl border-2 border-white/90" />
              </div>
            </div>
          </div>
          <p className="px-6 pb-[calc(env(safe-area-inset-bottom)+24px)] text-center text-sm text-white/70">Keep the IMEI barcode inside the frame.</p>
        </div>
      ) : null}
    </>
  )
}
