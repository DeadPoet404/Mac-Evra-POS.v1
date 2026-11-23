"use client"

import { useMemo, useState } from "react"
import {
  BadgeDollarSign,
  Check,
  ClipboardCheck,
  Package,
  RefreshCcw,
  Repeat2,
  Search,
  ShieldAlert,
  Timer,
  X,
  XCircle,
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
import {
  initialApprovals,
  money,
  type Approval,
  type ApprovalStatus,
  type ApprovalType,
} from "@/lib/manager-data"

const approvalTypes: ApprovalType[] = ["Refund", "Sale cancellation", "Discount", "Trade-in", "Inventory adjustment"]

const typeIcons = {
  Refund: RefreshCcw,
  "Sale cancellation": XCircle,
  Discount: BadgeDollarSign,
  "Trade-in": Repeat2,
  "Inventory adjustment": Package,
}

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>(initialApprovals)
  const [selectedId, setSelectedId] = useState(initialApprovals[0].id)
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<"All" | ApprovalType>("All")
  const [statusFilter, setStatusFilter] = useState<"All" | ApprovalStatus>("Pending")
  const [decisionNote, setDecisionNote] = useState("")
  const [notice, setNotice] = useState("")

  const selected = approvals.find((approval) => approval.id === selectedId) ?? null
  const pending = approvals.filter((approval) => approval.status === "Pending")
  const highPriority = pending.filter((approval) => approval.priority === "High").length
  const pendingValue = pending.reduce((total, approval) => total + (approval.amount ?? 0), 0)
  const completedToday = approvals.filter((approval) => approval.status !== "Pending").length

  const filteredApprovals = useMemo(() => {
    const query = search.toLowerCase().trim()
    return approvals.filter((approval) => {
      const matchesSearch = !query || [approval.id, approval.title, approval.requestedBy, approval.reference, approval.device].join(" ").toLowerCase().includes(query)
      const matchesType = typeFilter === "All" || approval.type === typeFilter
      const matchesStatus = statusFilter === "All" || approval.status === statusFilter
      return matchesSearch && matchesType && matchesStatus
    })
  }, [approvals, search, statusFilter, typeFilter])

  function makeDecision(status: Extract<ApprovalStatus, "Approved" | "Declined">) {
    if (!selected || selected.status !== "Pending" || decisionNote.trim().length < 5) return
    setApprovals((current) => current.map((approval) => (approval.id === selected.id ? { ...approval, status } : approval)))
    setNotice(`${selected.id} marked ${status.toLowerCase()} in preview state. Decision note: ${decisionNote.trim()}`)
    setDecisionNote("")
  }

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-7 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Manager control"
        title="Approvals"
        description="Review sensitive requests with their sale, device, employee and reason before recording a decision."
      />

      <DemoNotice>
        Approval decisions are simulated locally and do not refund money, cancel sales or alter inventory. Production actions require authenticated manager authority and an immutable audit trail.
      </DemoNotice>

      {notice ? (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-[#CDE9D7] bg-[#F0FAF3] px-4 py-3 text-sm leading-6 text-[#267343]">
          <ClipboardCheck className="mt-0.5 size-4 shrink-0" /> {notice}
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Approval metrics">
        <MetricCard label="Pending review" value={String(pending.length)} note="Manager decision required" icon={Timer} tone="amber" />
        <MetricCard label="High priority" value={String(highPriority)} note="Review these requests first" icon={ShieldAlert} tone="burgundy" />
        <MetricCard label="Value under review" value={money(pendingValue)} note="Refunds, discounts and trade-ins" icon={BadgeDollarSign} tone="blue" />
        <MetricCard label="Decided" value={String(completedToday)} note="Approved or declined in sample" icon={ClipboardCheck} tone="green" />
      </section>

      <section className={`grid gap-5 ${selected ? "xl:grid-cols-[minmax(0,1fr)_410px]" : "grid-cols-1"}`}>
        <Card className="min-w-0 rounded-2xl border-[#E8E8ED] bg-white shadow-none">
          <CardContent className="p-0">
            <div className="flex flex-col gap-4 border-b border-[#E8E8ED] p-5">
              <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
                <div>
                  <h2 className="font-semibold">Approval queue</h2>
                  <p className="mt-1 text-sm text-[#86868B]">{filteredApprovals.length} requests shown</p>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#A1A1A6]" />
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Request, employee or sale" className="w-full pl-9 lg:w-64" />
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "All" | ApprovalStatus)} className="h-8 rounded-lg border border-input bg-white px-2.5 text-sm outline-none focus:border-[#6E0728]" aria-label="Filter approval status">
                  <option value="Pending">Pending</option>
                  <option value="Approved">Approved</option>
                  <option value="Declined">Declined</option>
                  <option value="All">All statuses</option>
                </select>
                <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as "All" | ApprovalType)} className="h-8 rounded-lg border border-input bg-white px-2.5 text-sm outline-none focus:border-[#6E0728]" aria-label="Filter approval type">
                  <option value="All">All request types</option>
                  {approvalTypes.map((type) => <option key={type}>{type}</option>)}
                </select>
              </div>
            </div>

            {filteredApprovals.length ? (
              <div className="divide-y divide-[#F0F0F2]">
                {filteredApprovals.map((approval) => {
                  const Icon = typeIcons[approval.type]
                  return (
                    <button
                      key={approval.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(approval.id)
                        setDecisionNote("")
                        setNotice("")
                      }}
                      className={`flex w-full items-start gap-4 p-4 text-left transition hover:bg-[#FCF9FA] sm:p-5 ${selectedId === approval.id ? "bg-[#FAF3F6]" : "bg-white"}`}
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#F5EDF0] text-[#6E0728]"><Icon size={18} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">{approval.title}</span>
                          {approval.priority === "High" ? <DataBadge tone="red">High priority</DataBadge> : null}
                        </span>
                        <span className="mt-1 block text-sm leading-6 text-[#68686D]">{approval.description}</span>
                        <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#86868B]">
                          <span>{approval.id}</span>
                          <span>{approval.requestedBy}</span>
                          <span>{approval.requestedAt}</span>
                        </span>
                      </span>
                      <span className="shrink-0"><ApprovalStatusBadge status={approval.status} /></span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <EmptyState title="No approval requests" description="No requests match the selected type, status and search filters." />
            )}
          </CardContent>
        </Card>

        {selected ? (
          <Card className="h-fit rounded-2xl border-[#E8E8ED] bg-white shadow-none">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <DataBadge tone="burgundy">{selected.type}</DataBadge>
                    <ApprovalStatusBadge status={selected.status} />
                  </div>
                  <h2 className="mt-3 text-lg font-semibold">{selected.title}</h2>
                  <p className="mt-1 text-sm leading-6 text-[#68686D]">{selected.description}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setSelectedId("")} aria-label="Close request"><X size={17} /></Button>
              </div>

              <Separator className="my-5" />
              <div className="space-y-4">
                <DetailRow label="Request ID" value={selected.id} mono />
                <DetailRow label="Requested by" value={selected.requestedBy} />
                <DetailRow label="Requested at" value={selected.requestedAt} />
                <DetailRow label="Reference" value={selected.reference} mono />
                {selected.amount !== undefined ? <DetailRow label="Amount" value={money(selected.amount)} /> : null}
                {selected.device ? <DetailRow label="Device" value={selected.device} /> : null}
                {selected.imei ? <DetailRow label="IMEI" value={selected.imei} mono /> : null}
              </div>

              <div className="mt-5 rounded-xl bg-[#F7F7F8] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#86868B]">Employee reason</p>
                <p className="mt-2 text-sm leading-6 text-[#424245]">{selected.reason}</p>
              </div>

              {selected.status === "Pending" ? (
                <div className="mt-5">
                  <label className="space-y-2">
                    <span className="block text-sm font-medium">Decision note <span className="text-[#A13B34]">*</span></span>
                    <textarea
                      value={decisionNote}
                      onChange={(event) => setDecisionNote(event.target.value)}
                      placeholder="Record why this request is approved or declined…"
                      rows={4}
                      className="w-full resize-none rounded-xl border border-input bg-white px-3 py-2.5 text-sm outline-none focus:border-[#6E0728] focus:ring-2 focus:ring-[#6E0728]/15"
                    />
                  </label>
                  <p className="mt-2 text-[11px] text-[#A1A1A6]">At least 5 characters are required for the audit note.</p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <Button variant="outline" disabled={decisionNote.trim().length < 5} onClick={() => makeDecision("Declined")} className="border-[#E8C9C6] text-[#A13B34] hover:bg-[#FFF3F2]"><X size={16} /> Decline</Button>
                    <Button disabled={decisionNote.trim().length < 5} onClick={() => makeDecision("Approved")} className="bg-[#267343] text-white hover:bg-[#1F6138]"><Check size={16} /> Approve</Button>
                  </div>
                </div>
              ) : (
                <div className="mt-5 rounded-xl border border-[#E8E8ED] bg-[#FAFAFB] p-4">
                  <p className="text-sm font-medium">Decision recorded</p>
                  <p className="mt-1 text-xs leading-5 text-[#86868B]">This sample request is already {selected.status.toLowerCase()} and cannot be changed from this preview panel.</p>
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}
      </section>
    </main>
  )
}

function ApprovalStatusBadge({ status }: { status: ApprovalStatus }) {
  return <DataBadge tone={status === "Approved" ? "green" : status === "Declined" ? "red" : "amber"}>{status}</DataBadge>
}
