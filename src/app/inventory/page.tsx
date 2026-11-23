"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import {
  BatteryMedium,
  CircleAlert,
  Search,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  X,
} from "lucide-react"

import { DeviceCard, DeviceStatus } from "@/components/employee/device-card"
import { EmployeeHeader } from "@/components/employee/employee-header"
import { startSaleWithDevice } from "@/lib/employee-sale"
import {
  formatGhs,
  inventoryPhones,
  isPhoneSelectable,
  type InventoryStatus,
  type Phone,
} from "@/lib/inventory"

const models = [...new Set(inventoryPhones.map((phone) => phone.model))]
const storageOptions = [...new Set(inventoryPhones.map((phone) => phone.storage))]
const conditions = [...new Set(inventoryPhones.map((phone) => phone.condition))]

export default function EmployeeInventoryPage() {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [model, setModel] = useState("All")
  const [storage, setStorage] = useState("All")
  const [condition, setCondition] = useState("All")
  const [status, setStatus] = useState<"All" | InventoryStatus>("Available")
  const [selectedPhone, setSelectedPhone] = useState<Phone | null>(null)

  const query = search.trim().toLowerCase()
  const filteredPhones = inventoryPhones.filter((phone) => {
    const matchesSearch =
      !query ||
      [phone.model, phone.storage, phone.colour, phone.condition, phone.imei]
        .join(" ")
        .toLowerCase()
        .includes(query)
    return (
      matchesSearch &&
      (model === "All" || phone.model === model) &&
      (storage === "All" || phone.storage === storage) &&
      (condition === "All" || phone.condition === condition) &&
      (status === "All" || phone.status === status)
    )
  })

  const activeFilterCount = [model, storage, condition, status].filter((value) => value !== "All").length
  const availableCount = inventoryPhones.filter(isPhoneSelectable).length

  function clearFilters() {
    setSearch("")
    setModel("All")
    setStorage("All")
    setCondition("All")
    setStatus("Available")
  }

  function selectForSale(phone: Phone) {
    if (!isPhoneSelectable(phone)) return
    startSaleWithDevice(phone)
    router.push("/new-sale")
  }

  return (
    <main className="min-h-screen bg-white text-[#1D1D1F]">
      <EmployeeHeader title="Inventory" backHref="/home" backLabel="Home" />

      <div className="mx-auto w-full max-w-6xl px-5 pb-16 sm:px-6 lg:px-8">
        <section className="pb-7 pt-9 sm:pt-12">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#86868B]">Employee inventory</p>
          <div className="mt-2 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h1 className="text-[38px] font-semibold leading-tight tracking-[-1.3px] text-[#6E0728] sm:text-[44px]">Find an iPhone.</h1>
              <p className="mt-2 max-w-xl text-[18px] font-semibold leading-snug tracking-[-0.35px] text-[#86868B] sm:text-[21px]">
                Choose the exact physical device for your customer.
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm text-[#68686D]">
              <span className="size-2 rounded-full bg-[#267343]" />
              {availableCount} available now
            </div>
          </div>
        </section>

        <div className="rounded-2xl border border-[#E8E8ED] bg-[#FAFAFC] p-4 sm:p-5">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#86868B]" aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search model, colour or IMEI"
              className="h-12 w-full rounded-xl border border-[#E5E5E7] bg-white pl-11 pr-4 text-sm outline-none transition focus:border-[#6E0728] focus:ring-2 focus:ring-[#6E0728]/10"
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <FilterSelect label="Model" value={model} onChange={setModel} options={models} />
            <FilterSelect label="Storage" value={storage} onChange={setStorage} options={storageOptions} />
            <FilterSelect label="Condition" value={condition} onChange={setCondition} options={conditions} />
            <FilterSelect label="Availability" value={status} onChange={(value) => setStatus(value as "All" | InventoryStatus)} options={["Available", "Reserved", "Sold"]} />
          </div>
        </div>

        <div className="mt-7 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.25px]">Devices</h2>
            <p className="mt-1 text-xs text-[#86868B]">{filteredPhones.length} result{filteredPhones.length === 1 ? "" : "s"} · Sample inventory</p>
          </div>
          {activeFilterCount > 1 || search ? (
            <button type="button" onClick={clearFilters} className="text-xs font-semibold text-[#6E0728]">Reset filters</button>
          ) : null}
        </div>

        {filteredPhones.length ? (
          <section className="mt-4 grid gap-3 md:grid-cols-2" aria-label="Inventory results">
            {filteredPhones.map((phone) => (
              <DeviceCard key={phone.imei} phone={phone} onClick={() => setSelectedPhone(phone)} />
            ))}
          </section>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-[#D8D8DC] px-6 py-16 text-center">
            <Search className="mx-auto size-7 text-[#A1A1A6]" />
            <h2 className="mt-4 text-base font-semibold">No matching devices</h2>
            <p className="mt-2 text-sm text-[#86868B]">Try another model, storage option or availability status.</p>
            <button type="button" onClick={clearFilters} className="mt-5 text-sm font-semibold text-[#6E0728]">Show available inventory</button>
          </div>
        )}

        <div className="mt-8 flex gap-3 rounded-xl bg-[#F7F7F8] p-4 text-xs leading-5 text-[#68686D]">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#6E0728]" />
          <p>Inventory is sample data. Availability is not database-locked in this preview. Confirm the IMEI and physical device before continuing.</p>
        </div>
      </div>

      {selectedPhone ? (
        <DeviceDetails
          phone={selectedPhone}
          onClose={() => setSelectedPhone(null)}
          onSelect={() => selectForSale(selectedPhone)}
        />
      ) : null}
    </main>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: string[]
}) {
  return (
    <label className="min-w-0">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-xl border border-[#E5E5E7] bg-white px-3 text-xs font-medium text-[#424245] outline-none focus:border-[#6E0728]"
      >
        <option value="All">All {label.toLowerCase()}</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  )
}

function DeviceDetails({ phone, onClose, onSelect }: { phone: Phone; onClose: () => void; onSelect: () => void }) {
  const available = isPhoneSelectable(phone)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="presentation">
      <button type="button" aria-label="Close device details" onClick={onClose} className="absolute inset-0" />
      <section role="dialog" aria-modal="true" aria-labelledby="device-title" className="relative z-10 max-h-[92svh] w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-white p-5 shadow-2xl sm:rounded-[28px] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#86868B]">Physical device</p>
            <h2 id="device-title" className="mt-2 text-2xl font-semibold tracking-[-0.6px]">{phone.model}</h2>
            <p className="mt-1 text-sm text-[#86868B]">{phone.storage} · {phone.colour}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#F5F5F7] text-[#68686D]"><X size={17} /></button>
        </div>

        <div className="my-6 flex h-36 items-center justify-center rounded-2xl bg-[#F7F7F8] text-[#6E0728]">
          <Smartphone size={60} strokeWidth={1.1} />
        </div>

        <div className="flex items-center justify-between gap-3">
          <DeviceStatus status={phone.status} />
          <p className="text-2xl font-semibold tracking-[-0.5px] text-[#6E0728]">{formatGhs(phone.price)}</p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <Detail label="Condition" value={phone.condition} />
          <Detail label="Battery health" value={<span className="inline-flex items-center gap-1"><BatteryMedium size={14} /> {phone.battery}%</span>} />
          <Detail label="Storage" value={phone.storage} />
          <Detail label="Colour" value={phone.colour} />
          <div className="col-span-2 rounded-xl bg-[#F7F7F8] p-3">
            <p className="text-xs text-[#86868B]">IMEI</p>
            <p className="mt-1 break-all font-mono text-sm font-medium">{phone.imei}</p>
          </div>
        </div>

        {!available ? (
          <div className="mt-5 flex gap-3 rounded-xl border border-[#F2E2BD] bg-[#FFF9EB] p-4 text-xs leading-5 text-[#765613]">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <p>This device is {phone.status.toLowerCase()} and cannot be selected for another sale.</p>
          </div>
        ) : null}

        <button
          type="button"
          onClick={onSelect}
          disabled={!available}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[#6E0728] px-5 py-4 text-sm font-semibold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#C7AAB4]"
        >
          <ShoppingBag size={17} />
          {available ? "Select for New Sale" : "Unavailable for sale"}
        </button>
      </section>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="rounded-xl bg-[#F7F7F8] p-3"><p className="text-xs text-[#86868B]">{label}</p><div className="mt-1 text-sm font-semibold">{value}</div></div>
}
