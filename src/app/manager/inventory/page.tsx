"use client"

import { FormEvent, useMemo, useState } from "react"
import {
  CheckCircle2,
  Clock3,
  PackageCheck,
  Plus,
  Search,
  ShieldCheck,
  Smartphone,
  X,
} from "lucide-react"

import {
  DataBadge,
  DemoNotice,
  DetailRow,
  EmptyState,
  MetricCard,
  PageHeader,
} from "@/components/manager/manager-ui"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { inventoryPhones, money, type InventoryStatus, type Phone } from "@/lib/manager-data"

const emptyPhone = {
  model: "",
  storage: "",
  colour: "",
  condition: "Excellent" as Phone["condition"],
  battery: "",
  imei: "",
  cost: "",
  price: "",
}

export default function InventoryPage() {
  const [phones, setPhones] = useState<Phone[]>(inventoryPhones)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<"All" | InventoryStatus>("All")
  const [selectedPhone, setSelectedPhone] = useState<Phone | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newPhone, setNewPhone] = useState(emptyPhone)
  const [formError, setFormError] = useState("")

  const available = phones.filter((phone) => phone.status === "Available").length
  const reserved = phones.filter((phone) => phone.status === "Reserved").length
  const sold = phones.filter((phone) => phone.status === "Sold").length
  const stockValue = phones
    .filter((phone) => phone.status !== "Sold")
    .reduce((total, phone) => total + phone.cost, 0)

  const filteredPhones = useMemo(() => {
    const query = search.toLowerCase().trim()
    return phones.filter((phone) => {
      const matchesSearch =
        !query ||
        [phone.model, phone.storage, phone.colour, phone.imei]
          .join(" ")
          .toLowerCase()
          .includes(query)
      const matchesStatus = statusFilter === "All" || phone.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [phones, search, statusFilter])

  function addPhone(event: FormEvent) {
    event.preventDefault()
    setFormError("")

    const imei = newPhone.imei.replace(/\s/g, "")
    if (!/^\d{15}$/.test(imei)) {
      setFormError("Enter a valid 15-digit IMEI.")
      return
    }
    if (phones.some((phone) => phone.imei === imei)) {
      setFormError("This IMEI is already in inventory. Each physical device can only be added once.")
      return
    }

    const battery = Number(newPhone.battery)
    const cost = Number(newPhone.cost)
    const price = Number(newPhone.price)
    if (!newPhone.model.trim() || !newPhone.storage.trim() || battery < 1 || battery > 100 || cost <= 0 || price <= 0) {
      setFormError("Complete all required fields with valid values.")
      return
    }
    if (price < cost) {
      setFormError("Selling price cannot be lower than the recorded cost without an approved adjustment.")
      return
    }

    const phone: Phone = {
      id: Date.now(),
      model: newPhone.model.trim(),
      storage: newPhone.storage.trim(),
      colour: newPhone.colour.trim() || "Not specified",
      condition: newPhone.condition,
      battery,
      imei,
      cost,
      price,
      status: "Available",
      addedAt: "23 Nov 2026",
    }

    setPhones((current) => [phone, ...current])
    setSelectedPhone(phone)
    setNewPhone(emptyPhone)
    setShowAddForm(false)
  }

  function updateStatus(status: Exclude<InventoryStatus, "Sold">) {
    if (!selectedPhone || selectedPhone.status === "Sold") return
    const updated = { ...selectedPhone, status }
    setPhones((current) => current.map((phone) => (phone.id === updated.id ? updated : phone)))
    setSelectedPhone(updated)
  }

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-7 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Stock management"
        title="Inventory"
        description="Track every physical iPhone by IMEI, condition and availability. Duplicate IMEIs are blocked in this preview."
        action={
          <Button
            onClick={() => {
              setShowAddForm((open) => !open)
              setSelectedPhone(null)
              setFormError("")
            }}
            className="h-10 bg-[#6E0728] px-4 text-white hover:bg-[#57051F]"
          >
            {showAddForm ? <X size={16} /> : <Plus size={16} />}
            {showAddForm ? "Close form" : "Add device"}
          </Button>
        }
      />

      <DemoNotice>
        Inventory changes are held in browser state for this preview. Production must enforce unique IMEIs and atomic Available → Reserved → Sold transitions in the database.
      </DemoNotice>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Inventory metrics">
        <MetricCard label="Available" value={String(available)} note="Ready to reserve or sell" icon={CheckCircle2} tone="green" />
        <MetricCard label="Reserved" value={String(reserved)} note="Held for active sales" icon={Clock3} tone="amber" />
        <MetricCard label="Sold" value={String(sold)} note="Locked to completed sales" icon={PackageCheck} tone="blue" />
        <MetricCard label="Stock cost" value={money(stockValue)} note={`${available + reserved} unsold devices`} icon={Smartphone} />
      </section>

      {showAddForm ? (
        <Card className="rounded-2xl border-[#E2D2D8] bg-white shadow-none">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Add a physical device</h2>
                <p className="mt-1 text-sm text-[#86868B]">Record the device exactly as verified during intake.</p>
              </div>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#F5EDF0] text-[#6E0728]">
                <ShieldCheck size={19} />
              </span>
            </div>
            <form onSubmit={addPhone} className="mt-6">
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <FormField label="Model" required>
                  <Input value={newPhone.model} onChange={(event) => setNewPhone({ ...newPhone, model: event.target.value })} placeholder="iPhone 15 Pro" />
                </FormField>
                <FormField label="Storage" required>
                  <Input value={newPhone.storage} onChange={(event) => setNewPhone({ ...newPhone, storage: event.target.value })} placeholder="256GB" />
                </FormField>
                <FormField label="Colour">
                  <Input value={newPhone.colour} onChange={(event) => setNewPhone({ ...newPhone, colour: event.target.value })} placeholder="Natural Titanium" />
                </FormField>
                <FormField label="Condition" required>
                  <select
                    value={newPhone.condition}
                    onChange={(event) => setNewPhone({ ...newPhone, condition: event.target.value as Phone["condition"] })}
                    className="h-8 w-full rounded-lg border border-input bg-white px-2.5 text-sm outline-none focus:border-[#6E0728] focus:ring-2 focus:ring-[#6E0728]/15"
                  >
                    <option>Excellent</option>
                    <option>Good</option>
                    <option>Fair</option>
                  </select>
                </FormField>
                <FormField label="Battery health (%)" required>
                  <Input type="number" min="1" max="100" value={newPhone.battery} onChange={(event) => setNewPhone({ ...newPhone, battery: event.target.value })} placeholder="92" />
                </FormField>
                <FormField label="IMEI · 15 digits" required>
                  <Input inputMode="numeric" maxLength={15} value={newPhone.imei} onChange={(event) => setNewPhone({ ...newPhone, imei: event.target.value.replace(/\D/g, "") })} placeholder="356789104567890" />
                </FormField>
                <FormField label="Cost price (GH₵)" required>
                  <Input type="number" min="1" value={newPhone.cost} onChange={(event) => setNewPhone({ ...newPhone, cost: event.target.value })} placeholder="7200" />
                </FormField>
                <FormField label="Selling price (GH₵)" required>
                  <Input type="number" min="1" value={newPhone.price} onChange={(event) => setNewPhone({ ...newPhone, price: event.target.value })} placeholder="8500" />
                </FormField>
              </div>
              {formError ? <p role="alert" className="mt-4 rounded-lg bg-[#FFF3F2] px-3 py-2 text-sm text-[#A13B34]">{formError}</p> : null}
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setShowAddForm(false)}>Cancel</Button>
                <Button type="submit" className="bg-[#6E0728] text-white hover:bg-[#57051F]"><Plus size={16} /> Add to inventory</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <section className={`grid gap-5 ${selectedPhone ? "xl:grid-cols-[minmax(0,1fr)_360px]" : "grid-cols-1"}`}>
        <Card className="min-w-0 rounded-2xl border-[#E8E8ED] bg-white shadow-none">
          <CardContent className="p-0">
            <div className="flex flex-col justify-between gap-4 border-b border-[#E8E8ED] p-5 lg:flex-row lg:items-center">
              <div>
                <h2 className="font-semibold">Device register</h2>
                <p className="mt-1 text-sm text-[#86868B]">{filteredPhones.length} of {phones.length} devices shown</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#A1A1A6]" />
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search model or IMEI" className="w-full pl-9 sm:w-64" />
                </div>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as "All" | InventoryStatus)}
                  className="h-8 rounded-lg border border-input bg-white px-2.5 text-sm outline-none focus:border-[#6E0728]"
                  aria-label="Filter inventory status"
                >
                  <option value="All">All statuses</option>
                  <option value="Available">Available</option>
                  <option value="Reserved">Reserved</option>
                  <option value="Sold">Sold</option>
                </select>
              </div>
            </div>

            {filteredPhones.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] text-left text-sm">
                  <thead className="bg-[#FAFAFB] text-[11px] font-semibold uppercase tracking-wide text-[#86868B]">
                    <tr>
                      <th className="px-5 py-3">Device</th>
                      <th className="px-4 py-3">Condition</th>
                      <th className="px-4 py-3">Battery</th>
                      <th className="px-4 py-3">IMEI</th>
                      <th className="px-4 py-3">Cost</th>
                      <th className="px-4 py-3">Price</th>
                      <th className="px-5 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPhones.map((phone) => (
                      <tr
                        key={phone.id}
                        onClick={() => {
                          setSelectedPhone(phone)
                          setShowAddForm(false)
                        }}
                        className={`cursor-pointer border-t border-[#F0F0F2] transition hover:bg-[#FCF9FA] ${selectedPhone?.id === phone.id ? "bg-[#FAF3F6]" : "bg-white"}`}
                      >
                        <td className="px-5 py-4">
                          <p className="font-medium">{phone.model}</p>
                          <p className="mt-1 text-xs text-[#86868B]">{phone.storage} · {phone.colour}</p>
                        </td>
                        <td className="px-4 py-4 text-[#424245]">{phone.condition}</td>
                        <td className="px-4 py-4 text-[#424245]">{phone.battery}%</td>
                        <td className="px-4 py-4 font-mono text-xs text-[#68686D]">{phone.imei}</td>
                        <td className="px-4 py-4 text-[#424245]">{money(phone.cost)}</td>
                        <td className="px-4 py-4 font-medium">{money(phone.price)}</td>
                        <td className="px-5 py-4"><InventoryBadge status={phone.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No devices found" description="Try a different search term or status filter." />
            )}
          </CardContent>
        </Card>

        {selectedPhone ? (
          <Card className="h-fit rounded-2xl border-[#E8E8ED] bg-white shadow-none">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#86868B]">Device details</p>
                  <h2 className="mt-2 text-lg font-semibold">{selectedPhone.model}</h2>
                  <p className="mt-1 text-sm text-[#86868B]">{selectedPhone.storage} · {selectedPhone.colour}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setSelectedPhone(null)} aria-label="Close details"><X size={17} /></Button>
              </div>
              <div className="my-5 flex h-32 items-center justify-center rounded-xl bg-[#F7F7F8] text-[#8A8A90]">
                <Smartphone size={54} strokeWidth={1.2} />
              </div>
              <InventoryBadge status={selectedPhone.status} />
              <Separator className="my-5" />
              <div className="space-y-4">
                <DetailRow label="Condition" value={selectedPhone.condition} />
                <DetailRow label="Battery health" value={`${selectedPhone.battery}%`} />
                <DetailRow label="IMEI" value={selectedPhone.imei} mono />
                <DetailRow label="Cost price" value={money(selectedPhone.cost)} />
                <DetailRow label="Selling price" value={money(selectedPhone.price)} />
                <DetailRow label="Added" value={selectedPhone.addedAt} />
              </div>
              <Separator className="my-5" />
              {selectedPhone.status === "Sold" ? (
                <p className="rounded-lg bg-[#F7F7F8] p-3 text-xs leading-5 text-[#68686D]">Sold devices are locked to their completed transaction and cannot be returned to available stock here.</p>
              ) : (
                <div>
                  <p className="mb-2 text-xs font-medium text-[#68686D]">Update availability</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant={selectedPhone.status === "Available" ? "default" : "outline"} onClick={() => updateStatus("Available")} className={selectedPhone.status === "Available" ? "bg-[#6E0728] text-white" : ""}>Available</Button>
                    <Button variant={selectedPhone.status === "Reserved" ? "default" : "outline"} onClick={() => updateStatus("Reserved")} className={selectedPhone.status === "Reserved" ? "bg-[#6E0728] text-white" : ""}>Reserved</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}
      </section>
    </main>
  )
}

function FormField({ label, required = false, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="space-y-2">
      <span className="block text-sm font-medium text-[#424245]">{label}{required ? <span className="ml-1 text-[#6E0728]">*</span> : null}</span>
      {children}
    </label>
  )
}

function InventoryBadge({ status }: { status: InventoryStatus }) {
  return <DataBadge tone={status === "Available" ? "green" : status === "Reserved" ? "amber" : "neutral"}>{status}</DataBadge>
}
