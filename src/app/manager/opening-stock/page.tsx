import {
  Archive,
  Boxes,
  Calculator,
  CircleAlert,
  ClipboardCheck,
  FileText,
  History,
  Layers3,
  LockKeyhole,
  PackageCheck,
  ShieldCheck,
  Smartphone,
} from "lucide-react"

import { DataBadge, EmptyState, MetricCard, PageHeader } from "@/components/manager/manager-ui"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissions } from "@/lib/auth/server"
import {
  canViewPurchaseCost,
  openingStockConditions,
  openingStockInspectionChecks,
  summarizeOpeningStockInvoiceReconciliation,
  summarizeOpeningStockQuantities,
} from "@/lib/opening-stock"
import type { OpeningStockInvoice } from "@/lib/opening-stock-server"
import { loadOpeningStockDashboard } from "@/lib/opening-stock-server"
import { formatPesewas, pesewasToGhsInput } from "@/lib/sales"
import { BatchReceivingForm } from "./batch-receiving-form"
import {
  activateOpeningStockUnitAction,
  addSupplierInvoiceLineAction,
  confirmSupplierInvoiceAction,
  correctSupplierInvoiceAction,
  correctSupplierInvoiceLineAction,
  createSupplierInvoiceAction,
  receiveOpeningStockBatchAction,
  receiveOpeningStockDeviceAction,
  registerOpeningStockModelAction,
  repriceOpeningStockUnitAction,
} from "./actions"

const inputClass = "h-10 w-full rounded-lg border border-input bg-white px-3 text-sm outline-none focus:border-[#6E0728]"
const labelClass = "space-y-1.5 text-xs font-medium text-[#68686D]"
const buttonClass = "h-10 rounded-full bg-[#6E0728] px-5 text-sm font-semibold text-white hover:bg-[#57051F]"
const today = new Date().toISOString().slice(0, 10)

const notices = new Map([
  ["model-registered", "Model registration saved."],
  ["invoice-created", "Supplier invoice created."],
  ["invoice-line-added", "Invoice line added."],
  ["invoice-confirmed", "Declared invoice total reconciled and confirmed."],
  ["invoice-corrected", "Invoice correction recorded and audited."],
  ["invoice-line-corrected", "Invoice-line correction recorded and audited."],
  ["device-received", "Physical device received and staged."],
  ["batch-received", "Device batch received and staged atomically."],
  ["unit-activated", "Device activated into sellable inventory."],
  ["unit-repriced", "Approved price changed and audited."],
])

const errors = new Map([
  ["invalid-input", "Check every required field. IMEIs must be real Luhn-valid identifiers and every device must have its own complete inspection."],
  ["duplicate-or-race", "A duplicate IMEI, duplicate state change, or concurrent retry was rejected. No partial records were saved."],
  ["access-denied", "Your active store permissions do not allow this operation."],
  ["state-conflict", "The record changed or is not in the required state. Reload the page and verify quantities, totals, price, and status."],
  ["operation-failed", "The operation could not be completed. No partial workflow records were saved."],
])

function FormSection({
  title,
  description,
  children,
  open = false,
}: {
  title: string
  description: string
  children: React.ReactNode
  open?: boolean
}) {
  return (
    <details open={open} className="rounded-2xl border border-[#E8E8ED] bg-white">
      <summary className="cursor-pointer list-none p-5 [&::-webkit-details-marker]:hidden">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-xs leading-5 text-[#86868B]">{description}</p>
      </summary>
      <div className="border-t border-[#F0F0F2] p-5">{children}</div>
    </details>
  )
}

function InspectionChecks() {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {openingStockInspectionChecks.map((check) => (
        <label key={check.name} className="flex items-start gap-2 rounded-xl bg-[#FAFAFB] p-3 text-xs leading-5 text-[#424245]">
          <input type="checkbox" name={check.name} required className="mt-0.5 size-4 accent-[#6E0728]" />
          <span>{check.label}</span>
        </label>
      ))}
    </div>
  )
}

