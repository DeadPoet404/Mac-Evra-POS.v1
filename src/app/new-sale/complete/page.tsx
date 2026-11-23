"use client"

import Link from "next/link"
import { CheckCircle2 } from "lucide-react"

import { SaleDeviceSummary } from "@/components/employee/device-card"
import { useSaleDevice } from "@/hooks/use-sale-device"

export default function SaleCompletePage() {
  const device = useSaleDevice()

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 py-12 text-[#1D1D1F]">
      <section className="w-full max-w-md text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-green-50 text-green-700">
          <CheckCircle2 size={32} aria-hidden="true" />
        </div>
        <h1 className="mt-6 text-[32px] font-semibold tracking-[-1px] text-[#6E0728]">Preview complete.</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[#86868B]">The sale demonstration has reached its final screen.</p>

        <SaleDeviceSummary phone={device} className="mt-7 text-left" />

        <div className="mt-5 rounded-xl bg-[#FFF9EB] p-4 text-left text-xs leading-5 text-[#765613]">
          No payment, inventory status or receipt was created. The device remains sample inventory and must not be handed over based on this preview.
        </div>

        <Link href="/home" className="mt-7 block w-full rounded-full bg-[#6E0728] px-5 py-4 text-[15px] font-semibold text-white">Back to Home</Link>
      </section>
    </main>
  )
}
