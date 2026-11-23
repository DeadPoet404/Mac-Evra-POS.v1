import Link from "next/link"
import {
  ArrowLeft,
  ArrowRight,
  BadgeDollarSign,
  Check,
  CircleAlert,
  ClipboardCheck,
  FilePlus2,
  History,
  ShieldCheck,
  Smartphone,
  UserRound,
} from "lucide-react"

import {
  createTradeInDraftAction,
  saveTradeInCustomerAction,
  saveTradeInDeviceAction,
  saveTradeInInspectionAction,
  submitTradeInAction,
} from "@/app/trade-in/actions"
import { EmployeeHeader } from "@/components/employee/employee-header"
import { requirePermissions } from "@/lib/auth/server"
import { formatPesewas, pesewasToGhsInput } from "@/lib/sales"
import {
  cosmeticConditions,
  inspectionResults,
  tradeInNextAction,
  tradeInResumeStep,
  tradeInStatusLabel,
  type TradeInStatus,
} from "@/lib/trade-in"
import { listEmployeeTradeIns, type PersistentTradeIn } from "@/lib/trade-in-server"

const errors: Record<string, string> = {
  "draft-create-failed": "A trade-in request could not be started. Try again.",
  "invalid-customer": "Enter a valid customer name, phone number, and optional email.",
  "customer-save-failed": "Customer details could not be saved.",
  "invalid-device": "Enter the device details and a valid selected identifier.",
  "identifier-in-use": "That IMEI or serial number is already attached to an active trade-in or inventory record.",
  "device-save-failed": "The device details could not be saved.",
  "invalid-inspection": "Select an explicit result for every inspection item. Battery percentage may be left blank.",
  "inspection-save-failed": "The inspection could not be saved.",
  "invalid-offer": "Enter a positive proposed offer in Ghana cedis. It is non-final until approved.",
  "submit-failed": "The request could not be submitted. Review each saved step and try again.",
}

const notices: Record<string, string> = {
  "draft-created": "Trade-in draft started and saved.",
  "draft-resumed": "Your saved trade-in draft is ready to resume.",
  "customer-saved": "Customer details saved.",
  "device-saved": "Device identity saved.",
  "inspection-saved": "Structured inspection saved.",
  submitted: "Trade-in submitted for a different authorised manager to review.",
}

const stepLabels = ["Customer", "Device", "Inspection", "Offer & submit"]

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-GH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Accra",
  }).format(new Date(value))
}

function statusTone(status: TradeInStatus) {
  if (status === "approved" || status === "intaken") return "border-[#CDE9D7] bg-[#F0FAF3] text-[#267343]"
  if (status === "declined") return "border-[#E8C9C6] bg-[#FFF3F2] text-[#A13B34]"
  if (status === "pending") return "border-[#F2E2BD] bg-[#FFF9EB] text-[#765613]"
  return "border-[#D8DDF5] bg-[#F3F5FF] text-[#4D5CA8]"
}