function DeviceFields() {
  return (
    <>
      <label className={labelClass}>
        <span>IMEI · 15 digits</span>
        <input name="imei" required inputMode="numeric" maxLength={20} placeholder="357000000000017" className={inputClass} />
      </label>
      <label className={labelClass}>
        <span>Colour</span>
        <input name="colour" required maxLength={60} placeholder="Natural Titanium" className={inputClass} />
      </label>
      <label className={labelClass}>
        <span>Condition</span>
        <select name="condition" defaultValue="excellent" className={inputClass}>
          {openingStockConditions.map((condition) => <option key={condition} value={condition}>{condition[0].toUpperCase() + condition.slice(1)}</option>)}
        </select>
      </label>
      <label className={labelClass}>
        <span>Battery health · %</span>
        <input name="batteryHealth" required type="number" min={1} max={100} defaultValue={100} className={inputClass} />
      </label>
      <div className="sm:col-span-2">
        <p className="mb-2 text-xs font-semibold text-[#424245]">Inspection attestation</p>
        <InspectionChecks />
      </div>
      <label className={`${labelClass} sm:col-span-2`}>
        <span>Inspection notes · optional</span>
        <input name="inspectionNotes" maxLength={500} className={inputClass} />
      </label>
    </>
  )
}

function CostValue({ visible, value }: { visible: boolean; value: number | null }) {
  if (!visible || value === null) return <span className="text-xs text-[#86868B]">Restricted</span>
  return <span className="font-medium">{formatPesewas(value)}</span>
}

function JsonState({ label, value }: { label: string; value: Record<string, unknown> }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#86868B]">{label}</p>
      <pre className="mt-1 overflow-x-auto rounded-xl bg-[#F7F7F8] p-3 text-[11px] leading-5 text-[#424245]">{JSON.stringify(value, null, 2)}</pre>
    </div>
  )
}

function invoiceLabel(invoice: OpeningStockInvoice | undefined, fallbackId?: string) {
  if (!invoice) return fallbackId ? `Invoice ${fallbackId.slice(0, 8)}` : "No reference"
  return invoice.supplierInvoiceNumber
    ? `${invoice.supplierInvoiceNumber} · ${invoice.supplierName}`
    : `${invoice.supplierName} · ${invoice.invoiceDate} · no reference`
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-GH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Accra",
  }).format(new Date(value))
}

