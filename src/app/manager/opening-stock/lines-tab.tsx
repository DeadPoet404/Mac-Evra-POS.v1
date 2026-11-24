"use client"

import { useMemo, useState } from "react"
import { Check, LoaderCircle, Plus, Trash2, TriangleAlert } from "lucide-react"

import type {
  DeviceModelCatalogEntry,
  OpeningStockInvoice,
  OpeningStockInvoiceLine,
  OpeningStockInvoiceReconciliation,
} from "@/lib/opening-stock-server"
import {
  computeLineTotalPesewas,
  lineToEditableFields,
  type LineEditRecord,
  type LineEditableFields,
} from "@/lib/opening-stock-workspace"
import { formatPesewas } from "@/lib/sales"
import { cn } from "@/lib/utils"

import { EditableCell, StaticCell } from "./editable-cell"
import { ModelCombobox, formatStorage } from "./model-combobox"
import { ReasonPopover } from "./reason-popover"

function asLineRecord(line: OpeningStockInvoiceLine): LineEditRecord {
  return {
    id: line.id,
    invoiceId: line.invoiceId,
    quantityInvoiced: line.quantityInvoiced,
    unitCostPesewas: line.unitCostPesewas,
    quantityReceived: line.quantityReceived,
  }
}

export function LinesTab({
  invoice,
  lines,
  reconciliation,
  deviceModels,
  busy,
  onAddLine,
  onCorrectLine,
  onRemoveLine,
  onConfirmTotals,
}: {
  invoice: OpeningStockInvoice | null
  lines: readonly OpeningStockInvoiceLine[]
  reconciliation: OpeningStockInvoiceReconciliation | undefined
  deviceModels: readonly DeviceModelCatalogEntry[]
  busy: boolean
  onAddLine: (input: {
    invoiceId: string
    deviceModelId: string
    modelCatalogueId: string | null
    quantityInvoiced: string
    unitCostGhs: string
  }) => Promise<{ ok: boolean; message?: string }>
  onCorrectLine: (
    record: LineEditRecord,
    patch: Partial<LineEditableFields>,
    reason: string
  ) => Promise<{ ok: boolean; message?: string }>
  onRemoveLine: (lineId: string, reason: string) => Promise<{ ok: boolean; message?: string }>
  onConfirmTotals: () => Promise<{ ok: boolean; message?: string }>
}) {
  const [pendingReason, setPendingReason] = useState<{
    record: LineEditRecord
    patch: Partial<LineEditableFields>
    label: string
    anchor: HTMLElement | null
  } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [notice, setNotice] = useState("")
  const [pendingRemoval, setPendingRemoval] = useState<{
    line: OpeningStockInvoiceLine
    anchor: HTMLElement | null
  } | null>(null)

  const invoiceLines = useMemo(
    () => lines.filter((line) => (invoice ? line.invoiceId === invoice.id : false)),
    [lines, invoice]
  )

  const calculatedTotal = useMemo(
    () =>
      invoiceLines.reduce((total, line) => {
        const value = line.lineTotalPesewas
        if (value === null) return total
        return total + value
      }, 0),
    [invoiceLines]
  )

  const quantityInvoiced = invoiceLines.reduce((total, line) => total + line.quantityInvoiced, 0)
  const declaredTotal = invoice?.declaredTotalPesewas ?? null
  const difference = declaredTotal === null ? null : calculatedTotal - declaredTotal
  const isConfirmed = Boolean(invoice?.confirmedAt)
  const closed = invoice?.status !== "open"

  if (!invoice) {
    return (
      <div className="rounded-xl border border-dashed border-[#D8D8DC] bg-white px-6 py-12 text-center">
        <p className="text-sm font-semibold text-[#1D1D1F]">Select an invoice first</p>
        <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-[#86868B]">
          Choose a supplier invoice on the first tab and its product lines will appear here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[#1D1D1F]">
            {invoice.supplierName}
            {invoice.supplierInvoiceNumber ? (
              <span className="ml-1.5 text-[#86868B]">· {invoice.supplierInvoiceNumber}</span>
            ) : null}
          </p>
          <p className="text-xs text-[#86868B]">
            {invoiceLines.length} product {invoiceLines.length === 1 ? "line" : "lines"} · {quantityInvoiced} units invoiced
          </p>
        </div>
        <ConfirmationPill confirmed={isConfirmed} />
      </div>

      <div className="overflow-hidden rounded-xl border border-[#E8E8ED] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[#E8E8ED] bg-[#FAFAFC] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#86868B]">
                <th scope="col" className="w-10 px-3 py-2.5 text-right font-semibold">#</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Model</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Storage</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">Qty invoiced</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">Unit cost</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">Line total</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Received</th>
                <th scope="col" className="w-10 px-2 py-2.5 text-right font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {invoiceLines.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-sm text-[#86868B]">
                    No products on this invoice yet. Add the first line below.
                  </td>
                </tr>
              ) : (
                invoiceLines.map((line) => {
                  const record = asLineRecord(line)
                  const base = lineToEditableFields(record)
                  const costLocked = line.quantityReceived > 0
                  return (
                    <tr key={line.id} className="border-b border-[#F0F0F2] last:border-0 hover:bg-[#FAFAFC]">
                      <td className="px-3 py-1 text-right text-xs tabular-nums text-[#A1A1A6]">{line.lineNumber}</td>
                      <td className="px-1.5 py-1">
                        <StaticCell>{line.modelName}</StaticCell>
                      </td>
                      <td className="px-1.5 py-1">
                        <StaticCell muted>{formatStorage(line.storageGb)}</StaticCell>
                      </td>
                      <td className="px-1.5 py-1">
                        <EditableCell
                          label={`Quantity invoiced for ${line.modelName}`}
                          cellKey={`${line.id}:quantityInvoiced`}
                          nextCellKey={costLocked || closed ? null : `${line.id}:unitCostGhs`}
                          align="right"
                          inputMode="numeric"
                          value={base.quantityInvoiced}
                          editable={!closed}
                          disabledReason="A closed invoice cannot be corrected."
                          onSave={async (next) => {
                            setPendingReason({
                              record,
                              patch: { quantityInvoiced: next },
                              label: `quantity on ${line.modelName}`,
                              anchor: null,
                            })
                            return { ok: true }
                          }}
                        />
                      </td>
                      <td className="px-1.5 py-1">
                        <EditableCell
                          label={`Unit cost for ${line.modelName}`}
                          cellKey={`${line.id}:unitCostGhs`}
                          align="right"
                          inputMode="decimal"
                          value={base.unitCostGhs}
                          display={
                            line.unitCostPesewas === null ? (
                              <span className="text-[#86868B]">Restricted</span>
                            ) : (
                              formatPesewas(line.unitCostPesewas)
                            )
                          }
                          editable={!closed && line.costVisible && !costLocked}
                          disabledReason={
                            costLocked
                              ? "Unit cost is locked because devices have been received on this line."
                              : "Purchase values are restricted for this membership."
                          }
                          onSave={async (next) => {
                            setPendingReason({
                              record,
                              patch: { unitCostGhs: next },
                              label: `unit cost on ${line.modelName}`,
                              anchor: null,
                            })
                            return { ok: true }
                          }}
                        />
                      </td>
                      <td className="px-3 py-1">
                        <StaticCell align="right">
                          {line.lineTotalPesewas === null ? (
                            <span className="text-[#86868B]">Restricted</span>
                          ) : (
                            <span className="tabular-nums">{formatPesewas(line.lineTotalPesewas)}</span>
                          )}
                        </StaticCell>
                      </td>
                      <td className="px-3 py-1">
                        <ReceivedCell line={line} />
                      </td>
                      <td className="px-2 py-1 text-right">
                        <button
                          type="button"
                          onClick={(event) => setPendingRemoval({ line, anchor: event.currentTarget })}
                          disabled={closed || line.quantityReceived > 0 || invoiceLines.length <= 1}
                          title={
                            line.quantityReceived > 0
                              ? "A line with received devices cannot be removed"
                              : invoiceLines.length <= 1
                                ? "The last line cannot be removed"
                                : "Remove this line"
                          }
                          aria-label={`Remove ${line.modelName} ${formatStorage(line.storageGb)} from this invoice`}
                          className="rounded-md p-1.5 text-[#A1A1A6] transition hover:bg-[#FCF4F6] hover:text-[#A13B34] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#A1A1A6]"
                        >
                          <Trash2 className="size-3.5" aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-[#E8E8ED] bg-[#FAFAFC]">
                <td colSpan={3} className="px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.06em] text-[#86868B]">
                  Invoice totals
                </td>
                <td className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums text-[#1D1D1F]">{quantityInvoiced}</td>
                <td />
                <td className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums text-[#1D1D1F]">
                  {formatPesewas(calculatedTotal)}
                </td>
                <td />
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {closed ? null : (
        <AddLineRow
          invoiceId={invoice.id}
          deviceModels={deviceModels}
          busy={busy}
          onAddLine={onAddLine}
        />
      )}

      <ReconciliationPanel
        declaredTotal={declaredTotal}
        calculatedTotal={calculatedTotal}
        difference={difference}
        isConfirmed={isConfirmed}
        confirmedBy={invoice.confirmedByDisplayName}
        confirmedAt={invoice.confirmedAt}
        reconciliation={reconciliation}
        closed={closed}
        busy={busy}
        confirming={confirming}
        notice={notice}
        onConfirm={async () => {
          setConfirming(true)
          setNotice("")
          const result = await onConfirmTotals()
          setConfirming(false)
          setNotice(result.ok ? "Totals confirmed." : (result.message ?? "Could not confirm the totals."))
          return result
        }}
      />

      {pendingRemoval ? (
        <ReasonPopover
          title={`Remove ${pendingRemoval.line.modelName} ${formatStorage(pendingRemoval.line.storageGb)}`}
          anchor={pendingRemoval.anchor}
          busy={busy}
          minLength={5}
          confirmLabel="Remove line"
          description="The line leaves the invoice total and its numbering, and the invoice must be confirmed again. A line with received devices can never be removed."
          onCancel={() => setPendingRemoval(null)}
          onConfirm={async (reason) => {
            const result = await onRemoveLine(pendingRemoval.line.id, reason)
            if (result.ok) setPendingRemoval(null)
            return result
          }}
        />
      ) : null}

      {pendingReason ? (
        <ReasonPopover
          title={`Correct ${pendingReason.label}`}
          anchor={pendingReason.anchor}
          busy={busy}
          description="Line corrections are audited with the previous and new values. A quantity cannot drop below the units already received."
          onCancel={() => setPendingReason(null)}
          onConfirm={async (reason) => {
            const result = await onCorrectLine(pendingReason.record, pendingReason.patch, reason)
            if (result.ok) setPendingReason(null)
            return result
          }}
        />
      ) : null}
    </div>
  )
}

function ReceivedCell({ line }: { line: OpeningStockInvoiceLine }) {
  if (line.quantityReceived === 0) {
    return <StaticCell muted>0 of {line.quantityInvoiced}</StaticCell>
  }
  const complete = line.quantityReceived >= line.quantityInvoiced
  return (
    <div className="flex items-center gap-1.5 px-1.5 py-1">
      <span className={cn("text-sm tabular-nums", complete ? "text-[#267343]" : "text-[#8A6517]")}>
        {line.quantityReceived} of {line.quantityInvoiced}
      </span>
      {line.quantityOutstanding > 0 ? (
        <span className="rounded-full bg-[#FFF9EB] px-1.5 py-0.5 text-[10px] font-semibold text-[#8A6517]">
          {line.quantityOutstanding} due
        </span>
      ) : (
        <Check className="size-3.5 text-[#267343]" aria-label="Fully received" />
      )}
    </div>
  )
}

function ConfirmationPill({ confirmed }: { confirmed: boolean }) {
  return confirmed ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#F0FAF3] px-2.5 py-1 text-[11px] font-semibold text-[#267343]">
      <Check className="size-3" aria-hidden="true" /> Totals confirmed
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-[#F7F7F8] px-2.5 py-1 text-[11px] font-semibold text-[#68686D]">
      Totals not confirmed
    </span>
  )
}

function ReconciliationPanel({
  declaredTotal,
  calculatedTotal,
  difference,
  isConfirmed,
  confirmedBy,
  confirmedAt,
  reconciliation,
  closed,
  busy,
  confirming,
  notice,
  onConfirm,
}: {
  declaredTotal: number | null
  calculatedTotal: number
  difference: number | null
  isConfirmed: boolean
  confirmedBy: string | null
  confirmedAt: string | null
  reconciliation: OpeningStockInvoiceReconciliation | undefined
  closed: boolean
  busy: boolean
  confirming: boolean
  notice: string
  onConfirm: () => Promise<{ ok: boolean; message?: string }>
}) {
  const hasLines = calculatedTotal > 0
  const matches = difference !== null && difference === 0

  return (
    <div className="rounded-xl border border-[#E8E8ED] bg-[#FAFAFC] p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#86868B]">
            Declared invoice total reconciliation
          </p>
          <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
            <div className="flex items-baseline gap-1.5">
              <dt className="text-xs text-[#86868B]">Declared</dt>
              <dd className="font-medium tabular-nums text-[#1D1D1F]">
                {declaredTotal === null ? "Restricted" : formatPesewas(declaredTotal)}
              </dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="text-xs text-[#86868B]">Line total</dt>
              <dd className="font-medium tabular-nums text-[#1D1D1F]">{formatPesewas(calculatedTotal)}</dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="text-xs text-[#86868B]">Difference</dt>
              <dd
                className={cn(
                  "font-semibold tabular-nums",
                  difference === null ? "text-[#86868B]" : matches ? "text-[#267343]" : "text-[#8A6517]"
                )}
              >
                {difference === null ? "Unknown" : formatPesewas(difference)}
              </dd>
            </div>
          </dl>
          <p className="text-xs leading-5 text-[#86868B]">
            {isConfirmed && confirmedBy
              ? `Confirmed by ${confirmedBy}${confirmedAt ? ` on ${new Date(confirmedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}` : ""}.`
              : matches
                ? "The line total matches the declared total. Confirming unlocks device receiving."
                : "Confirm only after the declared total and the product lines agree."}
          </p>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={busy || confirming || isConfirmed || closed || !hasLines}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition",
              isConfirmed || closed
                ? "bg-[#F0FAF3] text-[#267343]"
                : "bg-[#6E0728] text-white hover:bg-[#57051F] disabled:bg-[#E8E8ED] disabled:text-[#A1A1A6]"
            )}
          >
            {confirming ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : isConfirmed ? (
              <Check className="size-4" aria-hidden="true" />
            ) : (
              <Check className="size-4" aria-hidden="true" />
            )}
            {isConfirmed ? "Confirmed" : "Confirm invoice totals"}
          </button>
          {!isConfirmed && !hasLines ? (
            <p className="text-[11px] text-[#86868B]">Add at least one product line first.</p>
          ) : null}
          {reconciliation && !reconciliation.reconciled && hasLines && !isConfirmed ? (
            <p className="flex items-center gap-1 text-[11px] font-medium text-[#8A6517]">
              <TriangleAlert className="size-3" aria-hidden="true" /> Totals differ by{" "}
              {reconciliation.differencePesewas !== null ? formatPesewas(Math.abs(reconciliation.differencePesewas)) : "an unknown amount"}
            </p>
          ) : null}
        </div>
      </div>

      {notice ? (
        <p
          role="status"
          className={cn(
            "mt-2 border-t border-[#E8E8ED] pt-2 text-xs font-medium",
            notice === "Totals confirmed." ? "text-[#267343]" : "text-[#A13B34]"
          )}
        >
          {notice}
        </p>
      ) : null}
    </div>
  )
}

function AddLineRow({
  invoiceId,
  deviceModels,
  busy,
  onAddLine,
}: {
  invoiceId: string
  deviceModels: readonly DeviceModelCatalogEntry[]
  busy: boolean
  onAddLine: (input: {
    invoiceId: string
    deviceModelId: string
    modelCatalogueId: string | null
    quantityInvoiced: string
    unitCostGhs: string
  }) => Promise<{ ok: boolean; message?: string }>
}) {
  const [model, setModel] = useState<DeviceModelCatalogEntry | null>(null)
  const [quantity, setQuantity] = useState("")
  const [unitCost, setUnitCost] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  const lineTotal = useMemo(() => {
    if (!quantity.trim() || !unitCost.trim()) return null
    const pesewas = computeLineTotalPesewas(quantity, unitCost)
    return Number.isFinite(pesewas) ? pesewas : null
  }, [quantity, unitCost])

  async function submit() {
    if (saving) return
    if (!model) {
      setError("Choose a model from the catalogue.")
      return
    }
    setSaving(true)
    setError("")
    const result = await onAddLine({
      invoiceId,
      deviceModelId: model.id,
      modelCatalogueId: model.catalogueId,
      quantityInvoiced: quantity,
      unitCostGhs: unitCost,
    })
    setSaving(false)
    if (result.ok) {
      setModel(null)
      setQuantity("")
      setUnitCost("")
    } else {
      setError(result.message ?? "The product line was not added.")
    }
  }

  return (
    <div className="rounded-xl border border-[#E2D2D8] bg-[#FDFBFC] p-3.5">
      <p className="text-sm font-semibold text-[#1D1D1F]">Add a product line</p>
      <p className="mt-0.5 text-xs text-[#86868B]">
        Search the iPhone catalogue. Storage comes from the catalogue entry, so the model and capacity always match.
      </p>
      <div className="mt-2.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
        <div>
          <span className="mb-1 block text-[11px] font-medium text-[#68686D]">Model</span>
          <ModelCombobox
            deviceModels={deviceModels}
            value={model?.id ?? null}
            onSelect={setModel}
            disabled={busy || saving}
            invalid={Boolean(error) && !model}
          />
        </div>
        <div>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-[#68686D]">Quantity</span>
            <input
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              inputMode="numeric"
              placeholder="0"
              aria-label="Quantity invoiced"
              className="h-9 w-full rounded-lg border border-[#D8D8DC] bg-white px-2.5 text-right text-sm outline-none focus:border-[#6E0728] focus:ring-2 focus:ring-[#6E0728]/15"
            />
          </label>
        </div>
        <div>
          <label className="block">
            <span className="mb-1 flex items-center justify-between text-[11px] font-medium text-[#68686D]">
              <span>Unit cost · GH₵</span>
              {lineTotal !== null ? (
                <span className="font-normal tabular-nums text-[#86868B]">= {formatPesewas(lineTotal)}</span>
              ) : null}
            </span>
            <input
              value={unitCost}
              onChange={(event) => setUnitCost(event.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              aria-label="Unit cost in Ghana cedis"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  void submit()
                }
              }}
              className="h-9 w-full rounded-lg border border-[#D8D8DC] bg-white px-2.5 text-right text-sm outline-none focus:border-[#6E0728] focus:ring-2 focus:ring-[#6E0728]/15"
            />
          </label>
        </div>
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving || busy}
            className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-[#6E0728] px-3 text-sm font-semibold text-white transition hover:bg-[#57051F] disabled:opacity-60 lg:w-auto"
          >
            {saving ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
            Add line
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
