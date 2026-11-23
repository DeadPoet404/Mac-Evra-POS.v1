"use client"

import { BrowserMultiFormatReader } from "@zxing/browser"
import { BatteryMedium, CircleAlert, Plus, ScanLine, Search, Smartphone, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { addSaleItemAction } from "@/app/new-sale/actions"
import type { AuthorizedInventoryDevice } from "@/lib/inventory-server"
import { formatPesewas } from "@/lib/sales"

export function InventoryPicker({
  saleId,
  inventory,
  addedDeviceIds,
}: {
  saleId: string
  inventory: AuthorizedInventoryDevice[]
  addedDeviceIds: string[]
}) {
  const [query, setQuery] = useState("")
  const [isScanning, setIsScanning] = useState(false)
  const [scanError, setScanError] = useState("")
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)
  const added = useMemo(() => new Set(addedDeviceIds), [addedDeviceIds])

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return inventory.filter((device) =>
      !normalized ||
      [device.model, device.storage, device.colour, device.condition, device.imei]
        .join(" ")
        .toLowerCase()
        .includes(normalized)
    )
  }, [inventory, query])

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
          setQuery(result.getText())
          setIsScanning(false)
          controlsRef.current?.stop()
        }
      )
      .then((controls) => {
        controlsRef.current = controls
        if (cancelled) controls.stop()
      })
      .catch(() => {
        if (!cancelled) setScanError("Camera access was unavailable. Search by IMEI instead.")
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
    <section className="rounded-3xl border border-[#E8E8ED] bg-white p-5 sm:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#86868B]">Store inventory</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.6px]">Add physical devices</h2>
          <p className="mt-1 text-sm text-[#86868B]">Prices and availability are read from Supabase and revalidated when reserved.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setScanError("")
            setIsScanning(true)
          }}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[#D8C4CB] px-4 text-sm font-semibold text-[#6E0728]"
        >
          <ScanLine size={16} /> Scan IMEI
        </button>
      </div>

      <div className="relative mt-5">
        <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#86868B]" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search model, colour or IMEI"
          className="h-12 w-full rounded-xl border border-[#E5E5E7] bg-[#FAFAFC] pl-11 pr-4 text-sm outline-none focus:border-[#6E0728]"
        />
      </div>
      {scanError ? <p role="alert" className="mt-3 text-sm text-[#A13B34]">{scanError}</p> : null}

      {filtered.length ? (
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {filtered.map((device) => {
            const isAdded = added.has(device.deviceId)
            const canAdd = device.status === "available" || isAdded
            return (
              <article key={device.inventoryId} className="rounded-2xl border border-[#E8E8ED] p-4">
                <div className="flex gap-3">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#F5EDF0] text-[#6E0728]">
                    <Smartphone size={22} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{device.model}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${isAdded ? "bg-[#F5EDF0] text-[#6E0728]" : device.status === "available" ? "bg-[#F0FAF3] text-[#267343]" : "bg-[#FFF9EB] text-[#8A6517]"}`}>
                        {isAdded ? "In this draft" : device.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[#86868B]">{device.storage} · {device.colour} · {device.condition}</p>
                    <p className="mt-2 flex items-center gap-1 text-xs text-[#68686D]"><BatteryMedium size={13} /> {device.batteryHealth}% battery</p>
                    <p className="mt-2 font-mono text-[11px] text-[#86868B]">IMEI {device.imei}</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#F0F0F2] pt-4">
                  <p className="font-semibold text-[#6E0728]">{formatPesewas(device.pricePesewas)}</p>
                  {isAdded ? (
                    <span className="text-xs font-semibold text-[#6E0728]">Added</span>
                  ) : (
                    <form action={addSaleItemAction}>
                      <input type="hidden" name="saleId" value={saleId} />
                      <input type="hidden" name="deviceId" value={device.deviceId} />
                      <button
                        type="submit"
                        disabled={!canAdd}
                        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#6E0728] px-4 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#C7AAB4]"
                      >
                        <Plus size={14} /> {canAdd ? "Reserve & add" : "Unavailable"}
                      </button>
                    </form>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-[#D8D8DC] p-10 text-center">
          <CircleAlert className="mx-auto size-6 text-[#A1A1A6]" />
          <p className="mt-3 font-semibold">No matching inventory</p>
          <p className="mt-1 text-sm text-[#86868B]">Try a model name, colour, or complete 15-digit IMEI.</p>
        </div>
      )}

      {isScanning ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-black">
          <div className="flex items-center justify-between px-6 pb-5 pt-[calc(env(safe-area-inset-top)+16px)] text-white">
            <button type="button" onClick={stopScanner} className="text-sm">Cancel</button>
            <span className="font-semibold">Scan inventory IMEI</span>
            <button type="button" aria-label="Close scanner" onClick={stopScanner}><X size={20} /></button>
          </div>
          <div className="flex flex-1 items-center justify-center px-6">
            <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-[#222]">
              <video ref={videoRef} className="aspect-[3/4] w-full object-cover" autoPlay muted playsInline />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-36 w-[85%] rounded-xl border-2 border-white/90" />
              </div>
            </div>
          </div>
          <p className="pb-[calc(env(safe-area-inset-bottom)+24px)] text-center text-sm text-white/70">Scanning only searches trusted store inventory; it does not add an item automatically.</p>
        </div>
      ) : null}
    </section>
  )
}
