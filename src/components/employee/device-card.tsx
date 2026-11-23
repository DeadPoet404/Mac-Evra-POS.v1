import { BatteryMedium, ChevronRight, Smartphone } from "lucide-react"

import { formatGhs, type InventoryStatus, type Phone } from "@/lib/inventory"
import { cn } from "@/lib/utils"

export function DeviceCard({
  phone,
  onClick,
  selected = false,
}: {
  phone: Phone
  onClick: () => void
  selected?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-4 rounded-2xl border bg-white p-4 text-left transition active:scale-[0.99]",
        selected
          ? "border-[#6E0728] ring-2 ring-[#6E0728]/10"
          : "border-[#E5E5E7] hover:border-[#D8C4CB] hover:shadow-[0_8px_24px_rgba(29,29,31,0.05)]"
      )}
    >
      <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[#F5F5F7] text-[#6E0728] sm:size-16">
        <Smartphone size={27} strokeWidth={1.4} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate text-[15px] font-semibold text-[#1D1D1F]">{phone.model}</span>
          <DeviceStatus status={phone.status} />
        </span>
        <span className="mt-1 block truncate text-xs text-[#86868B]">{phone.storage} · {phone.colour}</span>
        <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#68686D]">
          <span>{phone.condition}</span>
          <span className="inline-flex items-center gap-1"><BatteryMedium size={13} /> {phone.battery}%</span>
          <span className="font-medium text-[#6E0728]">{formatGhs(phone.price)}</span>
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-[#A1A1A6] transition group-hover:translate-x-0.5" aria-hidden="true" />
    </button>
  )
}

export function DeviceStatus({ status }: { status: InventoryStatus }) {
  const styles = {
    Available: "border-[#CDE9D7] bg-[#F0FAF3] text-[#267343]",
    Reserved: "border-[#F2E2BD] bg-[#FFF9EB] text-[#8A6517]",
    Sold: "border-[#E5E5EA] bg-[#F5F5F7] text-[#68686D]",
  }

  return <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold", styles[status])}>{status}</span>
}

export function SaleDeviceSummary({ phone, className }: { phone: Phone; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-[#E5E5E7] bg-white p-4", className)}>
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#F5F5F7] text-[#6E0728]">
          <Smartphone size={21} strokeWidth={1.4} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-[#1D1D1F]">{phone.model}</p>
            <DeviceStatus status={phone.status} />
          </div>
          <p className="mt-1 text-sm text-[#86868B]">{phone.storage} · {phone.colour}</p>
          <p className="mt-2 font-mono text-[11px] text-[#86868B]">IMEI {phone.imei}</p>
        </div>
        <p className="shrink-0 text-sm font-semibold text-[#6E0728]">{formatGhs(phone.price)}</p>
      </div>
    </div>
  )
}
