"use client"

import { useEffect } from "react"
import { History, X } from "lucide-react"

import type {
  OpeningStockCorrection,
  OpeningStockInvoice,
  OpeningStockInvoiceLine,
  OpeningStockPriceChange,
  OpeningStockUnit,
} from "@/lib/opening-stock-server"
import { describeCorrection } from "@/lib/opening-stock-workspace"
import { formatPesewas } from "@/lib/sales"

function stamp(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Accra",
  }).format(date)
}

/**
 * Read-only audit history for one invoice.
 *
 * Shows the correction ledger and price changes exactly as the database wrote
 * them: actor, timestamp, reason and a before → after summary. This is the
 * "distinguishing ordinary edits from historical corrections" surface — an
 * ordinary edit is simply an inline save; anything that rewrites a recorded
 * value appears here with its reason.
 */
export function HistoryPanel({
  invoice,
  corrections,
  priceChanges,
  lines,
  units,
  onClose,
}: {
  invoice: OpeningStockInvoice
  corrections: readonly OpeningStockCorrection[]
  priceChanges: readonly OpeningStockPriceChange[]
  lines: readonly OpeningStockInvoiceLine[]
  /** Price changes reference a staged unit, so units are the link back to this invoice. */
  units: readonly OpeningStockUnit[]
  onClose: () => void
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  const invoiceCorrections = corrections.filter((entry) => entry.invoiceId === invoice.id)
  const invoiceLineIds = new Set(
    lines.filter((line) => line.invoiceId === invoice.id).map((line) => line.id)
  )
  const invoiceUnits = units.filter((unit) => invoiceLineIds.has(unit.invoiceLineId))
  const invoiceUnitIds = new Set(invoiceUnits.map((unit) => unit.id))
  const imeiByUnitId = new Map(invoiceUnits.map((unit) => [unit.id, unit.imei]))
  const relevantPriceChanges = priceChanges.filter((change) => invoiceUnitIds.has(change.unitId))

  return (
    <>
      <div className="fixed inset-0 z-40 bg-[#1D1D1F]/15" aria-hidden="true" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Audit history for ${invoice.supplierName}`}
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-[#E8E8ED] bg-white shadow-[-8px_0_32px_rgba(29,29,31,0.10)]"
      >
        <header className="flex items-start justify-between gap-3 border-b border-[#E8E8ED] px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-[#1D1D1F]">Audit history</p>
            <p className="mt-0.5 text-xs text-[#86868B]">
              {invoice.supplierName}
              {invoice.supplierInvoiceNumber ? ` · ${invoice.supplierInvoiceNumber}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close audit history"
            className="flex size-8 items-center justify-center rounded-lg text-[#86868B] hover:bg-[#F7F7F8]"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#86868B]">
              Corrections ({invoiceCorrections.length})
            </h3>
            {invoiceCorrections.length === 0 ? (
              <p className="mt-2 rounded-lg bg-[#FAFAFC] px-3 py-2.5 text-xs leading-5 text-[#86868B]">
                No corrections have been recorded on this invoice. Ordinary inline edits are saved directly; a
                correction appears here only when a previously recorded value is changed.
              </p>
            ) : (
              <ol className="mt-2 space-y-2">
                {invoiceCorrections.map((entry) => {
                  const changes = describeCorrection(entry.entityType, entry.beforeData, entry.afterData)
                  return (
                    <li key={entry.id} className="rounded-lg border border-[#E8E8ED] p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded-full bg-[#F7EDF0] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#6E0728]">
                          {entry.entityType === "invoice" ? "Invoice" : "Line"}
                        </span>
                        <time className="text-[11px] tabular-nums text-[#A1A1A6]">{stamp(entry.createdAt)}</time>
                      </div>
                      <ul className="mt-1.5 space-y-0.5">
                        {changes.length === 0 ? (
                          <li className="text-xs text-[#86868B]">No field difference recorded.</li>
                        ) : (
                          changes.map((change) => (
                            <li key={change} className="text-xs leading-5 text-[#1D1D1F]">
                              {change}
                            </li>
                          ))
                        )}
                      </ul>
                      <p className="mt-1.5 border-t border-[#F0F0F2] pt-1.5 text-xs leading-5 text-[#68686D]">
                        <span className="font-medium text-[#1D1D1F]">Reason: </span>
                        {entry.reason}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[#A1A1A6]">Recorded by {entry.actorDisplayName}</p>
                    </li>
                  )
                })}
              </ol>
            )}
          </section>

          <section className="mt-5">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#86868B]">
              Price changes ({relevantPriceChanges.length})
            </h3>
            {relevantPriceChanges.length === 0 ? (
              <p className="mt-2 rounded-lg bg-[#FAFAFC] px-3 py-2.5 text-xs leading-5 text-[#86868B]">
                No approved sale price has been changed for this invoice.
              </p>
            ) : (
              <ol className="mt-2 space-y-2">
                {relevantPriceChanges.map((change) => (
                  <li key={change.id} className="rounded-lg border border-[#E8E8ED] p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs tabular-nums text-[#1D1D1F]">
                        {imeiByUnitId.get(change.unitId) ?? "Device"}
                      </span>
                      <time className="text-[11px] tabular-nums text-[#A1A1A6]">{stamp(change.createdAt)}</time>
                    </div>
                    <p className="mt-1 text-xs tabular-nums text-[#1D1D1F]">
                      {formatPesewas(change.oldPricePesewas)} → {formatPesewas(change.newPricePesewas)}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[#68686D]">
                      <span className="font-medium text-[#1D1D1F]">Reason: </span>
                      {change.reason}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#A1A1A6]">Recorded by {change.actorDisplayName}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <p className="mt-5 flex items-start gap-1.5 text-[11px] leading-4 text-[#A1A1A6]">
            <History className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
            This ledger is written by the database and cannot be edited or deleted from the app.
          </p>
        </div>
      </aside>
    </>
  )
}
