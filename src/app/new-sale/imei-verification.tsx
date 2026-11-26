
"use client"

import { BrowserMultiFormatReader } from "@zxing/browser"
import { createWorker } from "tesseract.js"
import {
  ArrowLeft,
  BatteryMedium,
  CircleAlert,
  Plus,
  ShieldCheck,
  Trash2,
  Smartphone,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"

import { addSaleItemAction } from "@/app/new-sale/actions"
import type { AuthorizedInventoryDevice } from "@/lib/inventory-server"
import { employeeSaleStepHref, findInventoryByImei, normalizeImeiEntry } from "@/lib/sale-journey"
import { formatPesewas } from "@/lib/sales"

type ImeiCandidate = {
  imei: string
  source: "barcode" | "text"
}

const allowedReturnPaths = ["/home", "/trade-in", "/inventory"]



export function ImeiVerification({
  saleId,
  inventory,
  canReserve,
  hasAddedProduct = false,
  saleTotalPesewas = 0,
  productCount = 0,
  returnTo = "/home",
}: {
  saleId: string
  inventory: AuthorizedInventoryDevice[]
  canReserve: boolean
  hasAddedProduct?: boolean
  saleTotalPesewas: number
  productCount: number
  returnTo?: string
}) {
  const router = useRouter()
  const [imei, setImei] = useState("")
  const [sellingPriceGhs, setSellingPriceGhs] = useState("")
  const [isScanning, setIsScanning] = useState(true)
  const [manualEntry, setManualEntry] = useState(false)
  const [candidate, setCandidate] = useState<ImeiCandidate | null>(null)
  const [scanError, setScanError] = useState("")
  const [ocrReady, setOcrReady] = useState(false)
  const [showDeviceDetails, setShowDeviceDetails] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)
  const workerRef = useRef<Awaited<ReturnType<typeof createWorker>> | null>(null)
  const processingRef = useRef(false)

  const device = useMemo(() => findInventoryByImei(inventory, imei), [imei, inventory])
  const completeImei = imei.length === 15
  const available = device?.status === "available"

  const safeReturnTo = allowedReturnPaths.includes(returnTo)
    ? returnTo
    : "/home"

  function goBack() {
    controlsRef.current?.stop()
    setIsScanning(false)
    router.push(safeReturnTo)
  }

  function openManualEntry() {
    controlsRef.current?.stop()
    setIsScanning(false)
    setManualEntry(true)
    setCandidate(null)
    setScanError("")
  }

  function selectCandidate(value: string) {
    const selected = normalizeImeiEntry(value)

    if (selected.length !== 15) return

    setImei(selected)
    setCandidate(null)
    setIsScanning(false)
    controlsRef.current?.stop()
    setScanError("")
  }

  // Start the barcode reader whenever the camera screen is active.
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

          const scanned = normalizeImeiEntry(result.getText())

          if (scanned.length === 15) {
            setCandidate({ imei: scanned, source: "barcode" })
          }
        }
      )
      .then((controls) => {
        controlsRef.current = controls
        if (cancelled) controls.stop()
      })
      .catch(() => {
        if (!cancelled) {
          setScanError(
            "Camera access is unavailable. Check your camera permission or enter the IMEI manually."
          )
        }
      })

    return () => {
      cancelled = true
      controlsRef.current?.stop()
      controlsRef.current = null
    }
  }, [isScanning])

  // Prepare OCR once, then inspect the camera image periodically.
  useEffect(() => {
    let cancelled = false
    let timeout: ReturnType<typeof setTimeout> | undefined

    async function startOcr() {
      try {
        const worker = await createWorker("eng")

        if (cancelled) {
          await worker.terminate()
          return
        }

        await worker.setParameters({
          tessedit_char_whitelist: "0123456789",
        })

        workerRef.current = worker
        setOcrReady(true)
      } catch {
        if (!cancelled) {
          setScanError("Text recognition could not start. Barcode scanning is still available.")
        }
      }
    }

    startOcr()

    return () => {
      cancelled = true
      if (timeout) clearTimeout(timeout)
      workerRef.current?.terminate()
      workerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!isScanning || !ocrReady || !videoRef.current) return

    let cancelled = false

    async function inspectFrame() {
      const video = videoRef.current
      const worker = workerRef.current

      if (
        cancelled ||
        !video ||
        !worker ||
        video.readyState < 2 ||
        processingRef.current
      ) {
        timeout = setTimeout(inspectFrame, 700)
        return
      }

      processingRef.current = true

      try {
        const canvas = document.createElement("canvas")
        const width = 640
        const height = Math.round((video.videoHeight / video.videoWidth) * width)

        canvas.width = width
        canvas.height = height

        const context = canvas.getContext("2d")

        if (context) {
          context.drawImage(video, 0, 0, width, height)

          const result = await worker.recognize(canvas)
          const digits = normalizeImeiEntry(result.data.text)

          const match = digits.match(/\d{15}/)

          if (match && !cancelled) {
            setCandidate((current) => {
              if (current?.source === "barcode") return current
              return { imei: match[0], source: "text" }
            })
          }
        }
      } catch {
        // Continue scanning if an individual OCR frame fails.
      } finally {
        processingRef.current = false
      }

      if (!cancelled) {
        timeout = setTimeout(inspectFrame, 1000)
      }
    }

    let timeout: ReturnType<typeof setTimeout>

    timeout = setTimeout(inspectFrame, 1000)

    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [isScanning, ocrReady])

  return (
    <>
      {isScanning ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-[#080808] text-white">
          <div className="relative h-full w-full max-w-[560px] overflow-hidden bg-black sm:my-6 sm:h-[min(900px,calc(100vh-48px))] sm:rounded-[30px] sm:border sm:border-white/10">

            {/* Live camera background */}
            <video
              ref={videoRef}
              className="absolute inset-0 h-full w-full object-cover"
              autoPlay
              muted
              playsInline
            />

            {/* Camera contrast */}
            <div className="pointer-events-none absolute inset-0 bg-black/10" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-black/65 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />

            {/* Top controls */}
            <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-5 pb-5 pt-[calc(env(safe-area-inset-top)+16px)]">
              <button
                type="button"
                onClick={goBack}
                aria-label="Go back"
                className="flex size-11 items-center justify-center rounded-full bg-black/30 backdrop-blur-md"
              >
                <ArrowLeft size={23} />
              </button>

              <span className="text-sm font-semibold tracking-wide text-white">
                Scan device
              </span>

              <span className="size-11" />
            </header>

            {/* Lens-style focus area */}
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6">
              <div className="relative aspect-[1.12] w-[min(78vw,340px)]">

                {/* Four independent focus corners */}
                <span className="absolute left-0 top-0 h-12 w-12 rounded-tl-[22px] border-l-[5px] border-t-[5px] border-white" />
                <span className="absolute right-0 top-0 h-12 w-12 rounded-tr-[22px] border-r-[5px] border-t-[5px] border-white" />
                <span className="absolute bottom-0 left-0 h-12 w-12 rounded-bl-[22px] border-b-[5px] border-l-[5px] border-white" />
                <span className="absolute bottom-0 right-0 h-12 w-12 rounded-br-[22px] border-b-[5px] border-r-[5px] border-white" />

                {/* Subtle scanning line */}
                <div className="pointer-events-none absolute inset-x-5 top-1/2 h-px bg-gradient-to-r from-transparent via-[#B8FFDA] to-transparent shadow-[0_0_12px_2px_rgba(134,239,172,0.55)]" />

                {/* Detected IMEI — highlighted directly, no card */}
                {candidate ? (
                  <button
                    type="button"
                    onClick={() => selectCandidate(candidate.imei)}
                    className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg border border-[#A7F3D0] bg-[#064E3B]/70 px-3 py-2 text-center shadow-[0_0_24px_rgba(52,211,153,0.25)] backdrop-blur-sm"
                  >
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#A7F3D0]">
                      Detected · tap to select
                    </span>
                    <span className="mt-1 block font-mono text-lg font-bold tracking-wider text-white">
                      {candidate.imei}
                    </span>
                  </button>
                ) : null}
              </div>

              <p className="mt-8 text-center text-sm font-medium text-white/90">
                {candidate
                  ? "Tap the highlighted IMEI to continue"
                  : "Point your camera at the printed IMEI"}
              </p>

              {scanError ? (
                <p role="alert" className="mt-3 max-w-xs text-center text-xs text-red-200">
                  {scanError}
                </p>
              ) : null}
            </div>

            {/* Bottom controls */}
            <footer className={`absolute inset-x-0 z-20 flex flex-col items-center gap-4 px-6 pb-6 pt-8 ${hasAddedProduct ? "bottom-24" : "bottom-0"}`}>
              <button
                type="button"
                onClick={openManualEntry}
                aria-label="Enter IMEI manually"
                className="flex size-[62px] items-center justify-center rounded-full border border-white/30 bg-white/95 text-[#704B3B] shadow-[0_4px_25px_rgba(0,0,0,0.25)] transition active:scale-95"
              >
                <Plus size={32} strokeWidth={2.3} />
              </button>

              <button
                type="button"
                onClick={openManualEntry}
                className="text-sm font-medium text-white/90 underline decoration-white/50 underline-offset-4"
              >
                Try another way?
              </button>
            </footer>

            {hasAddedProduct ? (
              <div className="fixed inset-x-0 bottom-0 z-30 mx-auto flex w-full max-w-[430px] flex-col gap-2 bg-white/95 px-5 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#737373]">
                    {productCount} {productCount === 1 ? "product" : "products"} added
                  </span>
                  <span className="font-semibold text-[#141414]">
                    Sale Total: {formatPesewas(saleTotalPesewas)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => router.push(employeeSaleStepHref("payment", saleId))}
                  className="h-12 w-full rounded-xl bg-[#704BFA] px-6 text-[15px] font-semibold text-white shadow-lg active:scale-[0.99]"
                >
                  Verify Payment
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="h-dvh w-full overflow-hidden bg-white text-[#141414]">
          <div className="mx-auto flex h-full w-full max-w-[430px] flex-col overflow-y-auto">

            {/* Back navigation */}
            <header className="shrink-0 px-5 pb-1 pt-1">
              <button
                type="button"
                onClick={goBack}
                aria-label="Go back"
                className="flex h-10 w-10 items-center justify-start text-[#141414]"
              >
                <ArrowLeft size={34} strokeWidth={2.5} />
              </button>
            </header>

            <main className="flex flex-1 flex-col px-5 pb-4 pt-1">
              <div className="space-y-2">
                <h1 className="text-[30px] font-semibold leading-[1.2] tracking-[-0.02em]">
                  Enter barcode<br />manually
                </h1>
                <p className="max-w-[390px] text-[14px] leading-[19px] text-[#52525B]">
                  Type in the product barcode to find and add it to the transaction.
                </p>
              </div>

              {/* IMEI card: input overlaps the black device panel */}
              <div className="relative mt-3">
                {device ? (
                  <section className="relative min-h-[192px] rounded-[15px] bg-black px-2 pb-3 pt-[113px] text-white">
                    <div className="absolute left-0 right-0 top-0 z-10">
                      <div className="flex h-[105px] flex-col justify-between rounded-[15px] border-[1.5px] border-[#5B5B5B] bg-white px-2 py-2.5 text-[#5B5B5B]">
                        <div className="flex items-center justify-between">
                          <label htmlFor="imei" className="text-[13px] text-[#52525B]">
                            Enter barcode number
                          </label>
                          {imei ? (
                            <button
                              type="button"
                              onClick={() => {
                                setImei("")
                                setScanError("")
                                setShowDeviceDetails(false)
                              }}
                              aria-label="Clear IMEI"
                              className="p-1 text-red-500"
                            >
                              <Trash2 size={19} />
                            </button>
                          ) : null}
                        </div>
                        <input
                          id="imei"
                          value={imei.replace(/(\\d{5})(?=\\d)/g, "$1.")}
                          onChange={(event) => {
                            setImei(normalizeImeiEntry(event.target.value).slice(0, 15))
                            setScanError("")
                            setShowDeviceDetails(false)
                          }}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          autoComplete="off"
                          maxLength={17}
                          placeholder="XXXXX.XXXXX.XXXXX"
                          aria-label="15 digit device IMEI"
                          className="w-full min-w-0 bg-transparent text-[clamp(20px,6.5vw,30px)] font-normal tracking-normal text-[#5B5B5B] outline-none placeholder:text-[#626262]"
                        />
                      </div>
                    </div>

                    <div className="space-y-0.5 text-[13px] leading-[18px]">
                      <p>
                        <span className="mr-3 text-white">Model:</span>
                        <span className="text-white">{device.model}</span>
                      </p>
                      <p className="text-[#858585]">
                        <span className="mr-3">Color:</span>
                        {device.colour}
                      </p>
                      <p className="text-[#858585]">
                        Battery Health: {device.batteryHealth}%
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowDeviceDetails((value) => !value)}
                      aria-expanded={showDeviceDetails}
                      className="mt-1 flex w-full items-center justify-center gap-1.5 text-[12px] text-white"
                    >
                      {showDeviceDetails ? "Hide Details" : "See Details"}
                      <CircleAlert size={15} />
                    </button>

                    {showDeviceDetails ? (
                      <div className="mt-3 space-y-1 border-t border-white/20 pt-3 text-xs text-white/75">
                        <p>Storage: {device.storage}</p>
                        <p>Condition: {device.condition}</p>
                        <p>IMEI: {device.imei}</p>
                        <p>Selling price: {sellingPriceGhs.trim() ? formatPesewas(Number(sellingPriceGhs) * 100) : "Not entered"}</p>
                        <p>Status: {available ? "Available" : "Unavailable"}</p>
                      </div>
                    ) : null}
                  </section>
                ) : (
                  <div className="flex h-[95px] flex-col justify-between rounded-[20px] border-[1.5px] border-[#5B5B5B] bg-white px-2 py-2.5">
                    <div className="flex items-center justify-between">
                      <label htmlFor="imei" className="text-[13px] text-[#52525B]">
                        Enter barcode number
                      </label>
                      {imei ? (
                        <button
                          type="button"
                          onClick={() => {
                            setImei("")
                            setScanError("")
                            setShowDeviceDetails(false)
                          }}
                          aria-label="Clear IMEI"
                          className="p-1 text-red-500"
                        >
                          <Trash2 size={19} />
                        </button>
                      ) : null}
                    </div>
                    <input
                      id="imei"
                      value={imei.replace(/(\\d{5})(?=\\d)/g, "$1.")}
                      onChange={(event) => {
                        setImei(normalizeImeiEntry(event.target.value).slice(0, 15))
                        setScanError("")
                        setShowDeviceDetails(false)
                      }}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="off"
                      maxLength={17}
                      placeholder="XXXXX.XXXXX.XXXXX"
                      aria-label="15 digit device IMEI"
                      className="w-full min-w-0 bg-transparent text-[clamp(20px,6.5vw,30px)] font-normal tracking-normal text-[#5B5B5B] outline-none placeholder:text-[#626262]"
                    />
                  </div>
                )}
              </div>

              <form
                action={addSaleItemAction}
                className="mt-4 w-full"
              >
                <input type="hidden" name="saleId" value={saleId} />
                <input type="hidden" name="deviceId" value={device?.deviceId ?? ""} />

                <label htmlFor="sellingPriceGhs" className="mb-2 block text-[13px] font-medium text-[#555]">
                  Selling price (GH₵)
                </label>
                <input
                  id="sellingPriceGhs"
                  name="sellingPriceGhs"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  placeholder="Enter agreed selling price"
                  value={sellingPriceGhs}
                  onChange={(event) => {
                    setSellingPriceGhs(event.target.value.replace(/[^0-9]/g, ""))
                  }}
                  className="h-[58px] w-full rounded-[12px] border border-[#D8D8D8] bg-white px-4 text-[17px] text-[#141414] outline-none transition placeholder:text-[#A0A0A0] focus:border-[#704BFA] focus:ring-2 focus:ring-[#704BFA]/10"
                />

                <div className="mt-3 flex justify-center">
                  <button
                    type="submit"
                    disabled={!device || !available || !canReserve || !sellingPriceGhs.trim() || !Number.isFinite(Number(sellingPriceGhs)) || Number(sellingPriceGhs) <= 0}
                    className="flex h-10 min-w-[140px] items-center justify-center rounded-[10px] bg-black px-6 text-[14px] font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Add product
                  </button>
                </div>
              </form>

              {scanError ? (
                <p role="alert" className="mt-3 text-sm text-red-600">
                  {scanError}
                </p>
              ) : null}

              {completeImei && !device ? (
                <p className="mt-3 text-sm text-red-600">
                  No matching device was found in this store. Check the IMEI and try again.
                </p>
              ) : null}

              {device && (!available || !canReserve) ? (
                <p className="mt-3 text-center text-xs text-red-600">
                  {!canReserve
                    ? "Your account cannot verify sale inventory."
                    : "This device cannot be used for a new sale."}
                </p>
              ) : null}
            </main>

            {hasAddedProduct ? (
              <div className="fixed inset-x-0 bottom-0 z-30 mx-auto flex w-full max-w-[430px] flex-col gap-2 bg-white/95 px-5 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#737373]">
                    {productCount} {productCount === 1 ? "product" : "products"} added
                  </span>
                  <span className="font-semibold text-[#141414]">
                    Sale Total: {formatPesewas(saleTotalPesewas)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => router.push(employeeSaleStepHref("payment", saleId))}
                  className="h-12 w-full rounded-xl bg-[#704BFA] px-6 text-[15px] font-semibold text-white shadow-lg active:scale-[0.99]"
                >
                  Verify Payment
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </>
  )
}
