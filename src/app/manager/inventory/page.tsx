import Link from "next/link"
import {
  CheckCircle2,
  Clock3,
  PackageCheck,
  PackagePlus,
  Search,
  ShieldCheck,
  Smartphone,
  X,
} from "lucide-react"

import {
  DataBadge,
  DetailRow,
  EmptyState,
  MetricCard,
  PageHeader,
} from "@/components/manager/manager-ui"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { requirePermissions } from "@/lib/auth/server"
import {
  inventoryStatusLabel,
  summarizeInventoryStatuses,
  type PersistentInventoryStatus,
} from "@/lib/inventory-status"
import { listAuthorizedInventory } from "@/lib/inventory-server"
import { formatPesewas } from "@/lib/sales"

type StatusFilter = "all" | PersistentInventoryStatus

function pageHref({
  q,
  status,
  device,
}: {
  q?: string
  status?: StatusFilter
  device?: string
}) {
  const params = new URLSearchParams()
  if (q) params.set("q", q)
  if (status && status !== "all") params.set("status", status)
  if (device) params.set("device", device)
  const query = params.toString()
  return query ? `/manager/inventory?${query}` : "/manager/inventory"
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-GH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Accra",
  }).format(new Date(value))
}

export default async function ManagerInventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; device?: string }>
}) {
  const { membership } = await requirePermissions(["access_manager_workspace", "manage_inventory"], {
    nextPath: "/manager/inventory",
  })
  const params = await searchParams
  const inventory = await listAuthorizedInventory(membership.storeId)
  const query = params.q?.trim() ?? ""
  const status: StatusFilter =
    params.status === "available" || params.status === "reserved" || params.status === "sold"
      ? params.status
      : "all"
  const summary = summarizeInventoryStatuses(inventory.map((device) => device.status))
  const filtered = inventory.filter((device) => {
    const matchesQuery =
      !query ||
      [device.model, device.storage, device.colour, device.condition, device.imei]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase())
    return matchesQuery && (status === "all" || device.status === status)
  })
  const selected = params.device
    ? inventory.find((device) => device.inventoryId === params.device) ?? null
    : null

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-7 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Live stock management"
        title="Inventory"
        description={`Every device below is read from the RLS-scoped Supabase inventory register for ${membership.storeName}.`}
        action={
          <Link
            href="/manager/opening-stock"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#6E0728] px-4 text-sm font-semibold text-white hover:bg-[#57051F]"
          >
            <PackagePlus size={16} /> Opening-stock receiving
          </Link>
        }
      />

      <div className="flex gap-3 rounded-2xl border border-[#CDE9D7] bg-[#F0FAF3] p-4 text-sm leading-6 text-[#267343]">
        <ShieldCheck className="mt-0.5 size-5 shrink-0" />
        <p>
          This is the real IMEI-level register. Availability changes only through trusted reservation, sale, and opening-stock activation transactions; no browser-only sample devices are shown here.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Inventory metrics">
        <MetricCard label="Available" value={String(summary.available)} note="Ready to reserve or sell" icon={CheckCircle2} tone="green" />
        <MetricCard label="Reserved" value={String(summary.reserved)} note="Held for active sales" icon={Clock3} tone="amber" />
        <MetricCard label="Sold" value={String(summary.sold)} note="Locked to completed sales" icon={PackageCheck} tone="blue" />
        <MetricCard label="Total records" value={String(summary.total)} note="Actual store-scoped inventory rows" icon={Smartphone} />
      </section>

      <Card className="rounded-2xl border-[#E8E8ED] bg-white shadow-none">
        <CardContent className="p-5">
          <form method="get" className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_auto] sm:items-end">
            <label className="relative block text-xs font-medium text-[#68686D]">
              Search real inventory
              <Search className="absolute bottom-3 left-3 size-4 text-[#A1A1A6]" />
              <Input name="q" defaultValue={query} placeholder="Model, colour, condition or IMEI" className="mt-1 pl-9" />
            </label>
            <label className="block text-xs font-medium text-[#68686D]">
              Availability
              <select name="status" defaultValue={status} className="mt-1 h-10 w-full rounded-lg border border-input bg-white px-3 text-sm outline-none focus:border-[#6E0728]">
                <option value="all">All statuses</option>
                <option value="available">Available</option>
                <option value="reserved">Reserved</option>
                <option value="sold">Sold</option>
              </select>
            </label>
            <button type="submit" className="h-10 rounded-full bg-[#6E0728] px-5 text-sm font-semibold text-white hover:bg-[#57051F]">Apply filters</button>
          </form>
        </CardContent>
      </Card>

      <section className={`grid gap-5 ${selected ? "xl:grid-cols-[minmax(0,1fr)_360px]" : "grid-cols-1"}`}>
        <Card className="min-w-0 rounded-2xl border-[#E8E8ED] bg-white shadow-none">
          <CardContent className="p-0">
            <div className="border-b border-[#E8E8ED] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Device register</h2>
                  <p className="mt-1 text-sm text-[#86868B]">{filtered.length} of {inventory.length} persisted device{inventory.length === 1 ? "" : "s"} shown</p>
                </div>
                <DataBadge tone="green">Live database rows</DataBadge>
              </div>
            </div>
            {filtered.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[950px] text-left text-sm">
                  <thead className="bg-[#FAFAFB] text-[11px] font-semibold uppercase tracking-wide text-[#86868B]">
                    <tr>
                      <th className="px-5 py-3">Device</th>
                      <th className="px-4 py-3">Condition</th>
                      <th className="px-4 py-3">Battery</th>
                      <th className="px-4 py-3">IMEI</th>
                      <th className="px-4 py-3">Listed price</th>
                      <th className="px-4 py-3">Received</th>
                      <th className="px-5 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((device) => (
                      <tr key={device.inventoryId} className={`border-t border-[#F0F0F2] ${selected?.inventoryId === device.inventoryId ? "bg-[#FAF3F6]" : "bg-white hover:bg-[#FCF9FA]"}`}>
                        <td className="px-5 py-4">
                          <Link href={pageHref({ q: query, status, device: device.inventoryId })} className="block font-medium hover:text-[#6E0728]">
                            {device.model}
                          </Link>
                          <p className="mt-1 text-xs text-[#86868B]">{device.storage} · {device.colour}</p>
                        </td>
                        <td className="px-4 py-4 text-[#424245]">{device.condition}</td>
                        <td className="px-4 py-4 text-[#424245]">{device.batteryHealth}%</td>
                        <td className="px-4 py-4 font-mono text-xs text-[#68686D]">{device.imei}</td>
                        <td className="px-4 py-4 font-medium">{formatPesewas(device.pricePesewas)}</td>
                        <td className="px-4 py-4 text-xs text-[#68686D]">{dateTime(device.receivedAt)}</td>
                        <td className="px-5 py-4"><StatusBadge status={device.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="No persisted devices found"
                description="No real store inventory matches these filters. Register supplier intake at the opening-stock route before devices can be activated here."
              />
            )}
          </CardContent>
        </Card>

        {selected ? (
          <Card className="h-fit rounded-2xl border-[#E8E8ED] bg-white shadow-none">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#86868B]">Persisted device details</p>
                  <h2 className="mt-2 text-lg font-semibold">{selected.model}</h2>
                  <p className="mt-1 text-sm text-[#86868B]">{selected.storage} · {selected.colour}</p>
                </div>
                <Link href={pageHref({ q: query, status })} aria-label="Close details" className="text-[#86868B] hover:text-[#6E0728]"><X size={17} /></Link>
              </div>
              <div className="my-5 flex h-32 items-center justify-center rounded-xl bg-[#F7F7F8] text-[#8A8A90]">
                <Smartphone size={54} strokeWidth={1.2} />
              </div>
              <StatusBadge status={selected.status} />
              <Separator className="my-5" />
              <div className="space-y-4">
                <DetailRow label="Condition" value={selected.condition} />
                <DetailRow label="Battery health" value={`${selected.batteryHealth}%`} />
                <DetailRow label="IMEI" value={selected.imei} mono />
                <DetailRow label="Listed price" value={formatPesewas(selected.pricePesewas)} />
                <DetailRow label="Received" value={dateTime(selected.receivedAt)} />
                <DetailRow label="Store" value={membership.storeName} />
              </div>
              <Separator className="my-5" />
              <p className="rounded-lg bg-[#F7F7F8] p-3 text-xs leading-5 text-[#68686D]">
                Status is database-owned. Reserved and sold records remain locked to their trusted reservation or payment transaction; this view does not mutate inventory.
              </p>
            </CardContent>
          </Card>
        ) : null}
      </section>
    </main>
  )
}

function StatusBadge({ status }: { status: PersistentInventoryStatus }) {
  return (
    <DataBadge tone={status === "available" ? "green" : status === "reserved" ? "amber" : "neutral"}>
      {inventoryStatusLabel(status)}
    </DataBadge>
  )
}