export default async function TradeInPage({
  searchParams,
}: {
  searchParams: Promise<{ request?: string; step?: string; notice?: string; error?: string }>
}) {
  const { access, membership } = await requirePermissions(
    ["access_employee_workspace", "process_trade_ins"],
    { nextPath: "/trade-in" }
  )
  const params = await searchParams
  const requests = await listEmployeeTradeIns(membership.storeId, access.userId!)
  const selected = params.request
    ? requests.find((request) => request.id === params.request) ?? null
    : requests.find((request) => request.status === "draft") ?? null
  const completedRequests = requests.filter((request) => request.status !== "draft")
  const step = selected?.status === "draft"
    ? tradeInResumeStep(selected.progressStep, params.step)
    : 1

  return (
    <main className="min-h-screen bg-[#FAFAFC] pb-16 text-[#1D1D1F]">
      <EmployeeHeader title="Trade-in" backHref="/home" backLabel="Home" />
      <div className="mx-auto w-full max-w-3xl px-5 pt-9 sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#86868B]">Persistent employee intake</p>
        <h1 className="mt-2 text-[38px] font-semibold tracking-[-1.2px] text-[#6E0728] sm:text-[44px]">Prepare a trade-in.</h1>
        <p className="mt-2 max-w-2xl text-base leading-7 text-[#68686D]">Capture the customer, verified identity, inspection, and your non-final proposed offer. A replacement phone is not required.</p>

        {params.error && errors[params.error] ? (
          <p role="alert" className="mt-6 rounded-2xl border border-[#E8C9D2] bg-[#FCF4F6] px-5 py-4 text-sm font-medium text-[#6E0728]">{errors[params.error]}</p>
        ) : null}
        {params.notice && notices[params.notice] ? (
          <p role="status" className="mt-6 rounded-2xl border border-[#CDE9D7] bg-[#F0FAF3] px-5 py-4 text-sm font-medium text-[#267343]">{notices[params.notice]}</p>
        ) : null}

        {!selected ? (
          <section className="mt-8 rounded-3xl border border-[#E8E8ED] bg-white p-7 text-center shadow-sm sm:p-10">
            <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-[#F5EDF0] text-[#6E0728]"><FilePlus2 size={29} /></span>
            <h2 className="mt-5 text-xl font-semibold">Start a trade-in request</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#86868B]">Each step is persisted. If you leave before submission, this page resumes your own in-progress draft.</p>
            <form action={createTradeInDraftAction} className="mt-6">
              <button type="submit" className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-[#6E0728] px-8 text-base font-semibold text-white hover:bg-[#57051F]"><FilePlus2 size={18} /> Start trade-in</button>
            </form>
          </section>
        ) : selected.status === "draft" ? (
          <div className="mt-8">
            <Progress step={step} request={selected} />
            <section className="mt-6 rounded-3xl border border-[#E8E8ED] bg-white p-5 shadow-sm sm:p-7">
              {step === 1 ? <CustomerForm request={selected} /> : null}
              {step === 2 ? <DeviceForm request={selected} /> : null}
              {step === 3 ? <InspectionForm request={selected} /> : null}
              {step === 4 ? <OfferForm request={selected} /> : null}
            </section>
          </div>
        ) : (
          <PersistedStatus request={selected} />
        )}

        {completedRequests.length ? (
          <section className="mt-10">
            <div className="flex items-center gap-2"><History size={18} className="text-[#6E0728]" /><h2 className="text-lg font-semibold">Your persisted requests</h2></div>
            <div className="mt-4 grid gap-3">
              {completedRequests.map((request) => (
                <Link key={request.id} href={`/trade-in?request=${encodeURIComponent(request.id)}`} className={`rounded-2xl border p-4 transition hover:brightness-[0.98] ${statusTone(request.status)}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-xs font-semibold">{request.requestNumber}</p><p className="mt-1 font-semibold text-[#1D1D1F]">{request.deviceBrand} {request.deviceModel}</p><p className="mt-1 text-xs opacity-80">{request.customerFullName} · Updated {dateTime(request.updatedAt)}</p></div><span className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold">{tradeInStatusLabel(request.status)}</span></div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  )
}

function Progress({ step, request }: { step: number; request: PersistentTradeIn }) {
  return (
    <div aria-label={`Step ${step} of 4: ${stepLabels[step - 1]}`}>
      <div className="flex items-center gap-1.5">
        {stepLabels.map((label, index) => (
          <div key={label} className="flex flex-1 items-center gap-1.5">
            <Link href={index + 1 <= request.progressStep ? `/trade-in?request=${encodeURIComponent(request.id)}&step=${index + 1}` : "#"} aria-disabled={index + 1 > request.progressStep} className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${index + 1 < step ? "bg-[#6E0728] text-white" : index + 1 === step ? "bg-[#6E0728] text-white ring-4 ring-[#F5E8EC]" : "bg-[#EFEFF1] text-[#86868B]"}`}>
              {index + 1 < step ? <Check size={14} /> : index + 1}
            </Link>
            {index < stepLabels.length - 1 ? <span className={`h-px flex-1 ${index + 1 < step ? "bg-[#6E0728]" : "bg-[#E5E5E7]"}`} /> : null}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3"><p className="text-xs font-semibold text-[#6E0728]">{stepLabels[step - 1]}</p><p className="font-mono text-[11px] text-[#86868B]">{request.requestNumber}</p></div>
    </div>
  )
}

function FormHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#86868B]">{eyebrow}</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.5px]">{title}</h2><p className="mt-2 text-sm leading-6 text-[#86868B]">{description}</p></div>
}

function CustomerForm({ request }: { request: PersistentTradeIn }) {
  return (
    <form action={saveTradeInCustomerAction}>
      <input type="hidden" name="requestId" value={request.id} />
      <FormHeading eyebrow="Step 1" title="Customer details" description="Record the person presenting the device. Email is optional." />
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <Field label="Full name" name="fullName" defaultValue={request.customerFullName ?? ""} placeholder="Customer's full name" icon={UserRound} autoComplete="name" />
        <Field label="Phone number" name="phone" defaultValue={request.customerPhone ?? ""} placeholder="e.g. 024 000 0000" type="tel" autoComplete="tel" />
        <div className="sm:col-span-2"><Field label="Email (optional)" name="email" defaultValue={request.customerEmail ?? ""} placeholder="customer@example.com" type="email" autoComplete="email" /></div>
      </div>
      <SubmitRow request={request} step={1} label="Save and continue" />
    </form>
  )
}

function DeviceForm({ request }: { request: PersistentTradeIn }) {
  const identifier = request.imei ?? request.serialNumber ?? ""
  return (
    <form action={saveTradeInDeviceAction}>
      <input type="hidden" name="requestId" value={request.id} />
      <FormHeading eyebrow="Step 2" title="Device and identity" description="Choose the identifier actually available. Never invent an IMEI for a serial-only device." />
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <Field label="Brand" name="brand" defaultValue={request.deviceBrand ?? ""} placeholder="Apple" />
        <Field label="Model" name="model" defaultValue={request.deviceModel ?? ""} placeholder="iPhone 13 Pro" />
        <Field label="Storage (GB)" name="storageGb" defaultValue={request.storageGb?.toString() ?? ""} placeholder="256" type="number" />
        <Field label="Colour" name="colour" defaultValue={request.colour ?? ""} placeholder="Graphite" />
        <label className="block"><span className="mb-2 block text-sm font-semibold">Identifier type</span><select name="identifierType" defaultValue={request.identifierType ?? "imei"} className="h-12 w-full rounded-xl border border-[#E5E5E7] bg-[#FAFAFC] px-4 text-sm outline-none focus:border-[#6E0728]"><option value="imei">IMEI</option><option value="serial">Serial number</option></select></label>
        <Field label="Device identifier" name="identifier" defaultValue={identifier} placeholder="15-digit IMEI or supported serial" mono />
      </div>
      <div className="mt-5 flex gap-3 rounded-xl bg-[#F7F7F8] p-4 text-xs leading-5 text-[#68686D]"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#6E0728]" /><p>IMEIs must contain exactly 15 digits and pass the Luhn check. Active request and inventory duplicates are rejected.</p></div>
      <SubmitRow request={request} step={2} label="Save and continue" />
    </form>
  )
}

function InspectionForm({ request }: { request: PersistentTradeIn }) {
  return (
    <form action={saveTradeInInspectionAction}>
      <input type="hidden" name="requestId" value={request.id} />
      <FormHeading eyebrow="Step 3" title="Structured inspection" description="Record what was observed. Unknown and not tested are explicit results—not silent passes." />
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <SelectField label="Cosmetic condition" name="cosmeticCondition" defaultValue={request.cosmeticCondition} values={cosmeticConditions} cosmetic />
        <SelectField label="Display" name="displayCheck" defaultValue={request.displayCheck} values={inspectionResults} />
        <SelectField label="Battery function" name="batteryCheck" defaultValue={request.batteryCheck} values={inspectionResults} />
        <Field label="Battery health % (optional)" name="batteryHealth" defaultValue={request.batteryHealth?.toString() ?? ""} placeholder="e.g. 87" type="number" />
        <SelectField label="Cameras" name="camerasCheck" defaultValue={request.camerasCheck} values={inspectionResults} />
        <SelectField label="Buttons and ports" name="buttonsCheck" defaultValue={request.buttonsCheck} values={inspectionResults} />
        <SelectField label="Connectivity / network" name="connectivityCheck" defaultValue={request.connectivityCheck} values={inspectionResults} />
        <SelectField label="Face ID / biometric" name="biometricCheck" defaultValue={request.biometricCheck} values={inspectionResults} />
        <SelectField label="Activation lock" name="activationLockCheck" defaultValue={request.activationLockCheck} values={inspectionResults} />
        <SelectField label="Other functionality" name="otherFunctionalCheck" defaultValue={request.otherFunctionalCheck} values={inspectionResults} />
        <label className="block sm:col-span-2"><span className="mb-2 block text-sm font-semibold">Inspection notes (optional)</span><textarea name="notes" defaultValue={request.inspectionNotes ?? ""} maxLength={2000} rows={4} placeholder="Record damage, faults, accessories, or checks requiring follow-up…" className="w-full resize-none rounded-xl border border-[#E5E5E7] bg-[#FAFAFC] px-4 py-3 text-sm outline-none focus:border-[#6E0728]" /></label>
      </div>
      <SubmitRow request={request} step={3} label="Save and continue" />
    </form>
  )
}

function OfferForm({ request }: { request: PersistentTradeIn }) {
  return (
    <form action={submitTradeInAction}>
      <input type="hidden" name="requestId" value={request.id} />
      <FormHeading eyebrow="Step 4" title="Propose an offer" description="No deterministic valuation policy is configured. Enter your considered proposal in Ghana cedis; it remains non-final until a manager decides." />
      <div className="mt-6 rounded-2xl border border-[#F2E2BD] bg-[#FFF9EB] p-4 text-sm leading-6 text-[#765613]"><div className="flex gap-3"><CircleAlert className="mt-0.5 size-5 shrink-0" /><p><strong>Proposal only.</strong> Submission does not accept the phone, pay the customer, apply sale credit, alter a sale total, or add inventory.</p></div></div>
      <div className="mt-6 grid gap-5">
        <Field label="Proposed offer (GHS)" name="proposedOfferGhs" defaultValue={request.proposedOfferPesewas ? pesewasToGhsInput(request.proposedOfferPesewas) : ""} placeholder="e.g. 2400.00" inputMode="decimal" icon={BadgeDollarSign} />
        <label className="block"><span className="mb-2 block text-sm font-semibold">Supporting notes (optional)</span><textarea name="supportingNotes" defaultValue={request.supportingNotes ?? ""} maxLength={2000} rows={4} placeholder="Explain observed value, included accessories, or issues for manager review…" className="w-full resize-none rounded-xl border border-[#E5E5E7] bg-[#FAFAFC] px-4 py-3 text-sm outline-none focus:border-[#6E0728]" /></label>
      </div>
      <div className="mt-6 rounded-2xl bg-[#F7F7F8] p-4 text-sm"><p className="font-semibold">Ready for review</p><p className="mt-1 text-[#68686D]">{request.customerFullName} · {request.deviceBrand} {request.deviceModel} · {request.storageGb}GB</p><p className="mt-2 font-mono text-xs text-[#86868B]">{request.imei ? `IMEI ${request.imei}` : `Serial ${request.serialNumber}`}</p></div>
      <SubmitRow request={request} step={4} label="Submit for manager approval" submit />
    </form>
  )
}

function SubmitRow({ request, step, label, submit = false }: { request: PersistentTradeIn; step: number; label: string; submit?: boolean }) {
  return (
    <div className="mt-7 flex items-center justify-between gap-3 border-t border-[#E8E8ED] pt-5">
      {step > 1 ? <Link href={`/trade-in?request=${encodeURIComponent(request.id)}&step=${step - 1}`} className="inline-flex items-center gap-1 rounded-full px-3 py-3 text-sm font-semibold text-[#6E0728]"><ArrowLeft size={16} /> Back</Link> : <span />}
      <button type="submit" className="inline-flex items-center gap-2 rounded-full bg-[#6E0728] px-6 py-3.5 text-sm font-semibold text-white hover:bg-[#57051F]">{submit ? <ClipboardCheck size={16} /> : null}{label}{submit ? null : <ArrowRight size={16} />}</button>
    </div>
  )
}

function PersistedStatus({ request }: { request: PersistentTradeIn }) {
  return (
    <section className="mt-8 rounded-3xl border border-[#E8E8ED] bg-white p-6 shadow-sm sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-mono text-xs font-semibold text-[#6E0728]">{request.requestNumber}</p><h2 className="mt-2 text-2xl font-semibold">{tradeInStatusLabel(request.status)}</h2><p className="mt-2 text-sm leading-6 text-[#68686D]">{tradeInNextAction(request.status, request.progressStep)}</p></div><span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${statusTone(request.status)}`}>{tradeInStatusLabel(request.status)}</span></div>
      <div className="mt-6 grid gap-4 rounded-2xl bg-[#F7F7F8] p-5 sm:grid-cols-2"><StatusDetail label="Customer" value={request.customerFullName ?? "—"} /><StatusDetail label="Phone" value={request.customerPhone ?? "—"} /><StatusDetail label="Device" value={`${request.deviceBrand} ${request.deviceModel} · ${request.storageGb}GB`} /><StatusDetail label={request.identifierType === "imei" ? "IMEI" : "Serial"} value={request.imei ?? request.serialNumber ?? "—"} mono /><StatusDetail label="Proposed offer" value={request.proposedOfferPesewas === null ? "—" : formatPesewas(request.proposedOfferPesewas)} /><StatusDetail label="Submitted" value={request.submittedAt ? dateTime(request.submittedAt) : "—"} /></div>
      {request.decisionNote ? <div className="mt-5 rounded-2xl border border-[#E8E8ED] p-4"><p className="text-xs font-semibold uppercase tracking-wide text-[#86868B]">Manager decision</p><p className="mt-2 text-sm leading-6">{request.decisionNote}</p><p className="mt-2 text-xs text-[#86868B]">{request.decidedByName} · {request.decidedAt ? dateTime(request.decidedAt) : ""}</p></div> : null}
      {request.status === "approved" ? <div className="mt-5 flex gap-3 rounded-2xl border border-[#F2E2BD] bg-[#FFF9EB] p-4 text-sm leading-6 text-[#765613]"><CircleAlert className="mt-0.5 size-5 shrink-0" /><p>Approval alone did not add sellable stock. A separately authorised manager must physically verify and receive an eligible device.</p></div> : null}
      {request.status === "intaken" ? <div className="mt-5 flex gap-3 rounded-2xl border border-[#CDE9D7] bg-[#F0FAF3] p-4 text-sm leading-6 text-[#267343]"><Smartphone className="mt-0.5 size-5 shrink-0" /><p>Physical intake recorded by {request.intakenByName} on {request.intakenAt ? dateTime(request.intakenAt) : "the trusted timestamp"}. Inventory reference: <span className="font-mono text-xs">{request.intakeStoreInventoryId}</span>.</p></div> : null}
      <div className="mt-6 flex flex-wrap gap-3"><Link href="/trade-in" className="inline-flex h-12 items-center justify-center rounded-full border border-[#D8C4CB] px-6 text-sm font-semibold text-[#6E0728]">Back to trade-ins</Link>{!request || request.status !== "draft" ? <form action={createTradeInDraftAction}><button type="submit" className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#6E0728] px-6 text-sm font-semibold text-white"><FilePlus2 size={16} /> Start another</button></form> : null}</div>
    </section>
  )
}

function StatusDetail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div><p className="text-xs text-[#86868B]">{label}</p><p className={`mt-1 break-words text-sm font-medium ${mono ? "font-mono text-xs" : ""}`}>{value}</p></div>
}

function Field({ label, name, defaultValue, placeholder, type = "text", autoComplete, mono = false, inputMode, icon: Icon }: { label: string; name: string; defaultValue: string; placeholder: string; type?: string; autoComplete?: string; mono?: boolean; inputMode?: "decimal" | "numeric"; icon?: React.ElementType }) {
  return <label className="block"><span className="mb-2 flex items-center gap-2 text-sm font-semibold">{Icon ? <Icon size={16} className="text-[#6E0728]" /> : null}{label}</span><input name={name} type={type} inputMode={inputMode} autoComplete={autoComplete} defaultValue={defaultValue} placeholder={placeholder} className={`h-12 w-full rounded-xl border border-[#E5E5E7] bg-[#FAFAFC] px-4 text-sm outline-none focus:border-[#6E0728] ${mono ? "font-mono" : ""}`} /></label>
}

function SelectField({ label, name, defaultValue, values, cosmetic = false }: { label: string; name: string; defaultValue: string; values: readonly string[]; cosmetic?: boolean }) {
  return <label className="block"><span className="mb-2 block text-sm font-semibold">{label}</span><select name={name} defaultValue={defaultValue} className="h-12 w-full rounded-xl border border-[#E5E5E7] bg-[#FAFAFC] px-4 text-sm outline-none focus:border-[#6E0728]">{values.map((value) => <option key={value} value={value}>{inspectionLabel(value, cosmetic)}</option>)}</select></label>
}

function inspectionLabel(value: string, cosmetic: boolean) {
  if (value === "unknown") return "Unknown"
  if (value === "not_tested") return "Not tested"
  if (value === "not_applicable") return "Not applicable"
  if (value === "pass") return "Pass"
  if (value === "issue") return "Issue found"
  if (cosmetic) return value[0].toUpperCase() + value.slice(1)
  return value
}
