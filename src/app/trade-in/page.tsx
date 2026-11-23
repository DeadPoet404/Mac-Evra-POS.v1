"use client"

import Link from "next/link"
import { useState } from "react"
import {
  ArrowLeft,
  ArrowRight,
  BatteryMedium,
  Check,
  CircleAlert,
  ClipboardCheck,
  Search,
  ShieldCheck,
  Smartphone,
} from "lucide-react"

import { DeviceCard, SaleDeviceSummary } from "@/components/employee/device-card"
import { EmployeeHeader } from "@/components/employee/employee-header"
import { formatGhs, inventoryPhones, isPhoneSelectable, type Phone } from "@/lib/inventory"
import {
  calculateDemoValuation,
  emptyTradeInCustomer,
  emptyTradeInDevice,
  emptyTradeInInspection,
  isInspectionComplete,
  type CosmeticRating,
  type FunctionalRating,
  type StatusRating,
  type TradeInCustomer,
  type TradeInDevice,
  type TradeInInspection,
} from "@/lib/trade-in"

const stepLabels = ["Customer", "Trade-in device", "Inspection", "Demo value", "Replacement", "Summary"]

export default function TradeInPage() {
  const [step, setStep] = useState(1)
  const [customer, setCustomer] = useState<TradeInCustomer>(emptyTradeInCustomer)
  const [device, setDevice] = useState<TradeInDevice>(emptyTradeInDevice)
  const [inspection, setInspection] = useState<TradeInInspection>(emptyTradeInInspection)
  const [replacement, setReplacement] = useState<Phone | null>(null)
  const [replacementSearch, setReplacementSearch] = useState("")
  const [submitted, setSubmitted] = useState(false)

  const valuation = calculateDemoValuation(inspection)
  const availableInventory = inventoryPhones.filter(isPhoneSelectable)
  const replacementQuery = replacementSearch.trim().toLowerCase()
  const replacementOptions = availableInventory.filter((phone) =>
    !replacementQuery || [phone.model, phone.storage, phone.colour, phone.imei].join(" ").toLowerCase().includes(replacementQuery)
  )

  const canContinue =
    (step === 1 && customer.name.trim().length > 1 && customer.phone.trim().length >= 7) ||
    (step === 2 && device.brand.trim() && device.model.trim() && device.storage.trim() && device.colour.trim() && device.identifier.trim().length >= 6) ||
    (step === 3 && isInspectionComplete(inspection)) ||
    step === 4 ||
    (step === 5 && replacement !== null)

  function goNext() {
    if (canContinue && step < 6) {
      setStep((current) => current + 1)
      window.scrollTo({ top: 0, behavior: "smooth" })
    }
  }

  function goBack() {
    if (step > 1) {
      setStep((current) => current - 1)
      setSubmitted(false)
      window.scrollTo({ top: 0, behavior: "smooth" })
    }
  }

  function startAnother() {
    setStep(1)
    setCustomer(emptyTradeInCustomer)
    setDevice(emptyTradeInDevice)
    setInspection(emptyTradeInInspection)
    setReplacement(null)
    setReplacementSearch("")
    setSubmitted(false)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  return (
    <main className="min-h-screen bg-white pb-16 text-[#1D1D1F]">
      <EmployeeHeader title="Process a Swap" backHref="/home" backLabel="Home" />

      <div className="mx-auto w-full max-w-3xl px-5 sm:px-6">
        <section className="pb-6 pt-8 sm:pt-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#86868B]">Employee-assisted trade-in</p>
          <h1 className="mt-2 text-[36px] font-semibold leading-tight tracking-[-1.2px] text-[#6E0728] sm:text-[42px]">Process a Swap.</h1>
          <p className="mt-2 max-w-xl text-[18px] font-semibold leading-snug tracking-[-0.35px] text-[#86868B] sm:text-[20px]">
            Inspect the customer&apos;s phone, prepare a demo estimate, and choose their replacement.
          </p>
        </section>

        <Progress step={step} />

        <section className="mt-7">
          {step === 1 ? <CustomerStep value={customer} onChange={setCustomer} /> : null}
          {step === 2 ? <DeviceStep value={device} onChange={setDevice} /> : null}
          {step === 3 ? <InspectionStep value={inspection} onChange={setInspection} /> : null}
          {step === 4 ? <ValuationStep device={device} inspection={inspection} /> : null}
          {step === 5 ? (
            <ReplacementStep
              phones={replacementOptions}
              search={replacementSearch}
              onSearch={setReplacementSearch}
              selected={replacement}
              onSelect={setReplacement}
              estimatedOffer={valuation.estimatedOffer}
            />
          ) : null}
          {step === 6 && replacement ? (
            <SummaryStep
              customer={customer}
              device={device}
              inspection={inspection}
              replacement={replacement}
              submitted={submitted}
              onSubmit={() => setSubmitted(true)}
              onStartAnother={startAnother}
            />
          ) : null}
        </section>

        {step < 6 ? (
          <div className="mt-7 flex items-center justify-between gap-3 border-t border-[#E8E8ED] pt-5">
            {step > 1 ? (
              <button type="button" onClick={goBack} className="flex items-center gap-1 rounded-full px-3 py-3 text-sm font-semibold text-[#6E0728]"><ArrowLeft size={16} /> Back</button>
            ) : <span />}
            <button type="button" onClick={goNext} disabled={!canContinue} className="flex items-center gap-2 rounded-full bg-[#6E0728] px-6 py-3.5 text-sm font-semibold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#C7AAB4]">
              {step === 5 ? "Review trade-in" : "Continue"} <ArrowRight size={16} />
            </button>
          </div>
        ) : !submitted ? (
          <button type="button" onClick={goBack} className="mt-5 flex items-center gap-1 rounded-full px-3 py-3 text-sm font-semibold text-[#6E0728]"><ArrowLeft size={16} /> Back to replacement</button>
        ) : null}
      </div>
    </main>
  )
}

function Progress({ step }: { step: number }) {
  return (
    <div aria-label={`Step ${step} of 6: ${stepLabels[step - 1]}`}>
      <div className="flex items-center gap-1.5">
        {stepLabels.map((label, index) => (
          <div key={label} className="flex flex-1 items-center gap-1.5">
            <span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${index + 1 < step ? "bg-[#6E0728] text-white" : index + 1 === step ? "bg-[#6E0728] text-white ring-4 ring-[#F5E8EC]" : "bg-[#EFEFF1] text-[#86868B]"}`}>
              {index + 1 < step ? <Check size={13} /> : index + 1}
            </span>
            {index < stepLabels.length - 1 ? <span className={`h-px flex-1 ${index + 1 < step ? "bg-[#6E0728]" : "bg-[#E5E5E7]"}`} /> : null}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs font-semibold text-[#6E0728]">{stepLabels[step - 1]}</p>
        <p className="text-xs text-[#86868B]">Step {step} of 6</p>
      </div>
    </div>
  )
}

function StepCard({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#E5E5E7] bg-white p-5 sm:p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#86868B]">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.5px]">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-[#86868B]">{description}</p>
      <div className="mt-6">{children}</div>
    </div>
  )
}

function CustomerStep({ value, onChange }: { value: TradeInCustomer; onChange: (value: TradeInCustomer) => void }) {
  return (
    <StepCard eyebrow="Step 1" title="Customer information" description="Record who is presenting the device for this trade-in preview.">
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField label="Full name" value={value.name} onChange={(name) => onChange({ ...value, name })} placeholder="Customer's full name" autoComplete="name" />
        <TextField label="Phone number" value={value.phone} onChange={(phone) => onChange({ ...value, phone })} placeholder="e.g. 024 000 0000" type="tel" autoComplete="tel" />
        <div className="sm:col-span-2">
          <TextField label="Email (optional)" value={value.email} onChange={(email) => onChange({ ...value, email })} placeholder="Customer's email address" type="email" autoComplete="email" />
        </div>
      </div>
    </StepCard>
  )
}

function DeviceStep({ value, onChange }: { value: TradeInDevice; onChange: (value: TradeInDevice) => void }) {
  return (
    <StepCard eyebrow="Step 2" title="Existing device" description="Enter the details printed on, or confirmed from, the customer's current phone.">
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField label="Brand" value={value.brand} onChange={(brand) => onChange({ ...value, brand })} placeholder="Apple" />
        <TextField label="Model" value={value.model} onChange={(model) => onChange({ ...value, model })} placeholder="iPhone 12 Pro" />
        <TextField label="Storage" value={value.storage} onChange={(storage) => onChange({ ...value, storage })} placeholder="128GB" />
        <TextField label="Colour" value={value.colour} onChange={(colour) => onChange({ ...value, colour })} placeholder="Pacific Blue" />
        <div className="sm:col-span-2">
          <TextField label="IMEI or serial number" value={value.identifier} onChange={(identifier) => onChange({ ...value, identifier })} placeholder="Enter the device identifier" mono />
        </div>
      </div>
      <div className="mt-5 flex gap-3 rounded-xl bg-[#F7F7F8] p-4 text-xs leading-5 text-[#68686D]">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#6E0728]" />
        <p>This preview records the identifier but does not run an IMEI, ownership, blacklist, or activation-lock check.</p>
      </div>
    </StepCard>
  )
}

function InspectionStep({ value, onChange }: { value: TradeInInspection; onChange: (value: TradeInInspection) => void }) {
  return (
    <StepCard eyebrow="Step 3" title="Condition assessment" description="Assess every item. Nothing is treated as passed until an employee selects a result.">
      <div className="space-y-6">
        <InspectionGroup label="Screen condition" value={value.screen} options={["Good", "Minor wear", "Damaged"]} onChange={(screen) => onChange({ ...value, screen: screen as CosmeticRating })} />
        <InspectionGroup label="Body / frame condition" value={value.body} options={["Good", "Minor wear", "Damaged"]} onChange={(body) => onChange({ ...value, body: body as CosmeticRating })} />
        <label className="block">
          <span className="mb-2 flex items-center gap-2 text-sm font-semibold"><BatteryMedium size={16} className="text-[#6E0728]" /> Battery health</span>
          <div className="relative max-w-xs">
            <input type="number" min="1" max="100" value={value.battery} onChange={(event) => onChange({ ...value, battery: event.target.value })} placeholder="e.g. 84" className="h-12 w-full rounded-xl border border-[#E5E5E7] bg-[#FAFAFC] px-4 pr-10 text-sm outline-none focus:border-[#6E0728]" />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[#86868B]">%</span>
          </div>
        </label>
        <InspectionGroup label="Camera functionality" value={value.camera} options={["Pass", "Issue"]} onChange={(camera) => onChange({ ...value, camera: camera as FunctionalRating })} />
        <InspectionGroup label="Buttons and ports" value={value.buttonsPorts} options={["Pass", "Issue"]} onChange={(buttonsPorts) => onChange({ ...value, buttonsPorts: buttonsPorts as FunctionalRating })} />
        <InspectionGroup label="Face ID / biometric" value={value.biometric} options={["Pass", "Issue"]} onChange={(biometric) => onChange({ ...value, biometric: biometric as FunctionalRating })} />
        <InspectionGroup label="Network status" value={value.network} options={["Clear", "Issue"]} onChange={(network) => onChange({ ...value, network: network as StatusRating })} />
        <InspectionGroup label="Activation-lock status" value={value.activationLock} options={["Clear", "Issue"]} onChange={(activationLock) => onChange({ ...value, activationLock: activationLock as StatusRating })} />
        <label className="block">
          <span className="mb-2 block text-sm font-semibold">Inspection notes <span className="font-normal text-[#86868B]">(optional)</span></span>
          <textarea value={value.notes} onChange={(event) => onChange({ ...value, notes: event.target.value })} rows={4} placeholder="Record scratches, faults, accessories or anything requiring review…" className="w-full resize-none rounded-xl border border-[#E5E5E7] bg-[#FAFAFC] px-4 py-3 text-sm outline-none focus:border-[#6E0728]" />
        </label>
      </div>
      {!isInspectionComplete(value) ? <p className="mt-5 rounded-xl bg-[#FFF9EB] p-3 text-xs leading-5 text-[#765613]">Complete every assessment item before continuing.</p> : null}
    </StepCard>
  )
}

function InspectionGroup({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold">{label}</legend>
      <div className={`grid gap-2 ${options.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        {options.map((option) => (
          <button key={option} type="button" onClick={() => onChange(option)} className={`rounded-xl border px-2 py-3 text-xs font-medium transition sm:text-sm ${value === option ? "border-[#6E0728] bg-[#FAF3F6] text-[#6E0728]" : "border-[#E5E5E7] bg-white text-[#68686D]"}`}>
            {option}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function ValuationStep({ device, inspection }: { device: TradeInDevice; inspection: TradeInInspection }) {
  const valuation = calculateDemoValuation(inspection)
  return (
    <StepCard eyebrow="Step 4" title="Demo trade-in estimate" description="Review an illustrative valuation for interface testing. This is not an approved offer.">
      <div className="rounded-2xl bg-[#6E0728] p-5 text-white">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/65">Estimated trade-in value · Demo only</p>
        <p className="mt-3 text-4xl font-semibold tracking-[-1px]">{formatGhs(valuation.estimatedOffer)}</p>
        <p className="mt-2 text-xs leading-5 text-white/70">Pending manager review and all required ownership, IMEI, diagnostic and activation-lock checks.</p>
      </div>

      <div className="mt-5 rounded-2xl border border-[#E5E5E7] p-4">
        <div className="flex items-start gap-3">
          <Smartphone className="mt-0.5 size-5 text-[#6E0728]" />
          <div><p className="font-semibold">{device.brand} {device.model}</p><p className="mt-1 text-sm text-[#86868B]">{device.storage} · {device.colour}</p><p className="mt-2 font-mono text-[11px] text-[#86868B]">{device.identifier}</p></div>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        <ValueRow label="Illustrative base value" amount={valuation.baseValue} />
        {valuation.adjustments.length ? valuation.adjustments.map((item) => <ValueRow key={item.label} label={item.label} amount={item.amount} />) : <ValueRow label="Demo condition adjustments" amount={0} />}
        <div className="border-t border-[#E5E5E7] pt-3"><ValueRow label="Final demo estimate" amount={valuation.estimatedOffer} strong /></div>
      </div>

      <div className="mt-5 flex gap-3 rounded-xl border border-[#F2E2BD] bg-[#FFF9EB] p-4 text-xs leading-5 text-[#765613]">
        <CircleAlert className="mt-0.5 size-4 shrink-0" />
        <p>The values shown are invented preview figures, not Mac Evra valuation rules. Manager approval is required before any trade-in can be accepted.</p>
      </div>
    </StepCard>
  )
}

function ValueRow({ label, amount, strong = false }: { label: string; amount: number; strong?: boolean }) {
  return <div className={`flex items-center justify-between gap-4 text-sm ${strong ? "font-semibold" : ""}`}><span className={strong ? "text-[#1D1D1F]" : "text-[#68686D]"}>{label}</span><span className={amount < 0 ? "text-[#A13B34]" : ""}>{amount < 0 ? "−" : ""}{formatGhs(Math.abs(amount))}</span></div>
}

function ReplacementStep({ phones, search, onSearch, selected, onSelect, estimatedOffer }: { phones: Phone[]; search: string; onSearch: (value: string) => void; selected: Phone | null; onSelect: (phone: Phone) => void; estimatedOffer: number }) {
  return (
    <StepCard eyebrow="Step 5" title="Choose a replacement" description="Only devices currently marked Available can be selected for this preview.">
      {selected ? (
        <div className="mb-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#86868B]">Selected replacement</p>
          <SaleDeviceSummary phone={selected} />
          <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-[#F7F7F8] p-4">
            <div><p className="text-xs text-[#86868B]">Demo trade-in value</p><p className="mt-1 font-semibold">{formatGhs(estimatedOffer)}</p></div>
            <div className="text-right"><p className="text-xs text-[#86868B]">Remaining balance</p><p className="mt-1 font-semibold text-[#6E0728]">{formatGhs(Math.max(0, selected.price - estimatedOffer))}</p></div>
          </div>
        </div>
      ) : null}

      <div className="relative">
        <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#86868B]" />
        <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search available inventory" className="h-12 w-full rounded-xl border border-[#E5E5E7] bg-[#FAFAFC] pl-11 pr-4 text-sm outline-none focus:border-[#6E0728]" />
      </div>
      <div className="mt-4 grid max-h-[440px] gap-3 overflow-y-auto pr-1">
        {phones.map((phone) => <DeviceCard key={phone.imei} phone={phone} selected={selected?.imei === phone.imei} onClick={() => onSelect(phone)} />)}
        {!phones.length ? <p className="rounded-xl bg-[#F7F7F8] p-6 text-center text-sm text-[#86868B]">No available devices match the search.</p> : null}
      </div>
    </StepCard>
  )
}

function SummaryStep({ customer, device, inspection, replacement, submitted, onSubmit, onStartAnother }: { customer: TradeInCustomer; device: TradeInDevice; inspection: TradeInInspection; replacement: Phone; submitted: boolean; onSubmit: () => void; onStartAnother: () => void }) {
  const valuation = calculateDemoValuation(inspection)
  const remaining = Math.max(0, replacement.price - valuation.estimatedOffer)

  return (
    <StepCard eyebrow="Step 6" title="Trade-in summary" description="Review the complete preview before preparing a manager approval request.">
      <div className="flex gap-3 rounded-xl border border-[#F2E2BD] bg-[#FFF9EB] p-4 text-xs leading-5 text-[#765613]">
        <ClipboardCheck className="mt-0.5 size-4 shrink-0" />
        <p><strong>Manager approval outstanding.</strong> This trade-in is not accepted or finalised, and the replacement device is not reserved.</p>
      </div>

      <div className="mt-5 space-y-4">
        <SummaryCard title="Customer"><SummaryRow label="Name" value={customer.name} /><SummaryRow label="Phone" value={customer.phone} />{customer.email ? <SummaryRow label="Email" value={customer.email} /> : null}</SummaryCard>
        <SummaryCard title="Trade-in device"><SummaryRow label="Device" value={`${device.brand} ${device.model}`} /><SummaryRow label="Details" value={`${device.storage} · ${device.colour}`} /><SummaryRow label="IMEI / serial" value={device.identifier} mono /></SummaryCard>
        <SummaryCard title="Inspection results">
          <SummaryRow label="Screen" value={inspection.screen} /><SummaryRow label="Body / frame" value={inspection.body} /><SummaryRow label="Battery" value={`${inspection.battery}%`} /><SummaryRow label="Camera" value={inspection.camera} /><SummaryRow label="Buttons / ports" value={inspection.buttonsPorts} /><SummaryRow label="Biometric" value={inspection.biometric} /><SummaryRow label="Network" value={inspection.network} /><SummaryRow label="Activation lock" value={inspection.activationLock} />{inspection.notes ? <SummaryRow label="Notes" value={inspection.notes} /> : null}
        </SummaryCard>
        <SummaryCard title="Replacement device"><SaleDeviceSummary phone={replacement} className="border-0 bg-[#FAFAFC]" /></SummaryCard>
        <div className="rounded-2xl bg-[#F7F7F8] p-5">
          <SummaryRow label="Replacement price" value={formatGhs(replacement.price)} />
          <SummaryRow label="Demo trade-in estimate" value={`− ${formatGhs(valuation.estimatedOffer)}`} />
          <div className="mt-4 border-t border-[#E0E0E3] pt-4"><SummaryRow label="Remaining balance" value={formatGhs(remaining)} strong /></div>
        </div>
      </div>

      {submitted ? (
        <div className="mt-6 rounded-2xl border border-[#D8DDF5] bg-[#F3F5FF] p-5 text-center">
          <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-white text-[#4D5CA8]"><ClipboardCheck size={20} /></span>
          <h3 className="mt-3 font-semibold text-[#344284]">Demo approval request prepared</h3>
          <p className="mt-2 text-xs leading-5 text-[#59689E]">No request was sent and no inventory or payment record changed. A connected manager approval service is required in production.</p>
          <div className="mt-5 grid grid-cols-2 gap-2"><Link href="/home" className="rounded-full border border-[#CCD3EF] px-4 py-3 text-sm font-semibold text-[#4D5CA8]">Back Home</Link><button type="button" onClick={onStartAnother} className="rounded-full bg-[#4D5CA8] px-4 py-3 text-sm font-semibold text-white">Start another</button></div>
        </div>
      ) : (
        <button type="button" onClick={onSubmit} className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[#6E0728] px-5 py-4 text-sm font-semibold text-white active:scale-[0.98]"><ClipboardCheck size={17} /> Prepare Manager Approval</button>
      )}
    </StepCard>
  )
}

function SummaryCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-2xl border border-[#E5E5E7] p-4"><h3 className="mb-3 text-sm font-semibold">{title}</h3><div className="space-y-3">{children}</div></div>
}

function SummaryRow({ label, value, mono = false, strong = false }: { label: string; value: string; mono?: boolean; strong?: boolean }) {
  return <div className={`flex items-start justify-between gap-4 text-sm ${strong ? "font-semibold" : ""}`}><span className="text-[#86868B]">{label}</span><span className={`max-w-[65%] break-words text-right ${mono ? "font-mono text-xs" : ""} ${strong ? "text-lg text-[#6E0728]" : "font-medium"}`}>{value}</span></div>
}

function TextField({ label, value, onChange, placeholder, type = "text", autoComplete, mono = false }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; type?: string; autoComplete?: string; mono?: boolean }) {
  return <label className="block"><span className="mb-2 block text-sm font-semibold">{label}</span><input type={type} autoComplete={autoComplete} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={`h-12 w-full rounded-xl border border-[#E5E5E7] bg-[#FAFAFC] px-4 text-sm outline-none focus:border-[#6E0728] ${mono ? "font-mono" : ""}`} /></label>
}
