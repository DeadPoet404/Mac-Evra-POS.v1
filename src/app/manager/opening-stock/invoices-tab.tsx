"use client"

import { useMemo, useState } from "react"
import { Check, CircleAlert, FileText, LoaderCircle, Plus, Search, X } from "lucide-react"

import type {
  OpeningStockInvoice,
  OpeningStockInvoiceLine,
  OpeningStockInvoiceReconciliation,
} from "@/lib/opening-stock-server"
import {
  invoiceToEditableFields,
  type InvoiceEditRecord,
  type InvoiceEditableFields,
} from "@/lib/opening-stock-workspace"
import { formatPesewas } from "@/lib/sales"
import { cn } from "@/lib/utils"

import { EditableCell, StaticCell } from "./editable-cell"
import { ReasonPopover } from "./reason-popover"

export type InvoiceRow = OpeningStockInvoice

function asEditRecord(invoice: InvoiceRow): InvoiceEditRecord {
  return {
    id: invoice.id,
    supplierName: invoice.supplierName,
    supplierInvoiceNumber: invoice.supplierInvoiceNumber,
    invoiceDate: invoice.invoiceDate,
    declaredTotalPesewas: invoice.declaredTotalPesewas,
    notes: invoice.notes,
    status: invoice.status,
  }
}

function dateLabel(value: string) {
  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat("en-GH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Accra",
  }).format(parsed)
}

