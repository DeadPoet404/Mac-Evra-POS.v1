import Link from "next/link"
import { BatteryMedium, Search, ShieldCheck, ShoppingBag, Smartphone } from "lucide-react"

import { EmployeeHeader } from "@/components/employee/employee-header"
import { requirePermissions } from "@/lib/auth/server"
import { listAuthorizedInventory, type PersistentInventoryStatus } from "@/lib/inventory-server"
import { formatPesewas } from "@/lib/sales"

const statuses: Array<"all" | PersistentInventoryStatus> = ["all", "available", "reserved", "sold"]

export default async function EmployeeInventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>
}) {
  const { membership } = await requirePermissions(["access_employee_workspace"], { nextPath: "/inventory" })
  const params = await searchParams
  const inventory = await listAuthorizedInventory(membership.storeId)
  const query = params.q?.trim().toLowerCase() ?? ""
  const status = statuses.includes(params.status as "all" | PersistentInventoryStatus)
    ? params.status as "all" | PersistentInventoryStatus
    : "available"
  const filtered = inventory.filter((device) => {
    const matchesQuery = !query || [device.model, device.storage, device.colour, device.condition, device.imei].join(" ").toLowerCase().includes(query)
    return matchesQuery && (status === "all" || device.status === status)
  })
  const available = inventory.filter((device) => device.status === "available").length

  return (
    <main className="min-h-screen bg-[#FAFAFC] pb-16 text-[#1D1D1F]">
      <EmployeeHeader title="Inventory" backHref="/home" backLabel="Home" />
      <div className="mx-auto w-full max-w-6xl px-5 pt-9 sm:px-6 lg:px-8">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#86868B]">Live store inventory</p><h1 className="mt-2 text-[38px] font-semibold tracking-[-1.2px] text-[#6E0728]">Find an iPhone.</h1><p className="mt-2 text-lg font-semibold text-[#86868B]">{available} physical device{available === 1 ? "" : "s"} available at {membership.storeName}.</p></div>
          <Link href="/new-sale" className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#6E0728] px-5 text-sm font-semibold text-white"><ShoppingBag size={16} /> Open sale drafts</Link>
        </header>

        <form method="get" className="mt-7 grid gap-3 rounded-2xl border border-[#E8E8ED] bg-white p-4 sm:grid-cols-[1fr_180px_auto] sm:items-end">
          <label className="relative text-xs font-medium text-[#68686D]">Search
            <Search className="absolute bottom-3 left-3 size-4 text-[#A1A1A6]" />
            <input name="q" defaultValue={params.q ?? ""} placeholder="Model, colour or IMEI" className="mt-1 h-10 w-full rounded-lg border border-[#E5E5E7] pl-9 pr-3 text-sm outline-none focus:border-[#6E0728]" />
          </label>
          <label className="text-xs font-medium text-[#68686D]">Availability
            <select name="status" defaultValue={status} className="mt-1 h-10 w-full rounded-lg border border-[#E5E5E7] bg-white px-3 text-sm outline-none focus:border-[#6E0728]">
              <option value="all">All statuses</option><option value="available">Available</option><option value="reserved">Reserved</option><option value="sold">Sold</option>
            </select>
          </label>
          <button type="submit" className="h-10 rounded-full border border-[#D8C4CB] px-5 text-sm font-semibold text-[#6E0728]">Apply</button>
        </form>

        {filtered.length ? (
          <section className="mt-6 grid gap-4 md:grid-cols-2" aria-label="Inventory results">
            {filtered.map((device) => <article key={device.inventoryId} className="rounded-2xl border border-[#E8E8ED] bg-white p-5"><div className="flex gap-4"><span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[#F5EDF0] text-[#6E0728]"><Smartphone size={25} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{device.model}</h2><Status value={device.status} /></div><p className="mt-1 text-sm text-[#86868B]">{device.storage} · {device.colour} · {device.condition}</p><p className="mt-2 inline-flex items-center gap-1 text-xs text-[#68686D]"><BatteryMedium size={13} /> {device.batteryHealth}% battery</p><p className="mt-2 font-mono text-[11px] text-[#86868B]">IMEI {device.imei}</p></div></div><div className="mt-4 flex items-center justify-between border-t border-[#F0F0F2] pt-4"><p className="text-lg font-semibold text-[#6E0728]">{formatPesewas(device.pricePesewas)}</p>{device.status === "available" ? <Link href="/new-sale" className="text-xs font-semibold text-[#6E0728]">Add through sale draft →</Link> : null}</div></article>)}
          </section>
        ) : <div className="mt-6 rounded-2xl border border-dashed border-[#D8D8DC] bg-white p-14 text-center"><Search className="mx-auto size-7 text-[#A1A1A6]" /><h2 className="mt-4 font-semibold">No matching inventory</h2><p className="mt-2 text-sm text-[#86868B]">Change the search or status filter.</p></div>}

        <div className="mt-7 flex gap-3 rounded-xl border border-[#E8E8ED] bg-white p-4 text-xs leading-5 text-[#68686D]"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#6E0728]" /><p>Inventory is store-scoped through RLS. Availability is rechecked and locked only when a device is added to a persistent sale draft.</p></div>
      </div>
    </main>
  )
}

function Status({ value }: { value: PersistentInventoryStatus }) {
  const colour = value === "available" ? "bg-[#F0FAF3] text-[#267343]" : value === "reserved" ? "bg-[#FFF9EB] text-[#8A6517]" : "bg-[#F5F5F7] text-[#68686D]"
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${colour}`}>{value}</span>
}
