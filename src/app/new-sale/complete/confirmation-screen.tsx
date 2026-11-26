 "use client"

import Image from "next/image"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Info, ChevronUp, ChevronDown } from "lucide-react"

type DeviceDetail = {
  description: string
  imei: string
  colour: string | null
  condition: string | null
  batteryHealth: number | null
  storage: string | null
}

type Props = {
  customerName: string
  saleNumber: string
  productName: string
  total: string
  devices: DeviceDetail[]
}

function readableCondition(value: string | null) {
  if (!value) return "Not available"
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function ConfirmationScreen({
  customerName,
  saleNumber,
  productName,
  total,
  devices,
}: Props) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const first = devices[0]

  return (
    <main className="min-h-dvh w-full bg-white text-black">
      <div className="h-14 w-full border-b border-[#E5E7EB] bg-[#F5F5F6]" />

      <div className="mx-auto flex min-h-[calc(100dvh-56px)] w-full max-w-[430px] flex-col px-5 pb-7">
        <header className="flex flex-col items-center pt-6">
          <div className="font-serif text-[36px] font-bold italic tracking-[-1.5px] text-black">
            SharkPay
          </div>

          <div className="relative my-2 h-[230px] w-full max-w-[310px] max-[390px]:h-[195px]">
            <Image
              src="/hero-yellow-boxes-stack.png"
              alt="Stacked yellow order boxes"
              fill
              priority
              sizes="(max-width: 430px) 310px, 310px"
              className="object-contain"
            />
          </div>
        </header>

        <section className="w-full rounded-[28px] bg-[#050505] px-5 pb-4 pt-5 text-white">
          <div>
            <p className="text-[15px] font-normal text-white">Customer Name</p>
            <div className="mt-2 flex h-[3px] w-full gap-1.5">
              <div className="w-1/2 rounded-full bg-white" />
              <div className="w-1/2 rounded-full bg-[#3A3A3C]" />
            </div>
          </div>

          <p className="mt-3 text-[14px] text-[#A1A1AA]">{customerName}</p>
          <h1 className="mt-1 break-words text-[24px] font-semibold leading-tight text-white">
            {productName}
          </h1>

          {devices.length > 1 ? (
            <p className="mt-1 text-xs text-[#A1A1AA]">
              Plus {devices.length - 1} more {devices.length === 2 ? "device" : "devices"}
            </p>
          ) : null}

          <div className="my-4 border-b border-dashed border-[#3A3A3C]" />

          <div className="space-y-1.5 text-[14px]">
            <div className="flex justify-between gap-3">
              <span className="text-[#8E8E93]">Color:</span>
              <span className="text-right text-white">{first?.colour ?? "Not available"}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-[#8E8E93]">Condition:</span>
              <span className="text-right text-white">{readableCondition(first?.condition ?? null)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-[#8E8E93]">Battery Health:</span>
              <span className="text-right text-white">
                {first?.batteryHealth != null ? `${first.batteryHealth}%` : "Not available"}
              </span>
            </div>
          </div>

          {expanded ? (
            <div className="mt-4 space-y-4 border-t border-dashed border-[#3A3A3C] pt-4">
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-[#8E8E93]">Order ID</span>
                <span className="break-all text-right text-white">{saleNumber}</span>
              </div>
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-[#8E8E93]">Sale Total</span>
                <span className="text-right font-semibold text-white">{total}</span>
              </div>
              {devices.map((device, index) => (
                <div key={`${device.imei}-${index}`} className="border-t border-[#3A3A3C] pt-3">
                  <p className="mb-2 text-sm font-semibold text-white">
                    {device.description}
                  </p>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between gap-3">
                      <span className="text-[#8E8E93]">Storage</span>
                      <span className="text-right text-white">{device.storage ?? "Not available"}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-[#8E8E93]">IMEI</span>
                      <span className="break-all text-right text-white">{device.imei}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-[#8E8E93]">Color</span>
                      <span className="text-right text-white">{device.colour ?? "Not available"}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-[#8E8E93]">Condition</span>
                      <span className="text-right text-white">{readableCondition(device.condition)}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-[#8E8E93]">Battery Health</span>
                      <span className="text-right text-white">
                        {device.batteryHealth != null ? `${device.batteryHealth}%` : "Not available"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            className="mx-auto mt-4 flex items-center justify-center gap-1.5 py-1 text-[13px] text-white"
          >
            <span>{expanded ? "See Less" : "See Details"}</span>
            <Info size={15} strokeWidth={1.7} />
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </section>

        <button
          type="button"
          onClick={() => router.push("/home")}
          className="mt-4 flex h-[84px] w-full items-center justify-center rounded-[32px] bg-black text-[22px] font-semibold text-white transition active:scale-[0.99] max-[390px]:h-[68px]"
        >
          Back Home
        </button>
      </div>
    </main>
  )
}
