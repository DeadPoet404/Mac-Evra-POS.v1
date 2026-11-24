"use client"

import { useCallback, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import type { OpeningStockInvoiceReconciliationSummary } from "@/lib/opening-stock"
import type { OpeningStockDashboard } from "@/lib/opening-stock-server"
import { initialInvoiceId, invoiceProgress, resolveSelectedInvoice } from "@/lib/opening-stock-workspace"
import { formatPesewas } from "@/lib/sales"
import { cn } from "@/lib/utils"

import {
  activateUnitInlineAction,
  addSupplierInvoiceLineInlineAction,
  confirmSupplierInvoiceInlineAction,
  correctSupplierInvoiceInlineAction,
  correctSupplierInvoiceLineInlineAction,
  createSupplierInvoiceInlineAction,
  receiveDeviceRowInlineAction,
  removeSupplierInvoiceLineInlineAction,
  repriceInlineAction,
} from "./actions"
import { DevicesTab } from "./devices-tab"
import { hasUnsavedDrafts, unsavedDraftLabel } from "./draft-guard"
import { HistoryPanel } from "./history-panel"
import { InvoicesTab } from "./invoices-tab"
import { LinesTab } from "./lines-tab"

const TABS = [
  { id: "invoices", label: "Supplier Invoices", hint: "Create and reconcile the invoice" },
  { id: "products", label: "Invoice Products", hint: "Add models, quantities and costs" },
  { id: "devices", label: "Devices & IMEIs", hint: "Receive handsets and approve prices" },
] as const

type TabId = (typeof TABS)[number]["id"]

export function OpeningStockWorkspace({
  dashboard,
  reconciliationByInvoice,
  permittedConditions,
}: {
  dashboard: OpeningStockDashboard
  /** Server-derived reconciliation, computed with the shared server helper. */
  reconciliationByInvoice: ReadonlyMap<string, OpeningStockInvoiceReconciliationSummary | null>
  permittedConditions: readonly string[]
}) {
  const router = useRouter()
  const [tab, setTab] = useState<TabId>("invoices")
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(() =>
    initialInvoiceId(dashboard.invoices, null)
  )
  const [busy, setBusy] = useState(false)
  const [banner, setBanner] = useState<{ tone: "ok" | "error"; message: string } | null>(null)
  const [historyInvoiceId, setHistoryInvoiceId] = useState<string | null>(null)
  const [pendingNavigation, setPendingNavigation] = useState<{
    description: string
    apply: () => void
  } | null>(null)

  /**
   * Anything that would discard an open inline edit asks first. The prompt names
   * the value at risk, and cancelling leaves the edit exactly as it was — the
   * draft is never thrown away without an explicit decision.
   */
  function guardedNavigation(description: string, apply: () => void) {
    if (!hasUnsavedDrafts()) {
      apply()
      return
    }
    setPendingNavigation({ description, apply })
  }

  const selectedInvoice = useMemo(
    () => resolveSelectedInvoice(dashboard.invoices, selectedInvoiceId),
    [dashboard.invoices, selectedInvoiceId]
  )

  const progress = useMemo(
    () => invoiceProgress(dashboard.lines, selectedInvoice?.id ?? ""),
    [dashboard.lines, selectedInvoice]
  )

  // The server helper is authoritative. The reconciliation view is only a
  // fallback for invoices with no lines yet, where the helper refuses to run.
  const selectedReconciliation = useMemo(() => {
    if (!selectedInvoice) return undefined
    const summary = reconciliationByInvoice.get(selectedInvoice.id)
    if (!summary) {
      return dashboard.reconciliations.find((item) => item.invoiceId === selectedInvoice.id)
    }
    return {
      invoiceId: selectedInvoice.id,
      storeId: selectedInvoice.storeId,
      supplierName: selectedInvoice.supplierName,
      supplierInvoiceNumber: selectedInvoice.supplierInvoiceNumber,
      invoiceDate: selectedInvoice.invoiceDate,
      status: selectedInvoice.status,
      lineCount: summary.lineCount,
      quantityInvoiced: summary.quantityInvoiced,
      declaredTotalPesewas: summary.declaredTotalPesewas,
      calculatedTotalPesewas: summary.calculatedTotalPesewas,
      differencePesewas: summary.differencePesewas,
      reconciled: summary.reconciled,
      costVisible: summary.costVisible,
      confirmedAt: selectedInvoice.confirmedAt,
      confirmedByDisplayName: selectedInvoice.confirmedByDisplayName,
    }
  }, [dashboard.reconciliations, reconciliationByInvoice, selectedInvoice])

  /**
   * After a successful write the server's `revalidatePath` has already produced
   * fresh server-rendered data; `router.refresh()` merges it in place. React
   * keeps this component mounted, so the active tab, the selected invoice and
   * any half-typed row all survive — no full reload, no lost context.
   */
  const refresh = useCallback(() => {
    router.refresh()
  }, [router])

  const withBusy = useCallback(
    async <T,>(work: () => Promise<T>, onDone?: (value: T) => void) => {
      setBusy(true)
      try {
        const value = await work()
        onDone?.(value)
        return value
      } finally {
        setBusy(false)
      }
    },
    []
  )

  function announce(tone: "ok" | "error", message: string) {
    setBanner({ tone, message })
    if (tone === "ok") {
      window.setTimeout(() => setBanner((current) => (current?.message === message ? null : current)), 4000)
    }
  }

  const historyInvoice = dashboard.invoices.find((invoice) => invoice.id === historyInvoiceId) ?? null

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[#1D1D1F]">Opening Stock</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-[#86868B]">
          Record an incoming delivery once: supplier invoice, product lines, then each physical handset. Devices stay
          staged until a manager approves their sale price.
        </p>
      </header>

      <nav aria-label="Opening stock sections" className="border-b border-[#E8E8ED]">
        <ul className="-mb-px flex gap-1 overflow-x-auto" role="tablist">
          {TABS.map((item) => {
            const active = tab === item.id
            return (
              <li key={item.id} role="presentation">
                <button
                  type="button"
                  role="tab"
                  id={`opening-stock-tab-${item.id}`}
                  aria-selected={active}
                  aria-controls={`opening-stock-panel-${item.id}`}
                  onClick={() =>
                    guardedNavigation(`switch to ${item.label}`, () => setTab(item.id))
                  }
                  className={cn(
                    "relative whitespace-nowrap rounded-t-lg px-3 py-2.5 text-sm transition",
                    active
                      ? "font-semibold text-[#6E0728]"
                      : "font-medium text-[#86868B] hover:bg-[#FAFAFC] hover:text-[#1D1D1F]"
                  )}
                >
                  {item.label}
                  {active ? (
                    <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[#6E0728]" aria-hidden="true" />
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      <ContextPanel
        invoice={selectedInvoice}
        progress={progress}
        declaredTotal={selectedInvoice?.declaredTotalPesewas ?? null}
        calculatedTotal={selectedReconciliation?.calculatedTotalPesewas ?? null}
        confirmed={Boolean(selectedInvoice?.confirmedAt)}
        costVisible={selectedInvoice?.costVisible ?? false}
      />

      {banner ? (
        <div
          role="status"
          className={cn(
            "flex items-start justify-between gap-3 rounded-lg px-3 py-2 text-xs font-medium",
            banner.tone === "ok" ? "bg-[#F0FAF3] text-[#267343]" : "bg-[#FCF4F6] text-[#A13B34]"
          )}
        >
          <span>{banner.message}</span>
          <button type="button" onClick={() => setBanner(null)} className="shrink-0 underline underline-offset-2">
            Dismiss
          </button>
        </div>
      ) : null}

      <div
        role="tabpanel"
        id={`opening-stock-panel-${tab}`}
        aria-labelledby={`opening-stock-tab-${tab}`}
        className="pb-6"
      >
        {tab === "invoices" ? (
          <InvoicesTab
            invoices={dashboard.invoices}
            reconciliations={dashboard.reconciliations}
            lines={dashboard.lines}
            selectedInvoiceId={selectedInvoice?.id ?? null}
            onSelectInvoice={(invoiceId) => {
              guardedNavigation("switch invoice", () => {
                setSelectedInvoiceId(invoiceId)
                setBanner(null)
              })
            }}
            onOpenHistory={(invoiceId) => setHistoryInvoiceId(invoiceId)}
            busy={busy}
            onCreateInvoice={(input) =>
              withBusy(async () => {
                const formData = new FormData()
                formData.set("supplierName", input.supplierName)
                formData.set("invoiceNumber", input.invoiceNumber)
                formData.set("invoiceDate", input.invoiceDate)
                formData.set("declaredTotalGhs", input.declaredTotalGhs)
                formData.set("notes", input.notes)
                const result = await createSupplierInvoiceInlineAction(formData)
                if (result.ok) {
                  if (result.data.invoiceId) setSelectedInvoiceId(result.data.invoiceId)
                  announce("ok", result.message)
                  refresh()
                } else {
                  announce("error", result.message)
                }
                return result
              })
            }
            onCorrectInvoice={(record, patch, reason) =>
              withBusy(async () => {
                const result = await correctSupplierInvoiceInlineAction(
                  { ...record, confirmedAt: dashboard.invoices.find((item) => item.id === record.id)?.confirmedAt ?? null },
                  patch,
                  reason
                )
                if (result.ok) {
                  announce("ok", result.message)
                  refresh()
                } else {
                  announce("error", result.message)
                }
                return result
              })
            }
          />
        ) : null}

        {tab === "products" ? (
          <LinesTab
            invoice={selectedInvoice}
            lines={dashboard.lines}
            reconciliation={selectedReconciliation}
            deviceModels={dashboard.deviceModels}
            busy={busy}
            onAddLine={(input) =>
              withBusy(async () => {
                const result = await addSupplierInvoiceLineInlineAction(input)
                if (result.ok) {
                  announce("ok", result.message)
                  refresh()
                } else {
                  announce("error", result.message)
                }
                return result
              })
            }
            onCorrectLine={(record, patch, reason) =>
              withBusy(async () => {
                const result = await correctSupplierInvoiceLineInlineAction(record, patch, reason)
                if (result.ok) {
                  announce("ok", result.message)
                  refresh()
                } else {
                  announce("error", result.message)
                }
                return result
              })
            }
            onRemoveLine={(lineId, reason) =>
              withBusy(async () => {
                const result = await removeSupplierInvoiceLineInlineAction(lineId, reason)
                if (result.ok) {
                  announce("ok", result.message)
                  refresh()
                } else {
                  announce("error", result.message)
                }
                return result
              })
            }
            onConfirmTotals={() => {
              if (!selectedInvoice) {
                return Promise.resolve({ ok: false, message: "Select an invoice first." })
              }
              return withBusy(async () => {
                const lines = dashboard.lines.filter((line) => line.invoiceId === selectedInvoice.id)
                const result = await confirmSupplierInvoiceInlineAction({
                  invoiceId: selectedInvoice.id,
                  declaredTotalPesewas: selectedInvoice.declaredTotalPesewas ?? 0,
                  lineCount: lines.length,
                  quantityInvoiced: lines.reduce((total, line) => total + line.quantityInvoiced, 0),
                  calculatedTotalPesewas: lines.reduce(
                    (total, line) => total + (line.lineTotalPesewas ?? 0),
                    0
                  ),
                })
                if (result.ok) {
                  announce("ok", result.message)
                  refresh()
                } else {
                  announce("error", result.message)
                }
                return result
              })
            }}
          />
        ) : null}

        {tab === "devices" ? (
          <DevicesTab
            invoice={selectedInvoice}
            lines={dashboard.lines}
            units={dashboard.units}
            permittedConditions={permittedConditions}
            busy={busy}
            onReceiveDevice={(input, existingImeis) =>
              withBusy(async () => {
                const result = await receiveDeviceRowInlineAction(input, existingImeis)
                if (result.ok) {
                  announce("ok", result.message)
                  refresh()
                } else {
                  announce("error", result.message)
                }
                return result
              })
            }
            onActivate={(unitId, price) =>
              withBusy(async () => {
                const result = await activateUnitInlineAction(unitId, price)
                if (result.ok) {
                  announce("ok", result.message)
                  refresh()
                } else {
                  announce("error", result.message)
                }
                return result
              })
            }
            onReprice={(unitId, expected, next, reason) =>
              withBusy(async () => {
                const result = await repriceInlineAction(unitId, expected, next, reason)
                if (result.ok) {
                  announce("ok", result.message)
                  refresh()
                } else {
                  announce("error", result.message)
                }
                return result
              })
            }
          />
        ) : null}
      </div>

      {pendingNavigation ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="Unsaved edit"
          className="fixed inset-x-0 bottom-0 z-50 border-t border-[#E2D2D8] bg-white px-4 py-3 shadow-[0_-8px_24px_rgba(29,29,31,0.08)]"
        >
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[#1D1D1F]">
              <span className="font-semibold">You have an unsaved edit.</span>{" "}
              <span className="text-[#68686D]">
                {unsavedDraftLabel() || "A value has changed but is not saved yet"}. Save it or press Escape on the
                field to discard it before you {pendingNavigation.description}.
              </span>
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPendingNavigation(null)}
                className="rounded-full border border-[#D8D8DC] px-3.5 py-1.5 text-sm font-medium text-[#1D1D1F] hover:bg-[#F7F7F8]"
              >
                Keep editing
              </button>
              <button
                type="button"
                onClick={() => {
                  const apply = pendingNavigation.apply
                  setPendingNavigation(null)
                  apply()
                }}
                className="rounded-full px-3.5 py-1.5 text-sm font-medium text-[#A13B34] hover:bg-[#FCF4F6]"
              >
                Discard and continue
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {historyInvoice ? (
        <HistoryPanel
          invoice={historyInvoice}
          corrections={dashboard.corrections}
          priceChanges={dashboard.priceChanges}
          lines={dashboard.lines}
          units={dashboard.units}
          onClose={() => setHistoryInvoiceId(null)}
        />
      ) : null}
    </div>
  )
}

/**
 * Compact contextual summary for the active invoice. Deliberately small: totals,
 * units, confirmation and receiving progress, no charts and no oversized cards.
 */
function ContextPanel({
  invoice,
  progress,
  declaredTotal,
  calculatedTotal,
  confirmed,
  costVisible,
}: {
  invoice: OpeningStockDashboard["invoices"][number] | null
  progress: ReturnType<typeof invoiceProgress>
  declaredTotal: number | null
  calculatedTotal: number | null
  confirmed: boolean
  costVisible: boolean
}) {
  if (!invoice) {
    return (
      <div className="rounded-xl border border-[#E8E8ED] bg-[#FAFAFC] px-4 py-3 text-sm text-[#86868B]">
        No invoice is active. Create or select one on the Supplier Invoices tab.
      </div>
    )
  }

  const difference = declaredTotal !== null && calculatedTotal !== null ? calculatedTotal - declaredTotal : null
  const metrics: { label: string; value: string; tone?: "ok" | "warn" | "muted" }[] = [
    {
      label: "Declared total",
      value: declaredTotal === null ? "Restricted" : formatPesewas(declaredTotal),
      tone: declaredTotal === null ? "muted" : undefined,
    },
    {
      label: "Line total",
      value: calculatedTotal === null ? "Restricted" : formatPesewas(calculatedTotal),
      tone: calculatedTotal === null ? "muted" : undefined,
    },
    {
      label: "Difference",
      value:
        difference === null
          ? "Unknown"
          : difference === 0
            ? formatPesewas(0)
            : formatPesewas(difference),
      tone: difference === null ? "muted" : difference === 0 ? "ok" : "warn",
    },
    { label: "Product lines", value: String(progress.lineCount), tone: "muted" },
    {
      label: "Units invoiced",
      value: `${progress.unitsReceived}/${progress.unitsInvoiced} received`,
      tone: progress.unitsOutstanding === 0 ? "ok" : "warn",
    },
    { label: "Sellable", value: `${progress.unitsActivated} activated`, tone: "muted" },
    { label: "Confirmation", value: confirmed ? "Confirmed" : "Not confirmed", tone: confirmed ? "ok" : "warn" },
  ]

  return (
    <div className="rounded-xl border border-[#E8E8ED] bg-white px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-semibold text-[#1D1D1F]">
          {invoice.supplierName}
          {invoice.supplierInvoiceNumber ? (
            <span className="ml-1.5 font-normal text-[#86868B]">· {invoice.supplierInvoiceNumber}</span>
          ) : null}
        </p>
        <p className="text-xs text-[#86868B]">
          {new Date(`${invoice.invoiceDate}T00:00:00Z`).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            timeZone: "Africa/Accra",
          })}
          {invoice.status === "closed" ? " · Closed" : ""}
        </p>
      </div>
      <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1.5">
        {metrics.map((metric) => (
          <div key={metric.label} className="min-w-0">
            <dt className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#A1A1A6]">{metric.label}</dt>
            <dd
              className={cn(
                "text-sm tabular-nums",
                metric.tone === "ok"
                  ? "text-[#267343]"
                  : metric.tone === "warn"
                    ? "text-[#8A6517]"
                    : metric.tone === "muted"
                      ? "text-[#68686D]"
                      : "text-[#1D1D1F]"
              )}
            >
              {metric.value}
            </dd>
          </div>
        ))}
      </dl>
      {!costVisible ? (
        <p className="mt-2 text-[11px] leading-4 text-[#A1A1A6]">
          Purchase amounts are hidden for this membership. Only sale prices are shown.
        </p>
      ) : null}
    </div>
  )
}