export function InvoicesTab({
  invoices,
  reconciliations,
  lines,
  selectedInvoiceId,
  onSelectInvoice,
  onCorrectInvoice,
  onOpenHistory,
  onCreateInvoice,
  busy,
}: {
  invoices: readonly InvoiceRow[]
  reconciliations: readonly OpeningStockInvoiceReconciliation[]
  lines: readonly OpeningStockInvoiceLine[]
  selectedInvoiceId: string | null
  onSelectInvoice: (invoiceId: string) => void
  onCorrectInvoice: (
    record: InvoiceEditRecord,
    patch: Partial<InvoiceEditableFields>,
    reason: string
  ) => Promise<{ ok: boolean; message?: string }>
  onOpenHistory: (invoiceId: string) => void
  onCreateInvoice: (input: {
    supplierName: string
    invoiceNumber: string
    invoiceDate: string
    declaredTotalGhs: string
    notes: string
  }) => Promise<{ ok: boolean; message?: string }>
  busy: boolean
}) {
  const [query, setQuery] = useState("")
  const [creating, setCreating] = useState(false)
  const [pendingReason, setPendingReason] = useState<{
    record: InvoiceEditRecord
    patch: Partial<InvoiceEditableFields>
    anchor: HTMLElement | null
    label: string
  } | null>(null)

  const statsByInvoice = useMemo(() => {
    const map = new Map<string, { lineCount: number; unitsInvoiced: number; unitsReceived: number }>()
    for (const reconciliation of reconciliations) {
      map.set(reconciliation.invoiceId, {
        lineCount: reconciliation.lineCount,
        unitsInvoiced: reconciliation.quantityInvoiced,
        unitsReceived: 0,
      })
    }
    // Received counts are derived from the line ledger, never assumed.
    for (const line of lines) {
      const entry = map.get(line.invoiceId)
      if (entry) entry.unitsReceived += line.quantityReceived
    }
    return map
  }, [reconciliations, lines])

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) return invoices
    return invoices.filter((invoice) =>
      [
        invoice.supplierName,
        invoice.supplierInvoiceNumber ?? "",
        invoice.invoiceDate,
        String(invoice.declaredTotalPesewas ?? ""),
      ]
        .join(" ")
        .toLowerCase()
        .includes(trimmed)
    )
  }, [invoices, query])

  /**
   * A cell save stages a reason request. The value is only sent to the server
   * after the manager confirms a reason, so a correction can never be recorded
   * without one.
   */
  async function stageSave(record: InvoiceEditRecord, patch: Partial<InvoiceEditableFields>, label: string, anchor: HTMLElement | null) {
    setPendingReason({ record, patch, anchor, label })
    return { ok: true }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#A1A1A6]" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search supplier, reference or date"
            aria-label="Search supplier invoices"
            className="h-10 w-full rounded-lg border border-[#D8D8DC] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#6E0728] focus:ring-2 focus:ring-[#6E0728]/15"
          />
        </div>
        <button
          type="button"
          onClick={() => setCreating((current) => !current)}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-[#6E0728] px-4 text-sm font-semibold text-white transition hover:bg-[#57051F]"
        >
          {creating ? <X className="size-4" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
          {creating ? "Cancel" : "New invoice"}
        </button>
      </div>

      {creating ? (
        <NewInvoiceRow
          busy={busy}
          onSubmit={async (input) => {
            const result = await onCreateInvoice(input)
            if (result.ok) setCreating(false)
            return result
          }}
        />
      ) : null}

      {invoices.length === 0 ? (
        <EmptyPanel
          title="No supplier invoices yet"
          description="Create the first invoice to start recording an incoming delivery."
        />
      ) : filtered.length === 0 ? (
        <EmptyPanel title="No matching invoices" description={`Nothing matches “${query}”. Clear the search to see all invoices.`} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#E8E8ED] bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[#E8E8ED] bg-[#FAFAFC] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#86868B]">
                  <th scope="col" className="px-3 py-2.5 font-semibold">Supplier</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Reference</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Date</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">Lines</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">Units</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">Invoice total</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Status</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((invoice) => {
                  const record = asEditRecord(invoice)
                  const base = invoiceToEditableFields(record)
                  const reconciliation = reconciliations.find((item) => item.invoiceId === invoice.id)
                  const stats = statsByInvoice.get(invoice.id)
                  const isSelected = invoice.id === selectedInvoiceId
                  const closed = invoice.status !== "open"

                  return (
                    <tr
                      key={invoice.id}
                      className={cn(
                        "border-b border-[#F0F0F2] transition last:border-0",
                        isSelected ? "bg-[#FBF7F8]" : "bg-white hover:bg-[#FAFAFC]"
                      )}
                    >
                      <td className="px-1.5 py-1">
                        <EditableCell
                          label="Supplier"
                          cellKey={`${invoice.id}:supplierName`}
                          nextCellKey={closed ? null : `${invoice.id}:supplierInvoiceNumber`}
                          value={base.supplierName}
                          editable={!closed}
                          disabledReason="A closed invoice cannot be corrected."
                          onSave={(next) =>
                            stageSave(record, { supplierName: next }, "Supplier", null)
                          }
                        />
                      </td>
                      <td className="px-1.5 py-1">
                        <EditableCell
                          label="Invoice reference"
                          cellKey={`${invoice.id}:supplierInvoiceNumber`}
                          nextCellKey={closed ? null : `${invoice.id}:invoiceDate`}
                          value={base.supplierInvoiceNumber}
                          editable={!closed}
                          disabledReason="A closed invoice cannot be corrected."
                          placeholder="Optional"
                          onSave={(next) =>
                            stageSave(record, { supplierInvoiceNumber: next }, "Reference", null)
                          }
                        />
                      </td>
                      <td className="px-1.5 py-1">
                        <EditableCell
                          label="Invoice date"
                          cellKey={`${invoice.id}:invoiceDate`}
                          nextCellKey={closed ? null : `${invoice.id}:declaredTotalGhs`}
                          value={base.invoiceDate}
                          type="date"
                          display={dateLabel(invoice.invoiceDate)}
                          editable={!closed}
                          disabledReason="A closed invoice cannot be corrected."
                          onSave={(next) => stageSave(record, { invoiceDate: next }, "Invoice date", null)}
                        />
                      </td>
                      <td className="px-1.5 py-1">
                        <StaticCell align="right" muted>
                          {stats?.lineCount ?? reconciliation?.lineCount ?? 0}
                        </StaticCell>
                      </td>
                      <td className="px-1.5 py-1">
                        <StaticCell align="right" muted>
                          {stats?.unitsInvoiced ?? 0}
                        </StaticCell>
                      </td>
                      <td className="px-1.5 py-1">
                        <EditableCell
                          label="Declared invoice total"
                          cellKey={`${invoice.id}:declaredTotalGhs`}
                          align="right"
                          inputMode="decimal"
                          value={base.declaredTotalGhs}
                          display={
                            invoice.declaredTotalPesewas === null
                              ? <span className="text-[#86868B]">Restricted</span>
                              : formatPesewas(invoice.declaredTotalPesewas)
                          }
                          editable={!closed && invoice.costVisible}
                          disabledReason="Purchase values are restricted for this membership."
                          onSave={(next) =>
                            stageSave(record, { declaredTotalGhs: next }, "Declared total", null)
                          }
                        />
                      </td>
                      <td className="px-3 py-1">
                        <ConfirmationStatus invoice={invoice} reconciliation={reconciliation} />
                      </td>
                      <td className="px-3 py-1">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => onSelectInvoice(invoice.id)}
                            className={cn(
                              "rounded-full px-2.5 py-1 text-xs font-semibold transition",
                              isSelected
                                ? "bg-[#6E0728] text-white"
                                : "text-[#6E0728] hover:bg-[#F7EDF0]"
                            )}
                          >
                            {isSelected ? "Active" : "View invoice"}
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenHistory(invoice.id)}
                            className="rounded-full px-2.5 py-1 text-xs font-medium text-[#68686D] transition hover:bg-[#F7F7F8] hover:text-[#1D1D1F]"
                          >
                            History
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pendingReason ? (
        <ReasonPopover
          title={`Correct ${pendingReason.label.toLowerCase()}`}
          anchor={pendingReason.anchor}
          busy={busy}
          description="The previous and new values are written to the audit history with your name and this reason."
          onCancel={() => setPendingReason(null)}
          onConfirm={async (reason) => {
            const result = await onCorrectInvoice(pendingReason.record, pendingReason.patch, reason)
            if (result.ok) setPendingReason(null)
            return result
          }}
        />
      ) : null}

      <p className="flex items-start gap-2 text-xs leading-5 text-[#86868B]">
        <FileText className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Editing a supplier, reference, date or declared total is an audited correction. It records a reason,
        keeps the previous values, and clears any existing totals confirmation until the invoice is reviewed again.
      </p>
    </div>
  )
}

function ConfirmationStatus({
  invoice,
  reconciliation,
}: {
  invoice: InvoiceRow
  reconciliation: OpeningStockInvoiceReconciliation | undefined
}) {
  if (invoice.status === "closed") {
    return <span className="inline-flex rounded-full bg-[#F5F5F7] px-2 py-0.5 text-[11px] font-semibold text-[#68686D]">Closed</span>
  }
  if (invoice.confirmedAt) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#F0FAF3] px-2 py-0.5 text-[11px] font-semibold text-[#267343]">
        <Check className="size-3" aria-hidden="true" /> Confirmed
      </span>
    )
  }
  if (reconciliation && !reconciliation.reconciled && reconciliation.differencePesewas !== null && reconciliation.differencePesewas !== 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF9EB] px-2 py-0.5 text-[11px] font-semibold text-[#8A6517]">
        <CircleAlert className="size-3" aria-hidden="true" /> Totals differ
      </span>
    )
  }
  return <span className="inline-flex rounded-full bg-[#F7F7F8] px-2 py-0.5 text-[11px] font-semibold text-[#68686D]">Not confirmed</span>
}

function EmptyPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[#D8D8DC] bg-white px-6 py-12 text-center">
      <p className="text-sm font-semibold text-[#1D1D1F]">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-[#86868B]">{description}</p>
    </div>
  )
}

function NewInvoiceRow({
  busy,
  onSubmit,
}: {
  busy: boolean
  onSubmit: (input: {
    supplierName: string
    invoiceNumber: string
    invoiceDate: string
    declaredTotalGhs: string
    notes: string
  }) => Promise<{ ok: boolean; message?: string }>
}) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Accra" }).format(new Date())
  const [values, setValues] = useState({
    supplierName: "",
    invoiceNumber: "",
    invoiceDate: today,
    declaredTotalGhs: "",
    notes: "",
  })
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (saving) return
    setSaving(true)
    setError("")
    const result = await onSubmit(values)
    setSaving(false)
    if (!result.ok) setError(result.message ?? "The invoice could not be created.")
  }

  return (
    <div className="rounded-xl border border-[#E2D2D8] bg-[#FDFBFC] p-4">
      <p className="text-sm font-semibold text-[#1D1D1F]">New supplier invoice</p>
      <p className="mt-1 text-xs leading-5 text-[#86868B]">
        The reference is optional. Fill the row and press Enter to create it, then add products on the next tab.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Supplier" required>
          <input
            value={values.supplierName}
            onChange={(event) => setValues({ ...values, supplierName: event.target.value })}
            placeholder="Approved supplier"
            maxLength={160}
            aria-label="Supplier name"
            className={inputClass}
          />
        </Field>
        <Field label="Invoice number / reference · optional">
          <input
            value={values.invoiceNumber}
            onChange={(event) => setValues({ ...values, invoiceNumber: event.target.value })}
            placeholder="Leave blank if not supplied"
            maxLength={80}
            aria-label="Invoice number or reference"
            className={inputClass}
          />
        </Field>
        <Field label="Invoice date">
          <input
            type="date"
            value={values.invoiceDate}
            max={today}
            onChange={(event) => setValues({ ...values, invoiceDate: event.target.value })}
            aria-label="Invoice date"
            className={inputClass}
          />
        </Field>
        <Field label="Declared total · GH₵">
          <input
            value={values.declaredTotalGhs}
            onChange={(event) => setValues({ ...values, declaredTotalGhs: event.target.value })}
            placeholder="0.00"
            inputMode="decimal"
            aria-label="Declared invoice total in Ghana cedis"
            className={inputClass}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                void submit()
              }
            }}
          />
        </Field>
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving || busy}
            className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-[#6E0728] px-3 text-sm font-semibold text-white transition hover:bg-[#57051F] disabled:opacity-60"
          >
            {saving ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
            Create
          </button>
        </div>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-xs font-medium text-[#A13B34]">
          {error}
        </p>
      ) : null}
    </div>
  )
}

const inputClass =
  "h-9 w-full rounded-lg border border-[#D8D8DC] bg-white px-2.5 text-sm outline-none focus:border-[#6E0728] focus:ring-2 focus:ring-[#6E0728]/15"

function Field({
  label,
  required = false,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-[#68686D]">
        {label}
        {required ? <span className="ml-0.5 text-[#A13B34]">*</span> : null}
      </span>
      {children}
    </label>
  )
}
