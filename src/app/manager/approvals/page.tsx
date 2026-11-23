import Link from "next/link"
import {
  BadgeDollarSign,
  Check,
  CircleAlert,
  ClipboardCheck,
  PackageCheck,
  Search,
  ShieldAlert,
  Smartphone,
  Timer,
  X,
} from "lucide-react"

import { decideTradeInAction, intakeTradeInAction } from "@/app/trade-in/actions"
import { DataBadge, EmptyState, MetricCard, PageHeader } from "@/components/manager/manager-ui"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissions } from "@/lib/auth/server"
import { formatPesewas } from "@/lib/sales"
import {
  isTradeInInventoryEligible,
  matchesTradeInSearch,
  tradeInStatusLabel,
  tradeInStatuses,
  type TradeInStatus,
} from "@/lib/trade-in"
import { listManagerTradeIns, type PersistentTradeIn } from "@/lib/trade-in-server"

const errors: Record<string, string> = {
  "invalid-decision": "Select approve or decline and enter a meaningful decision note of at least 10 characters.",
  "self-decision": "Separation of duties prevents a requester from deciding their own trade-in.",
  "already-decided": "This request was already decided by another manager. The queue has been refreshed.",
  "decision-failed": "The decision could not be recorded. Confirm your effective permissions and try again.",
  "invalid-intake": "Enter a selling price and meaningful intake note, then confirm both physical checks.",
  "identifier-in-inventory": "The confirmed IMEI already exists in inventory. No intake record was created.",
  "intake-ineligible": "This request is not eligible for existing sellable inventory or was already physically received.",
  "intake-failed": "Physical intake could not be completed. No partial inventory record was kept.",
}

const notices: Record<string, string> = {
  approved: "Trade-in approved. Inventory remains unchanged until separately confirmed physical intake.",
  declined: "Trade-in declined with an attributed immutable audit event.",
  intaken: "Physical intake completed with trade-in acquisition provenance and inventory movement history.",
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-GH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Accra",
  }).format(new Date(value))
}