export default async function OpeningStockPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>
}) {
  const { membership } = await requirePermissions(["access_manager_workspace", "manage_inventory"], {
    nextPath: "/manager/opening-stock",
  })
  const params = await searchParams
  const dashboard = await loadOpeningStockDashboard(membership.storeId)
  const summary = summarizeOpeningStockQuantities(dashboard.lines)
  const costVisible = canViewPurchaseCost(membership.permissions)
  const stagedUnits = dashboard.units.filter((unit) => unit.status === "staged")
  const activatedUnits = dashboard.units.filter((unit) => unit.status === "activated")
  const firstInvoice = dashboard.invoices[0]
  const firstLine = dashboard.lines[0]
  const notice = params.notice ? notices.get(params.notice) : undefined
  const error = params.error ? errors.get(params.error) ?? errors.get("operation-failed") : undefined
  const lineOptions = dashboard.lines.map((line) => {
    const invoice = dashboard.invoices.find((item) => item.id === line.invoiceId)
    return {
      id: line.id,
      label: `${invoiceLabel(invoice, line.invoiceId)} · line ${line.lineNumber} · ${line.modelName} · ${line.quantityOutstanding} outstanding`,
    }
  })

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-7 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Persistent supplier intake"
        title="Opening stock"
        description={`Register models, reconcile supplier invoices, inspect physical devices, and approve pricing for ${membership.storeName}.`}
        action={<DataBadge tone="green">Live database workflow</DataBadge>}
      />

      {notice ? <p role="status" className="rounded-xl border border-[#CDE9D7] bg-[#F0FAF3] px-4 py-3 text-sm text-[#267343]">{notice}</p> : null}
      {error ? <p role="alert" className="rounded-xl border border-[#E8C9D2] bg-[#FCF4F6] px-4 py-3 text-sm text-[#6E0728]">{error}</p> : null}

      <div className="flex gap-3 rounded-2xl border border-[#F2E2BD] bg-[#FFF9EB] p-4 text-sm leading-6 text-[#765613]">
        <Layers3 className="mt-0.5 size-5 shrink-0" />
        <p>Received devices remain staged and non-sellable. They enter the existing IMEI-level inventory only after a manager with pricing approval confirms a positive sale price and the complete physical inspection.</p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5" aria-label="Opening stock quantities">
        <MetricCard label="Invoiced" value={String(summary.quantityInvoiced)} note="Supplier invoice-line quantities" icon={Boxes} />
        <MetricCard label="Received" value={String(summary.quantityReceived)} note="Physically received devices" icon={PackageCheck} tone="blue" />
        <MetricCard label="Staged" value={String(summary.quantityStaged)} note="Not sellable until pricing approval" icon={Layers3} tone="amber" />
        <MetricCard label="Activated" value={String(summary.quantityActivated)} note="Added to available inventory" icon={ShieldCheck} tone="green" />
        <MetricCard label="Outstanding" value={String(summary.quantityOutstanding)} note="Invoiced minus physically received" icon={CircleAlert} tone={summary.quantityOutstanding ? "amber" : "green"} />
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <Card className="rounded-2xl border-[#E8E8ED] bg-white shadow-none">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center gap-3"><FileText size={18} className="text-[#6E0728]" /><h2 className="font-semibold">Invoice setup</h2></div>
            <FormSection title="1 · Register a model" description="Register or refresh a store-scoped catalogue entry before adding invoice lines." open>
              <form action={registerOpeningStockModelAction} className="grid gap-3 sm:grid-cols-3">
                <label className={`${labelClass} sm:col-span-2`}><span>Model</span><input name="modelName" required maxLength={160} placeholder="iPhone 16 Pro" className={inputClass} /></label>
                <label className={labelClass}><span>Storage · GB</span><input name="storageGb" required type="number" min={1} max={4096} defaultValue={256} className={inputClass} /></label>
                <label className={`${labelClass} sm:col-span-2`}><span>Supplier SKU · optional</span><input name="supplierSku" maxLength={80} placeholder="APL-16P-256-NT" className={inputClass} /></label>
                <Button type="submit" className={buttonClass}>Register model</Button>
              </form>
            </FormSection>
            <FormSection title="2 · Create a supplier invoice" description="The invoice reference is optional; the declared total is stored in integer pesewas.">
              <form action={createSupplierInvoiceAction} className="grid gap-3 sm:grid-cols-2">
                <label className={labelClass}><span>Supplier</span><input name="supplierName" required maxLength={160} placeholder="Approved supplier" className={inputClass} /></label>
                <label className={labelClass}><span>Invoice number / reference · optional</span><input name="invoiceNumber" maxLength={80} placeholder="Leave blank if not supplied" className={inputClass} /></label>
                <label className={labelClass}><span>Invoice date</span><input name="invoiceDate" required type="date" max={today} defaultValue={today} className={inputClass} /></label>
                <label className={labelClass}><span>Declared invoice total · GH₵</span><input name="declaredTotalGhs" required inputMode="decimal" placeholder="0.00" className={inputClass} /></label>
                <label className={`${labelClass} sm:col-span-2`}><span>Notes · optional</span><input name="notes" maxLength={1000} className={inputClass} /></label>
                <Button type="submit" className={`${buttonClass} sm:col-span-2`}>Create invoice</Button>
              </form>
            </FormSection>
            <FormSection title="3 · Add an invoice line" description="Purchase cost is stored in integer pesewas; each line total is calculated from quantity × unit cost.">
              <form action={addSupplierInvoiceLineAction} className="grid gap-3 sm:grid-cols-2">
                <label className={labelClass}><span>Invoice</span><select name="invoiceId" required disabled={!dashboard.invoices.length} className={inputClass}>{dashboard.invoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoiceLabel(invoice)}</option>)}</select></label>
                <label className={labelClass}><span>Registered model</span><select name="modelCatalogueId" required disabled={!dashboard.models.length} className={inputClass}>{dashboard.models.map((model) => <option key={model.id} value={model.id}>{model.modelName} · {model.storageGb}GB</option>)}</select></label>
                <label className={labelClass}><span>Quantity invoiced</span><input name="quantityInvoiced" required type="number" min={1} max={1000} defaultValue={1} className={inputClass} /></label>
                <label className={labelClass}><span>Unit purchase cost · GH₵</span><input name="unitCostGhs" required inputMode="decimal" placeholder="0.00" className={inputClass} /></label>
                <label className={`${labelClass} sm:col-span-2`}><span>Line notes · optional</span><input name="notes" maxLength={1000} className={inputClass} /></label>
                <Button type="submit" disabled={!dashboard.invoices.length || !dashboard.models.length} className={`${buttonClass} sm:col-span-2`}>Add invoice line</Button>
              </form>
            </FormSection>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-[#E8E8ED] bg-white shadow-none">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center gap-3"><History size={18} className="text-[#6E0728]" /><h2 className="font-semibold">Audited corrections</h2></div>
            <p className="text-xs leading-5 text-[#86868B]">Every correction records before/after state, a meaningful reason, and the active manager membership. A line cost cannot be changed after any physical device is received.</p>
            <FormSection title="Correct invoice identity" description="Re-enter the complete corrected invoice values and explain the supplier-document discrepancy.">
              <form action={correctSupplierInvoiceAction} className="grid gap-3 sm:grid-cols-2">
                <label className={`${labelClass} sm:col-span-2`}><span>Invoice</span><select name="invoiceId" required disabled={!dashboard.invoices.length} className={inputClass}>{dashboard.invoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoiceLabel(invoice)}</option>)}</select></label>
                <label className={labelClass}><span>Corrected supplier</span><input name="supplierName" required defaultValue={firstInvoice?.supplierName ?? ""} maxLength={160} className={inputClass} /></label>
                <label className={labelClass}><span>Corrected number / reference · optional</span><input name="invoiceNumber" defaultValue={firstInvoice?.supplierInvoiceNumber ?? ""} maxLength={80} className={inputClass} /></label>
                <label className={labelClass}><span>Corrected date</span><input name="invoiceDate" required type="date" max={today} defaultValue={firstInvoice?.invoiceDate ?? today} className={inputClass} /></label>
                <label className={labelClass}><span>Corrected declared total · GH₵</span><input name="declaredTotalGhs" required inputMode="decimal" defaultValue={firstInvoice?.declaredTotalPesewas ? pesewasToGhsInput(firstInvoice.declaredTotalPesewas) : ""} className={inputClass} /></label>
                <label className={`${labelClass} sm:col-span-2`}><span>Corrected notes</span><input name="notes" defaultValue={firstInvoice?.notes ?? ""} maxLength={1000} className={inputClass} /></label>
                <label className={`${labelClass} sm:col-span-2`}><span>Reason</span><input name="reason" required minLength={5} maxLength={500} placeholder="Supplier reissued invoice with corrected date" className={inputClass} /></label>
                <Button type="submit" disabled={!dashboard.invoices.length} className={`${buttonClass} sm:col-span-2`}>Record invoice correction</Button>
              </form>
            </FormSection>
            <FormSection title="Correct invoice-line quantity or cost" description="Quantity cannot drop below received units; cost changes are rejected after receipt preserves immutable stock cost.">
              <form action={correctSupplierInvoiceLineAction} className="grid gap-3 sm:grid-cols-2">
                <label className={`${labelClass} sm:col-span-2`}><span>Invoice line</span><select name="lineId" required disabled={!dashboard.lines.length} className={inputClass}>{dashboard.lines.map((line) => <option key={line.id} value={line.id}>{lineOptions.find((option) => option.id === line.id)?.label}</option>)}</select></label>
                <label className={labelClass}><span>Corrected quantity</span><input name="quantityInvoiced" required type="number" min={1} max={1000} defaultValue={firstLine?.quantityInvoiced ?? 1} className={inputClass} /></label>
                <label className={labelClass}><span>Corrected unit cost · GH₵</span><input name="unitCostGhs" required inputMode="decimal" defaultValue={firstLine?.unitCostPesewas ? pesewasToGhsInput(firstLine.unitCostPesewas) : ""} className={inputClass} /></label>
                <label className={`${labelClass} sm:col-span-2`}><span>Reason</span><input name="reason" required minLength={5} maxLength={500} placeholder="Supplier amended quantity before delivery" className={inputClass} /></label>
                <Button type="submit" disabled={!dashboard.lines.length} className={`${buttonClass} sm:col-span-2`}>Record line correction</Button>
              </form>
            </FormSection>
          </CardContent>
        </Card>
      </section>

      <Card className="rounded-2xl border-[#E8E8ED] bg-white shadow-none">
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center gap-3"><Calculator size={18} className="text-[#6E0728]" /><h2 className="font-semibold">Declared invoice total reconciliation</h2></div>
          <p className="text-xs leading-5 text-[#86868B]">Line totals are calculated from persisted quantity × unit cost. Compare every line total and the calculated invoice total with the declared total before confirming; the confirmation RPC recomputes and locks the invoice.</p>
          {dashboard.reconciliations.length ? (
            <div className="space-y-4">
              {dashboard.reconciliations.map((reconciliation) => {
                const invoice = dashboard.invoices.find((item) => item.id === reconciliation.invoiceId)
                const invoiceLines = dashboard.lines.filter((line) => line.invoiceId === reconciliation.invoiceId)
                const declaredTotal = reconciliation.declaredTotalPesewas
                let verification: ReturnType<typeof summarizeOpeningStockInvoiceReconciliation> | null = null
                let verificationError = ""
                if (declaredTotal !== null) {
                  try {
                    verification = summarizeOpeningStockInvoiceReconciliation(
                      invoiceLines.map((line) => ({
                        quantityInvoiced: line.quantityInvoiced,
                        unitCostPesewas: line.unitCostPesewas,
                        lineTotalPesewas: line.lineTotalPesewas,
                        costVisible: line.costVisible,
                      })),
                      declaredTotal
                    )
                  } catch (caught) {
                    verificationError = caught instanceof Error ? caught.message : "Invoice totals could not be verified."
                  }
                }
                const canConfirm = Boolean(
                  reconciliation.costVisible &&
                  reconciliation.reconciled &&
                  verification?.reconciled &&
                  verification.lineCount === reconciliation.lineCount &&
                  verification.quantityInvoiced === reconciliation.quantityInvoiced &&
                  declaredTotal !== null &&
                  reconciliation.calculatedTotalPesewas !== null &&
                  !reconciliation.confirmedAt
                )

                return (
                  <div key={reconciliation.invoiceId} className="rounded-2xl border border-[#ECECEF] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold">{invoiceLabel(invoice, reconciliation.invoiceId)}</h3>
                        <p className="mt-1 text-xs text-[#86868B]">{reconciliation.lineCount} line{reconciliation.lineCount === 1 ? "" : "s"} · {reconciliation.quantityInvoiced} invoiced unit{reconciliation.quantityInvoiced === 1 ? "" : "s"}</p>
                      </div>
                      <DataBadge tone={reconciliation.confirmedAt ? "green" : reconciliation.reconciled ? "blue" : "amber"}>
                        {reconciliation.confirmedAt ? "Totals confirmed" : reconciliation.reconciled ? "Reconciled" : "Not reconciled"}
                      </DataBadge>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <Total label="Declared total" visible={reconciliation.costVisible} value={reconciliation.declaredTotalPesewas} />
                      <Total label="Calculated from lines" visible={reconciliation.costVisible} value={reconciliation.calculatedTotalPesewas} />
                      <Total label="Difference" visible={reconciliation.costVisible} value={reconciliation.differencePesewas} />
                      <div className="rounded-xl bg-[#F7F7F8] p-3">
                        <p className="text-xs text-[#86868B]">Confirmation</p>
                        <p className="mt-1 text-sm font-medium">{reconciliation.confirmedAt ? dateTime(reconciliation.confirmedAt) : "Not yet confirmed"}</p>
                        {reconciliation.confirmedByDisplayName ? <p className="mt-1 text-xs text-[#86868B]">By {reconciliation.confirmedByDisplayName}</p> : null}
                      </div>
                    </div>
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full min-w-[720px] text-left text-sm">
                        <thead className="bg-[#FAFAFB] text-[11px] font-semibold uppercase tracking-wide text-[#86868B]">
                          <tr><th className="px-4 py-3">Line</th><th className="px-4 py-3">Model</th><th className="px-4 py-3">Quantity</th><th className="px-4 py-3">Unit cost</th><th className="px-4 py-3">Line total</th></tr>
                        </thead>
                        <tbody>
                          {invoiceLines.map((line) => (
                            <tr key={line.id} className="border-t border-[#F0F0F2]">
                              <td className="px-4 py-3">{line.lineNumber}</td>
                              <td className="px-4 py-3">{line.modelName} · {line.storageGb}GB</td>
                              <td className="px-4 py-3">{line.quantityInvoiced}</td>
                              <td className="px-4 py-3"><CostValue visible={line.costVisible} value={line.unitCostPesewas} /></td>
                              <td className="px-4 py-3"><CostValue visible={line.costVisible} value={line.lineTotalPesewas} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!invoiceLines.length ? <p className="mt-3 text-xs text-[#86868B]">No invoice lines yet. Add lines and verify their totals before confirmation.</p> : null}
                    </div>
                    {verificationError ? <p role="alert" className="mt-3 rounded-lg bg-[#FFF3F2] p-3 text-xs text-[#A13B34]">{verificationError}</p> : null}
                    {!reconciliation.confirmedAt ? (
                      <form action={confirmSupplierInvoiceAction} className="mt-4 grid gap-3 rounded-xl bg-[#FAFAFB] p-4 sm:grid-cols-[1fr_auto] sm:items-end">
                        <input type="hidden" name="invoiceId" value={reconciliation.invoiceId} />
                        <input type="hidden" name="expectedDeclaredTotalPesewas" value={declaredTotal ?? ""} />
                        <input type="hidden" name="expectedLineCount" value={reconciliation.lineCount} />
                        <input type="hidden" name="expectedQuantityInvoiced" value={reconciliation.quantityInvoiced} />
                        <input type="hidden" name="expectedCalculatedTotalPesewas" value={reconciliation.calculatedTotalPesewas ?? ""} />
                        <label className="flex items-center gap-2 text-xs leading-5 text-[#424245]">
                          <input type="checkbox" name="totalsConfirmed" required className="size-4 accent-[#6E0728]" /> I verified every line total and the declared invoice total.
                        </label>
                        <Button type="submit" disabled={!canConfirm} className={`${buttonClass} disabled:opacity-50`}>Confirm invoice totals</Button>
                      </form>
                    ) : (
                      <p className="mt-4 rounded-xl border border-[#CDE9D7] bg-[#F0FAF3] p-3 text-xs leading-5 text-[#267343]">This invoice has a recorded totals confirmation. Any audited line or invoice correction clears confirmation and requires a fresh review.</p>
                    )}
                  </div>
                )
              })}
            </div>
          ) : <EmptyState title="No invoices" description="Create a supplier invoice and add its lines to begin declared-total reconciliation." />}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-[#E8E8ED] bg-white shadow-none">
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center gap-3"><ClipboardCheck size={18} className="text-[#6E0728]" /><h2 className="font-semibold">Physical receiving</h2></div>
          <div className="grid gap-4 lg:grid-cols-2">
            <form action={receiveOpeningStockDeviceAction} className="space-y-3 rounded-2xl bg-[#FAFAFB] p-4">
              <h3 className="text-sm font-semibold">Receive one device</h3>
              <label className={labelClass}><span>Invoice line</span><select name="lineId" required disabled={!lineOptions.length} className={inputClass}>{lineOptions.map((line) => <option key={line.id} value={line.id}>{line.label}</option>)}</select></label>
              <div className="grid gap-3 sm:grid-cols-2"><DeviceFields /></div>
              <Button type="submit" disabled={!lineOptions.length} className={buttonClass}>Receive and stage</Button>
            </form>
            <BatchReceivingForm action={receiveOpeningStockBatchAction} lines={lineOptions} />
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="min-w-0 rounded-2xl border-[#E8E8ED] bg-white shadow-none">
          <CardContent className="p-0">
            <div className="border-b border-[#E8E8ED] p-5">
              <h2 className="font-semibold">Invoice-line reconciliation</h2>
              <p className="mt-1 text-xs text-[#86868B]">Invoiced, received, staged, activated, and outstanding are independent persisted quantities; line totals are permission-masked.</p>
            </div>
            {dashboard.lines.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1050px] text-left text-sm">
                  <thead className="bg-[#FAFAFB] text-[11px] font-semibold uppercase tracking-wide text-[#86868B]">
                    <tr><th className="px-5 py-3">Invoice / model</th><th className="px-3 py-3">Purchase cost</th><th className="px-3 py-3">Line total</th><th className="px-3 py-3">Invoiced</th><th className="px-3 py-3">Received</th><th className="px-3 py-3">Staged</th><th className="px-3 py-3">Activated</th><th className="px-5 py-3">Outstanding</th></tr>
                  </thead>
                  <tbody>
                    {dashboard.lines.map((line) => {
                      const invoice = dashboard.invoices.find((item) => item.id === line.invoiceId)
                      return (
                        <tr key={line.id} className="border-t border-[#F0F0F2]">
                          <td className="px-5 py-4"><p className="font-medium">{invoiceLabel(invoice, line.invoiceId)}</p><p className="mt-1 text-xs text-[#86868B]">Line {line.lineNumber} · {line.modelName} · {line.storageGb}GB</p></td>
                          <td className="px-3 py-4"><CostValue visible={line.costVisible} value={line.unitCostPesewas} /></td>
                          <td className="px-3 py-4"><CostValue visible={line.costVisible} value={line.lineTotalPesewas} /></td>
                          <td className="px-3 py-4 font-semibold">{line.quantityInvoiced}</td>
                          <td className="px-3 py-4">{line.quantityReceived}</td>
                          <td className="px-3 py-4">{line.quantityStaged}</td>
                          <td className="px-3 py-4">{line.quantityActivated}</td>
                          <td className="px-5 py-4"><DataBadge tone={line.quantityOutstanding ? "amber" : "green"}>{line.quantityOutstanding}</DataBadge></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : <EmptyState title="No invoice lines" description="Register a model, create an invoice, and add a line to begin reconciliation." />}
          </CardContent>
        </Card>

        <Card className="h-fit rounded-2xl border-[#E8E8ED] bg-white shadow-none">
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center gap-3"><LockKeyhole size={18} className="text-[#6E0728]" /><h2 className="font-semibold">Cost visibility</h2></div>
            <p className="text-xs leading-5 text-[#86868B]">
              {costVisible
                ? "Purchase cost, line totals, and invoice totals are visible because this active membership has manager workspace and manage-inventory permission."
                : "Purchase cost and calculated totals are restricted for this membership. The database returns null through permission-checked views."}
            </p>
            <div className="rounded-xl bg-[#FAFAFB] p-4 text-xs leading-6 text-[#424245]">
              <p><span className="font-semibold">Models:</span> {dashboard.models.length}</p>
              <p><span className="font-semibold">Invoices:</span> {dashboard.invoices.length}</p>
              <p><span className="font-semibold">Staged units:</span> {stagedUnits.length}</p>
              <p><span className="font-semibold">Activated units:</span> {activatedUnits.length}</p>
              <p><span className="font-semibold">Corrections:</span> {dashboard.corrections.length}</p>
              <p><span className="font-semibold">Price changes:</span> {dashboard.priceChanges.length}</p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-5">
        <div><h2 className="text-lg font-semibold">Staged devices · {stagedUnits.length}</h2><p className="mt-1 text-xs text-[#86868B]">Activation requires the separate pricing-approval permission and an explicit confirmation.</p></div>
        {stagedUnits.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {stagedUnits.map((unit) => (
              <Card key={unit.id} className="rounded-2xl border-[#F2E2BD] bg-white shadow-none">
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-sm font-semibold">IMEI {unit.imei}</p><p className="mt-1 text-xs text-[#86868B]">{unit.modelName} · {unit.storageGb}GB · {unit.colour} · {unit.batteryHealth}%</p></div><DataBadge tone="amber">Staged</DataBadge></div>
                  <div className="flex items-center gap-2 text-xs text-[#68686D]"><Smartphone size={14} /> Complete inspection recorded by {unit.receivedByDisplayName}</div>
                  <div className="grid gap-2 text-xs"><p>Purchase cost: <CostValue visible={unit.costVisible} value={unit.unitCostPesewas} /></p><p>Current sale price: Not approved</p></div>
                  <form action={activateOpeningStockUnitAction} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                    <input type="hidden" name="unitId" value={unit.id} />
                    <label className={labelClass}><span>Approved sale price · GH₵</span><input name="approvedPriceGhs" required inputMode="decimal" placeholder="0.00" className={inputClass} /></label>
                    <label className="flex items-center gap-2 pb-3 text-xs text-[#424245]"><input type="checkbox" name="priceConfirmed" required className="size-4 accent-[#6E0728]" /> Pricing approved</label>
                    <Button type="submit" className={`${buttonClass} sm:col-span-2`}>Activate to sellable inventory</Button>
                  </form>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : <Card className="shadow-none"><CardContent><EmptyState title="No staged devices" description="Receive an inspected physical device to create a non-sellable staged unit." /></CardContent></Card>}
      </section>

      <section className="space-y-5">
        <div><h2 className="text-lg font-semibold">Activated devices · {activatedUnits.length}</h2><p className="mt-1 text-xs text-[#86868B]">Repricing uses the displayed current price as an optimistic lock and writes an immutable price-change record.</p></div>
        {activatedUnits.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {activatedUnits.map((unit) => (
              <Card key={unit.id} className="rounded-2xl border-[#CDE9D7] bg-white shadow-none">
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-sm font-semibold">IMEI {unit.imei}</p><p className="mt-1 text-xs text-[#86868B]">{unit.modelName} · {unit.storageGb}GB · {unit.colour}</p></div><DataBadge tone="green">Activated</DataBadge></div>
                  <div className="grid gap-1 text-xs text-[#424245]"><p>Purchase cost: <CostValue visible={unit.costVisible} value={unit.unitCostPesewas} /></p><p>Approved sale price: {unit.approvedPricePesewas === null ? "Unavailable" : formatPesewas(unit.approvedPricePesewas)}</p><p>Activated by: {unit.activatedByDisplayName ?? "Unknown"}</p></div>
                  <form action={repriceOpeningStockUnitAction} className="grid gap-2 sm:grid-cols-2">
                    <input type="hidden" name="unitId" value={unit.id} />
                    <input type="hidden" name="expectedPriceGhs" value={unit.approvedPricePesewas === null ? "" : pesewasToGhsInput(unit.approvedPricePesewas)} />
                    <label className={labelClass}><span>New approved price · GH₵</span><input name="newPriceGhs" required inputMode="decimal" placeholder="0.00" className={inputClass} /></label>
                    <label className={labelClass}><span>Reason</span><input name="reason" required minLength={5} maxLength={500} placeholder="Approved supplier market adjustment" className={inputClass} /></label>
                    <label className="flex items-center gap-2 text-xs text-[#424245]"><input type="checkbox" name="priceConfirmed" required className="size-4 accent-[#6E0728]" /> Replacement price approved</label>
                    <Button type="submit" className={`${buttonClass} sm:col-span-2`}>Record repricing</Button>
                  </form>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : <Card className="shadow-none"><CardContent><EmptyState title="No activated devices" description="Activate a staged unit after price approval to see protected repricing controls." /></CardContent></Card>}
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <Card className="rounded-2xl border-[#E8E8ED] bg-white shadow-none">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center gap-3"><Archive size={18} className="text-[#6E0728]" /><h2 className="font-semibold">Correction history</h2></div>
            {dashboard.corrections.length ? dashboard.corrections.map((correction) => (
              <div key={correction.id} className="space-y-2 rounded-xl bg-[#FAFAFB] p-4">
                <div className="flex items-center justify-between gap-3"><DataBadge tone="burgundy">{correction.entityType.replace("_", " ")}</DataBadge><span className="text-xs text-[#86868B]">{dateTime(correction.createdAt)}</span></div>
                <p className="text-xs text-[#424245]"><span className="font-semibold">{correction.actorDisplayName}:</span> {correction.reason}</p>
                {costVisible ? <div className="grid gap-2 sm:grid-cols-2"><JsonState label="Before" value={correction.beforeData} /><JsonState label="After" value={correction.afterData} /></div> : null}
              </div>
            )) : <p className="text-sm text-[#86868B]">No audited corrections yet.</p>}
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-[#E8E8ED] bg-white shadow-none">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center gap-3"><ShieldCheck size={18} className="text-[#6E0728]" /><h2 className="font-semibold">Approved price changes</h2></div>
            {dashboard.priceChanges.length ? dashboard.priceChanges.map((change) => (
              <div key={change.id} className="rounded-xl bg-[#FAFAFB] p-4">
                <p className="text-sm font-medium">{formatPesewas(change.oldPricePesewas)} → {formatPesewas(change.newPricePesewas)}</p>
                <p className="mt-1 text-xs text-[#86868B]">{change.actorDisplayName} · {dateTime(change.createdAt)}</p>
                <p className="mt-2 text-xs text-[#424245]">{change.reason}</p>
              </div>
            )) : <p className="text-sm text-[#86868B]">No approved repricing records yet.</p>}
          </CardContent>
        </Card>
      </section>
    </main>
  )
}

function Total({ label, visible, value }: { label: string; visible: boolean; value: number | null }) {
  return (
    <div className="rounded-xl bg-[#F7F7F8] p-3">
      <p className="text-xs text-[#86868B]">{label}</p>
      <p className="mt-1 text-sm"><CostValue visible={visible} value={value} /></p>
    </div>
  )
}