function StatusBadge({ status }: { status: TradeInStatus }) {
  const tone = status === "approved" || status === "intaken" ? "green" : status === "declined" ? "red" : status === "pending" ? "amber" : "blue"
  return <DataBadge tone={tone}>{tradeInStatusLabel(status)}</DataBadge>
}

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; request?: string; notice?: string; error?: string }>
}) {
  const { access, membership } = await requirePermissions(
    ["access_manager_workspace", "review_approvals"],
    { nextPath: "/manager/approvals" }
  )
  const params = await searchParams
  const requests = await listManagerTradeIns(membership.storeId)
  const query = params.q?.trim() ?? ""
  const submittedStatuses = tradeInStatuses.filter((value): value is Exclude<TradeInStatus, "draft"> => value !== "draft")
  const requestedStatus = params.status as Exclude<TradeInStatus, "draft"> | undefined
  const status: Exclude<TradeInStatus, "draft"> | "all" = params.status === "all"
    ? "all"
    : requestedStatus && submittedStatuses.includes(requestedStatus)
      ? requestedStatus
      : "pending"
  const filtered = requests.filter((request) => {
    if (status !== "all" && request.status !== status) return false
    return matchesTradeInSearch({
      requestNumber: request.requestNumber,
      customerName: request.customerFullName,
      customerPhone: request.customerPhone,
      requesterName: request.requesterName,
      deviceBrand: request.deviceBrand,
      deviceModel: request.deviceModel,
      imei: request.imei,
      serialNumber: request.serialNumber,
    }, query)
  })
  const selected = params.request ? requests.find((request) => request.id === params.request) ?? null : null
  const pending = requests.filter((request) => request.status === "pending")
  const approved = requests.filter((request) => request.status === "approved")
  const decided = requests.filter((request) => request.status === "approved" || request.status === "declined" || request.status === "intaken")
  const pendingValue = pending.reduce((total, request) => total + (request.proposedOfferPesewas ?? 0), 0)
  const canDecide = membership.permissions.includes("approve_trade_ins")
  const canIntake = membership.permissions.includes("manage_inventory")

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-7 p-4 sm:p-6 lg:p-8">
      <PageHeader eyebrow="Store-scoped trade-in control" title="Trade-in approvals" description={`Review persisted trade-in requests for ${membership.storeName}.`} />

      <div className="flex gap-3 rounded-2xl border border-[#F2E2BD] bg-[#FFF9EB] p-4 text-sm leading-6 text-[#765613]"><CircleAlert className="mt-0.5 size-5 shrink-0" /><p>A manager decision records approval or decline only. It does not pay the customer, apply sale credit, or create inventory. Physical receipt is a separate permission-checked action.</p></div>

      {params.error && errors[params.error] ? <div role="alert" className="flex items-start gap-2 rounded-xl border border-[#E8C9C6] bg-[#FFF3F2] px-4 py-3 text-sm leading-6 text-[#A13B34]"><ShieldAlert className="mt-0.5 size-4 shrink-0" />{errors[params.error]}</div> : null}
      {params.notice && notices[params.notice] ? <div role="status" className="flex items-start gap-2 rounded-xl border border-[#CDE9D7] bg-[#F0FAF3] px-4 py-3 text-sm leading-6 text-[#267343]"><ClipboardCheck className="mt-0.5 size-4 shrink-0" />{notices[params.notice]}</div> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Trade-in approval metrics">
        <MetricCard label="Pending review" value={String(pending.length)} note="Manager decision required" icon={Timer} tone="amber" />
        <MetricCard label="Pending proposals" value={formatPesewas(pendingValue)} note="Non-final employee proposals" icon={BadgeDollarSign} tone="blue" />
        <MetricCard label="Approved, not received" value={String(approved.length)} note="No inventory created yet" icon={Smartphone} tone="burgundy" />
        <MetricCard label="Decided" value={String(decided.length)} note="Approved, declined, or received" icon={ClipboardCheck} tone="green" />
      </section>

      <Card className="rounded-2xl border-[#E8E8ED] bg-white shadow-none">
        <CardContent className="p-5">
          <form method="get" className="grid gap-3 sm:grid-cols-[minmax(220px,1fr)_220px_auto] sm:items-end">
            <label className="relative block text-xs font-medium text-[#68686D]">Search
              <Search className="absolute bottom-3 left-3 size-4 text-[#A1A1A6]" />
              <input name="q" defaultValue={query} placeholder="Request, customer, employee, or identity" className="mt-1 h-10 w-full rounded-lg border border-[#E5E5E7] pl-9 pr-3 text-sm outline-none focus:border-[#6E0728]" />
            </label>
            <label className="block text-xs font-medium text-[#68686D]">Status
              <select name="status" defaultValue={status} className="mt-1 h-10 w-full rounded-lg border border-[#E5E5E7] bg-white px-3 text-sm outline-none focus:border-[#6E0728]"><option value="pending">Pending review</option><option value="approved">Approved, not received</option><option value="declined">Declined</option><option value="intaken">Physically received</option><option value="all">All submitted requests</option></select>
            </label>
            <button type="submit" className="h-10 rounded-full bg-[#6E0728] px-5 text-sm font-semibold text-white">Apply filters</button>
          </form>
        </CardContent>
      </Card>

      <section className={`grid gap-5 ${selected ? "xl:grid-cols-[minmax(0,1fr)_440px]" : "grid-cols-1"}`}>
        <Card className="min-w-0 rounded-2xl border-[#E8E8ED] bg-white shadow-none">
          <CardContent className="p-0">
            <div className="border-b border-[#E8E8ED] p-5"><h2 className="font-semibold">Approval queue</h2><p className="mt-1 text-sm text-[#86868B]">{filtered.length} persisted request{filtered.length === 1 ? "" : "s"}</p></div>
            {filtered.length ? <div className="divide-y divide-[#F0F0F2]">{filtered.map((request) => <QueueRow key={request.id} request={request} selected={selected?.id === request.id} query={query} status={status} />)}</div> : <EmptyState title="No trade-in requests" description="No submitted requests match this store, status, and search." />}
          </CardContent>
        </Card>

        {selected ? (
          <Card className="h-fit rounded-2xl border-[#E8E8ED] bg-white shadow-none">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3"><div><StatusBadge status={selected.status} /><h2 className="mt-3 font-mono text-sm font-semibold text-[#6E0728]">{selected.requestNumber}</h2><p className="mt-1 text-xs text-[#86868B]">Created {dateTime(selected.createdAt)}</p></div><Link href="/manager/approvals" aria-label="Close request" className="rounded-lg p-2 text-[#86868B]"><X size={17} /></Link></div>

              <DetailSection title="Customer"><DetailRow label="Name" value={selected.customerFullName ?? "—"} /><DetailRow label="Phone" value={selected.customerPhone ?? "—"} />{selected.customerEmail ? <DetailRow label="Email" value={selected.customerEmail} /> : null}</DetailSection>
              <DetailSection title="Device"><DetailRow label="Device" value={`${selected.deviceBrand} ${selected.deviceModel}`} /><DetailRow label="Details" value={`${selected.storageGb}GB · ${selected.colour}`} /><DetailRow label={selected.identifierType === "imei" ? "IMEI" : "Serial"} value={selected.imei ?? selected.serialNumber ?? "—"} mono /></DetailSection>
              <DetailSection title="Inspection"><InspectionRows request={selected} />{selected.inspectionNotes ? <div className="mt-3 rounded-xl bg-[#F7F7F8] p-3 text-sm leading-6 text-[#424245]">{selected.inspectionNotes}</div> : null}</DetailSection>
              <DetailSection title="Request"><DetailRow label="Proposed offer" value={selected.proposedOfferPesewas === null ? "—" : formatPesewas(selected.proposedOfferPesewas)} /><DetailRow label="Requested by" value={selected.requesterName} /><DetailRow label="Submitted" value={selected.submittedAt ? dateTime(selected.submittedAt) : "—"} />{selected.supportingNotes ? <div className="mt-3 rounded-xl bg-[#F7F7F8] p-3 text-sm leading-6 text-[#424245]">{selected.supportingNotes}</div> : null}</DetailSection>

              {selected.decisionNote ? <DetailSection title="Persisted decision"><DetailRow label="Decision" value={tradeInStatusLabel(selected.status)} /><DetailRow label="Decided by" value={selected.decidedByName ?? "—"} /><DetailRow label="Decided at" value={selected.decidedAt ? dateTime(selected.decidedAt) : "—"} /><div className="mt-3 rounded-xl bg-[#F7F7F8] p-3 text-sm leading-6 text-[#424245]">{selected.decisionNote}</div></DetailSection> : null}

              {selected.status === "pending" ? <DecisionPanel request={selected} currentUserId={access.userId!} canDecide={canDecide} /> : null}
              {selected.status === "approved" ? <IntakePanel request={selected} canIntake={canIntake} /> : null}
              {selected.status === "intaken" ? <div className="mt-5 rounded-xl border border-[#CDE9D7] bg-[#F0FAF3] p-4 text-sm leading-6 text-[#267343]"><p className="font-semibold">Physical receipt recorded</p><p className="mt-1">{selected.intakeNote}</p><p className="mt-2 text-xs">{selected.intakenByName} · {selected.intakenAt ? dateTime(selected.intakenAt) : ""}</p><p className="mt-2 break-all font-mono text-[11px]">Inventory {selected.intakeStoreInventoryId}</p></div> : null}
            </CardContent>
          </Card>
        ) : null}
      </section>
    </main>
  )
}

function QueueRow({ request, selected, query, status }: { request: PersistentTradeIn; selected: boolean; query: string; status: string }) {
  const href = `/manager/approvals?${new URLSearchParams({ ...(query ? { q: query } : {}), status, request: request.id }).toString()}`
  return <Link href={href} className={`flex items-start gap-4 p-4 transition hover:bg-[#FCF9FA] sm:p-5 ${selected ? "bg-[#FAF3F6]" : "bg-white"}`}><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#F5EDF0] text-[#6E0728]"><Smartphone size={18} /></span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="font-semibold">{request.deviceBrand} {request.deviceModel}</span><StatusBadge status={request.status} /></span><span className="mt-1 block text-sm text-[#68686D]">{request.customerFullName} · {request.storageGb}GB · {formatPesewas(request.proposedOfferPesewas ?? 0)}</span><span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#86868B]"><span className="font-mono">{request.requestNumber}</span><span>{request.requesterName}</span><span>{request.submittedAt ? dateTime(request.submittedAt) : "Not submitted"}</span></span></span></Link>
}

function DecisionPanel({ request, currentUserId, canDecide }: { request: PersistentTradeIn; currentUserId: string; canDecide: boolean }) {
  if (request.requesterUserId === currentUserId) return <div className="mt-5 rounded-xl border border-[#F2E2BD] bg-[#FFF9EB] p-4 text-sm leading-6 text-[#765613]"><p className="font-semibold">Separation of duties required</p><p className="mt-1">You submitted this request. A different manager with effective trade-in approval permission must decide it.</p></div>
  if (!canDecide) return <div className="mt-5 rounded-xl border border-[#E8E8ED] bg-[#FAFAFB] p-4 text-sm leading-6 text-[#68686D]">You can review this queue but your effective permissions do not include trade-in decisions.</div>
  return <form action={decideTradeInAction} className="mt-5 border-t border-[#E8E8ED] pt-5"><input type="hidden" name="requestId" value={request.id} /><label className="space-y-2"><span className="block text-sm font-medium">Decision note <span className="text-[#A13B34]">*</span></span><textarea name="decisionNote" required minLength={10} maxLength={1000} rows={4} placeholder="Record the specific reason for this decision…" className="w-full resize-none rounded-xl border border-[#E5E5E7] px-3 py-2.5 text-sm outline-none focus:border-[#6E0728]" /></label><p className="mt-2 text-[11px] text-[#86868B]">At least 10 meaningful characters are required and permanently attributed.</p><div className="mt-4 grid grid-cols-2 gap-2"><button type="submit" name="decision" value="declined" className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#E8C9C6] text-sm font-semibold text-[#A13B34]"><X size={16} /> Decline</button><button type="submit" name="decision" value="approved" className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#267343] text-sm font-semibold text-white"><Check size={16} /> Approve</button></div></form>
}

function IntakePanel({ request, canIntake }: { request: PersistentTradeIn; canIntake: boolean }) {
  const eligible = isTradeInInventoryEligible(request)
  if (!canIntake) return <div className="mt-5 rounded-xl border border-[#E8E8ED] bg-[#FAFAFB] p-4 text-sm leading-6 text-[#68686D]">Approval is complete. Effective inventory-management permission is required for separate physical intake.</div>
  if (!eligible) return <div className="mt-5 rounded-xl border border-[#F2E2BD] bg-[#FFF9EB] p-4 text-sm leading-6 text-[#765613]"><p className="font-semibold">Not eligible for sellable inventory intake</p><p className="mt-1">Existing inventory requires a valid IMEI, excellent/good/fair condition, battery health, and passing display, battery, camera, button, connectivity, activation-lock, and applicable functional checks. Approval remains recorded without adding stock.</p></div>
  return <form action={intakeTradeInAction} className="mt-5 border-t border-[#E8E8ED] pt-5"><input type="hidden" name="requestId" value={request.id} /><div className="rounded-xl border border-[#F2E2BD] bg-[#FFF9EB] p-3 text-xs leading-5 text-[#765613]"><strong>Separate physical receipt.</strong> Submit only while holding this exact device and after re-checking its identity and condition. Success creates available stock with acquisition cost restricted by existing inventory grants.</div><label className="mt-4 block"><span className="mb-2 block text-sm font-medium">Selling price (GHS)</span><input name="sellingPriceGhs" required inputMode="decimal" placeholder="e.g. 3200.00" className="h-11 w-full rounded-xl border border-[#E5E5E7] px-3 text-sm outline-none focus:border-[#6E0728]" /></label><label className="mt-4 block"><span className="mb-2 block text-sm font-medium">Physical intake note</span><textarea name="intakeNote" required minLength={10} maxLength={1000} rows={3} placeholder="Record receipt condition and identity checks…" className="w-full resize-none rounded-xl border border-[#E5E5E7] px-3 py-2.5 text-sm outline-none focus:border-[#6E0728]" /></label><label className="mt-4 flex gap-3 rounded-xl bg-[#F7F7F8] p-3 text-sm"><input type="checkbox" name="identityConfirmed" value="yes" required className="mt-1" /><span>I physically matched the device and its IMEI to this approved request.</span></label><label className="mt-3 flex gap-3 rounded-xl bg-[#F7F7F8] p-3 text-sm"><input type="checkbox" name="conditionConfirmed" value="yes" required className="mt-1" /><span>I physically re-checked the recorded condition and sellable inspection results.</span></label><button type="submit" className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#6E0728] px-5 text-sm font-semibold text-white"><PackageCheck size={17} /> Confirm physical receipt and add inventory</button></form>
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mt-5 border-t border-[#E8E8ED] pt-5"><h3 className="text-xs font-semibold uppercase tracking-wide text-[#86868B]">{title}</h3><div className="mt-3 space-y-3">{children}</div></section>
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="flex items-start justify-between gap-4 text-sm"><span className="text-[#86868B]">{label}</span><span className={`max-w-[65%] break-words text-right font-medium ${mono ? "font-mono text-xs" : ""}`}>{value}</span></div>
}

function InspectionRows({ request }: { request: PersistentTradeIn }) {
  return <><DetailRow label="Cosmetic" value={resultLabel(request.cosmeticCondition)} /><DetailRow label="Display" value={resultLabel(request.displayCheck)} /><DetailRow label="Battery" value={`${resultLabel(request.batteryCheck)}${request.batteryHealth ? ` · ${request.batteryHealth}%` : ""}`} /><DetailRow label="Cameras" value={resultLabel(request.camerasCheck)} /><DetailRow label="Buttons / ports" value={resultLabel(request.buttonsCheck)} /><DetailRow label="Connectivity" value={resultLabel(request.connectivityCheck)} /><DetailRow label="Biometric" value={resultLabel(request.biometricCheck)} /><DetailRow label="Activation lock" value={resultLabel(request.activationLockCheck)} /><DetailRow label="Other functions" value={resultLabel(request.otherFunctionalCheck)} /></>
}

function resultLabel(value: string) {
  return value.split("_").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ")
}
