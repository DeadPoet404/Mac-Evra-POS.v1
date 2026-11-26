"use client"

import { Fragment, useMemo, useState } from "react"
import { Check, CircleAlert, ChevronRight, LoaderCircle, Plus, ShieldCheck } from "lucide-react"

import { openingStockInspectionChecks } from "@/lib/opening-stock"
import type { OpeningStockCondition, OpeningStockUnitStatus } from "@/lib/opening-stock"
import type {
  OpeningStockInvoice,
  OpeningStockInvoiceLine,
  OpeningStockUnit,
} from "@/lib/opening-stock-server"
import {
  emptyDeviceEntry,
  inspectionChecksFromRecord,
  nextDeviceEntry,
  validateDeviceEntry,
  type DeviceEntryDraft,
  type FieldErrors,
} from "@/lib/opening-stock-workspace"
import { formatPesewas } from "@/lib/sales"
import { cn } from "@/lib/utils"

import { EditableCell } from "./editable-cell"
import { ReasonPopover } from "./reason-popover"
import { formatStorage } from "./model-combobox"

// Opening stock moves staged -> activated; later lifecycles (sales, returns) are
// owned by other modules, so only these two states are labelled here.
const statusLabel: Record<OpeningStockUnitStatus, string> = {
  staged: "Staged",
  activated: "Sellable",
}

const conditionLabel: Record<OpeningStockCondition, string> = {
  excellent: "Excellent",
  good: "Good",
  fair: "Fair",
}

export function DevicesTab({
  invoice,
  lines,
  units,
  permittedConditions,
  busy,
  onReceiveDevice,
  onActivate,
  onReprice,
  onRecordBattery,
}: {
  invoice: OpeningStockInvoice | null
  lines: readonly OpeningStockInvoiceLine[]
  units: readonly OpeningStockUnit[]
  /** Supplied by the server page so the UI cannot drift from the accepted values. */
  permittedConditions: readonly string[]
  busy: boolean
  onReceiveDevice: (
    input: {
      invoiceLineId: string
      imei: string
      colour: string
      condition: string
      batteryHealth: string
      inspectionNotes: string
      checks: Record<string, boolean>
    },
    existingImeis: readonly string[]
  ) => Promise<{ ok: boolean; message?: string; fieldErrors?: FieldErrors }>
  onActivate: (unitId: string, approvedPriceGhs: string) => Promise<{ ok: boolean; message?: string }>
  onReprice: (
    unitId: string,
    expectedPriceGhs: string,
    newPriceGhs: string,
    reason: string
  ) => Promise<{ ok: boolean; message?: string }>
  onRecordBattery: (unitId: string, batteryHealth: string) => Promise<{ ok: boolean; message?: string }>
}) {
  const [entry, setEntry] = useState<DeviceEntryDraft>(() => emptyDeviceEntry(lines[0]?.id ?? ""))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState<{ tone: "ok" | "error"; message: string } | null>(null)
  const [receiptLog, setReceiptLog] = useState<string[]>([])

  const invoiceLines = useMemo(
    () => lines.filter((line) => (invoice ? line.invoiceId === invoice.id : false)),
    [lines, invoice]
  )
  const invoiceLineIds = useMemo(() => new Set(invoiceLines.map((line) => line.id)), [invoiceLines])
  const invoiceUnits = useMemo(
    () => units.filter((unit) => invoiceLineIds.has(unit.invoiceLineId)),
    [units, invoiceLineIds]
  )
  const existingImeis = useMemo(
    () => units.map((unit) => unit.imei).concat(invoiceUnits.map((unit) => unit.imei)),
    [units, invoiceUnits]
  )

  const activeLine = invoiceLines.find((line) => line.id === entry.invoiceLineId) ?? null
  const canReceive = Boolean(invoice?.confirmedAt) && invoice?.status === "open" && Boolean(activeLine && activeLine.quantityOutstanding > 0)
  const needsConfirmation = Boolean(invoice) && !invoice?.confirmedAt

  if (!invoice) {
    return (
      <div className="rounded-xl border border-dashed border-[#D8D8DC] bg-white px-6 py-12 text-center">
        <p className="text-sm font-semibold text-[#1D1D1F]">Select an invoice first</p>
        <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-[#86868B]">
          Choose a supplier invoice on the first tab and its devices will appear here.
        </p>
      </div>
    )
  }

  async function submitEntry() {
    if (saving) return
    const validation = validateDeviceEntry(entry, { existingImeis, inspectionChecks: openingStockInspectionChecks })
    setErrors(validation)
    if (Object.keys(validation).length > 0) {
      setFlash({ tone: "error", message: "This device still has fields to complete. Nothing was saved." })
      return
    }

    setSaving(true)
    setFlash(null)
    const result = await onReceiveDevice(entry, existingImeis)
    setSaving(false)

    if (!result.ok) {
      setErrors(result.fieldErrors ?? {})
      setFlash({ tone: "error", message: result.message ?? "The device was not received." })
      return
    }

    setFlash({ tone: "ok", message: `Device ${entry.imei} received and staged.` })
    setReceiptLog((log) => [`${entry.imei} · ${activeLine ? `${activeLine.modelName} ${formatStorage(activeLine.storageGb)}` : ""}`, ...log].slice(0, 6))
    // A fresh row for the next handset: no colour, condition, battery or
    // attestation carried over from the device just recorded.
    setEntry(nextDeviceEntry(entry, entry.invoiceLineId))
    setErrors({})
  }

  function update(patch: Partial<DeviceEntryDraft>) {
    setEntry((current) => ({ ...current, ...patch }))
    setErrors({})
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[#1D1D1F]">
            {invoice.supplierName}
            {invoice.supplierInvoiceNumber ? <span className="ml-1.5 text-[#86868B]">· {invoice.supplierInvoiceNumber}</span> : null}
          </p>
          <p className="text-xs text-[#86868B]">
            {invoiceUnits.length} of {invoiceLines.reduce((total, line) => total + line.quantityInvoiced, 0)} devices received
          </p>
        </div>
        <ReceiveProgress lines={invoiceLines} />
      </div>

      {canReceive ? (
        <DeviceEntryForm
          permittedConditions={permittedConditions}
          entry={entry}
          errors={errors}
          lines={invoiceLines}
          saving={saving}
          busy={busy}
          onChange={update}
          onSubmit={submitEntry}
        />
      ) : (
        <div className="rounded-xl border border-[#E8E8ED] bg-[#FAFAFC] p-3.5">
          <p className="flex items-center gap-1.5 text-sm font-medium text-[#1D1D1F]">
            <CircleAlert className="size-4 text-[#8A6517]" aria-hidden="true" />
            {needsConfirmation
              ? "Confirm the invoice totals before receiving devices"
              : invoice.status !== "open"
                ? "This invoice is closed"
                : "Every line on this invoice is fully received"}
          </p>
          <p className="ml-6 mt-0.5 text-xs leading-5 text-[#86868B]">
            {needsConfirmation
              ? "Device receiving stays locked until the declared total and the product lines agree and a manager confirms them on the Invoice Products tab."
              : invoice.status !== "open"
                ? "Closed invoices are read-only. Receiving counts remain available below."
                : "There are no outstanding units left to receive. Add a product line to receive more."}
          </p>
        </div>
      )}

      {flash ? (
        <p
          role="status"
          className={cn(
            "rounded-lg px-3 py-2 text-xs font-medium",
            flash.tone === "ok" ? "bg-[#F0FAF3] text-[#267343]" : "bg-[#FCF4F6] text-[#A13B34]"
          )}
        >
          {flash.message}
        </p>
      ) : null}

      {receiptLog.length > 0 ? (
        <div className="rounded-lg border border-[#E8E8ED] bg-white px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#86868B]">Received in this session</p>
          <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {receiptLog.map((item, index) => (
              <li key={`${item}-${index}`} className="flex items-center gap-1 text-xs tabular-nums text-[#1D1D1F]">
                <Check className="size-3 text-[#267343]" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <DeviceTable
        units={invoiceUnits}
        busy={busy}
        onActivate={onActivate}
        onReprice={onReprice}
        onRecordBattery={onRecordBattery}
      />
    </div>
  )
}

function ReceiveProgress({ lines }: { lines: readonly OpeningStockInvoiceLine[] }) {
  const invoiced = lines.reduce((total, line) => total + line.quantityInvoiced, 0)
  const received = lines.reduce((total, line) => total + line.quantityReceived, 0)
  const percent = invoiced > 0 ? Math.round((received / invoiced) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[#EDEDF0]" role="img" aria-label={`${percent}% received`}>
        <div className="h-full rounded-full bg-[#6E0728]" style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
      <span className="text-xs tabular-nums text-[#86868B]">
        {received}/{invoiced} received
      </span>
    </div>
  )
}

function DeviceEntryForm({
  permittedConditions,
  entry,
  errors,
  lines,
  saving,
  busy,
  onChange,
  onSubmit,
}: {
  entry: DeviceEntryDraft
  errors: FieldErrors
  permittedConditions: readonly string[]
  lines: readonly OpeningStockInvoiceLine[]
  saving: boolean
  busy: boolean
  onChange: (patch: Partial<DeviceEntryDraft>) => void
  onSubmit: () => Promise<void>
}) {
  const [advancedOpen, setAdvancedOpen] = useState(true)
  const outstandingLines = lines.filter((line) => line.quantityOutstanding > 0)
  const attested = openingStockInspectionChecks.filter((check) => entry.checks[check.name] === true).length
  const complete = attested === openingStockInspectionChecks.length

  return (
    <div className="rounded-xl border border-[#E2D2D8] bg-[#FDFBFC] p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[#1D1D1F]">Receive a device</p>
          <p className="mt-0.5 text-xs leading-5 text-[#86868B]">
            One handset per row. Colour, condition, battery and every inspection check describe this device only —
            nothing is copied to the next row.
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-semibold",
            complete ? "bg-[#F0FAF3] text-[#267343]" : "bg-[#F7F7F8] text-[#68686D]"
          )}
        >
          {attested}/{openingStockInspectionChecks.length} checks
        </span>
      </div>

      <div className="mt-2.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-1">
          <FieldLabel htmlFor="device-line" error={errors.invoiceLineId}>
            Product line
          </FieldLabel>
          <select
            id="device-line"
            value={entry.invoiceLineId}
            onChange={(event) => onChange({ invoiceLineId: event.target.value })}
            aria-invalid={errors.invoiceLineId ? true : undefined}
            className={inputClass}
          >
            {outstandingLines.length === 0 ? <option value="">No line with outstanding units</option> : null}
            {outstandingLines.map((line) => (
              <option key={line.id} value={line.id}>
                {line.modelName} {formatStorage(line.storageGb)} · {line.quantityOutstanding} due
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <FieldLabel htmlFor="device-imei" error={errors.imei}>
            IMEI
          </FieldLabel>
          <input
            id="device-imei"
            value={entry.imei}
            onChange={(event) => onChange({ imei: event.target.value })}
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            maxLength={20}
            placeholder="Scan or type the 15-digit IMEI"
            aria-invalid={errors.imei ? true : undefined}
            aria-describedby={errors.imei ? "device-imei-error" : "device-imei-hint"}
            className={cn(inputClass, "font-mono tabular-nums", errors.imei && "border-[#A13B34]")}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                void onSubmit()
              }
            }}
          />
          {errors.imei ? (
            <p id="device-imei-error" role="alert" className="mt-1 text-[11px] font-medium text-[#A13B34]">
              {errors.imei}
            </p>
          ) : (
            <p id="device-imei-hint" className="mt-1 text-[11px] text-[#86868B]">
              Validated for length, Luhn check and store-wide uniqueness.
            </p>
          )}
        </div>

        <div>
          <FieldLabel htmlFor="device-colour" error={errors.colour}>
            Colour
          </FieldLabel>
          <input
            id="device-colour"
            value={entry.colour}
            onChange={(event) => onChange({ colour: event.target.value })}
            placeholder="e.g. Midnight"
            maxLength={60}
            aria-invalid={errors.colour ? true : undefined}
            className={cn(inputClass, errors.colour && "border-[#A13B34]")}
          />
          {errors.colour ? <FieldError>{errors.colour}</FieldError> : null}
        </div>

        <div>
          <FieldLabel htmlFor="device-condition" error={errors.condition}>
            Condition
          </FieldLabel>
          <select
            id="device-condition"
            value={entry.condition}
            onChange={(event) => onChange({ condition: event.target.value })}
            aria-invalid={errors.condition ? true : undefined}
            className={cn(inputClass, errors.condition && "border-[#A13B34]")}
          >
            <option value="" disabled>
              Select condition
            </option>
            {permittedConditions.map((condition) => (
              <option key={condition} value={condition}>
                {conditionLabel[condition as OpeningStockCondition] ?? condition}
              </option>
            ))}
          </select>
          {errors.condition ? <FieldError>{errors.condition}</FieldError> : null}
        </div>

        <div>
          <FieldLabel htmlFor="device-battery" error={errors.batteryHealth}>
            Battery health · %
          </FieldLabel>
          <input
            id="device-battery"
            value={entry.batteryHealth}
            onChange={(event) => onChange({ batteryHealth: event.target.value })}
            inputMode="numeric"
            maxLength={3}
            placeholder="Measured value or blank"
            aria-invalid={errors.batteryHealth ? true : undefined}
            className={cn(inputClass, "tabular-nums", errors.batteryHealth && "border-[#A13B34]")}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                void onSubmit()
              }
            }}
          />
          {errors.batteryHealth ? (
            <FieldError>{errors.batteryHealth}</FieldError>
          ) : (
            <p className="mt-1 text-[11px] text-[#86868B]">
              Leave blank when the inspection reports no battery health. The device stages as unmeasured and cannot be
              priced until a reading is recorded.
            </p>
          )}
        </div>

        <div className="sm:col-span-2 lg:col-span-3">
          <FieldLabel htmlFor="device-notes" error={errors.inspectionNotes}>
            Inspection notes (optional)
          </FieldLabel>
          <input
            id="device-notes"
            value={entry.inspectionNotes}
            onChange={(event) => onChange({ inspectionNotes: event.target.value })}
            maxLength={500}
            placeholder="Anything the next technician should know about this handset"
            className={inputClass}
          />
          {errors.inspectionNotes ? <FieldError>{errors.inspectionNotes}</FieldError> : null}
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-[#E8E8ED] bg-white">
        <button
          type="button"
          onClick={() => setAdvancedOpen((current) => !current)}
          aria-expanded={advancedOpen}
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
        >
          <span className="flex items-center gap-1.5 text-xs font-semibold text-[#1D1D1F]">
            <ShieldCheck className="size-3.5 text-[#6E0728]" aria-hidden="true" />
            Physical inspection for this device
          </span>
          <span className="flex items-center gap-2">
            <span className="text-[11px] tabular-nums text-[#86868B]">
              {attested}/{openingStockInspectionChecks.length}
            </span>
            <ChevronRight
              className={cn("size-3.5 text-[#A1A1A6] transition", advancedOpen && "rotate-90")}
              aria-hidden="true"
            />
          </span>
        </button>
        {advancedOpen ? (
          <div className="grid gap-1 border-t border-[#F0F0F2] p-2 sm:grid-cols-2">
            {openingStockInspectionChecks.map((check) => {
              const checked = entry.checks[check.name] === true
              return (
                <label
                  key={check.name}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-xs leading-4 transition",
                    checked ? "bg-[#F0FAF3] text-[#1D1D1F]" : "text-[#68686D] hover:bg-[#FAFAFC]"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) =>
                      onChange({ checks: { ...entry.checks, [check.name]: event.target.checked } })
                    }
                    className="mt-0.5 size-3.5 shrink-0 accent-[#6E0728]"
                  />
                  <span>{check.label}</span>
                </label>
              )
            })}
          </div>
        ) : null}
      </div>
      {errors.inspection ? (
        <p role="alert" className="mt-1.5 text-[11px] font-medium text-[#A13B34]">
          {errors.inspection}
        </p>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-[11px] leading-4 text-[#86868B]">
          The row resets after each save. The device stays <span className="font-medium">staged</span> until a manager
          approves its sale price.
        </p>
        <button
          type="button"
          onClick={() => void onSubmit()}
          disabled={saving || busy}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[#6E0728] px-3.5 text-sm font-semibold text-white transition hover:bg-[#57051F] disabled:opacity-60"
        >
          {saving ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
          Receive device
        </button>
      </div>
    </div>
  )
}

function DeviceTable({
  units,
  busy,
  onActivate,
  onReprice,
  onRecordBattery,
}: {
  units: readonly OpeningStockUnit[]
  busy: boolean
  onActivate: (unitId: string, approvedPriceGhs: string) => Promise<{ ok: boolean; message?: string }>
  onReprice: (unitId: string, expectedPriceGhs: string, newPriceGhs: string, reason: string) => Promise<{ ok: boolean; message?: string }>
  onRecordBattery: (unitId: string, batteryHealth: string) => Promise<{ ok: boolean; message?: string }>
}) {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (units.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[#D8D8DC] bg-white px-6 py-10 text-center">
        <p className="text-sm font-semibold text-[#1D1D1F]">No devices received yet</p>
        <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-[#86868B]">
          Received handsets appear here with their own IMEI, inspection record and activation status.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[#E8E8ED] bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[#E8E8ED] bg-[#FAFAFC] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#86868B]">
              <th scope="col" className="px-3 py-2.5 font-semibold">IMEI</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">Model</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">Colour</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">Condition</th>
              <th scope="col" className="px-3 py-2.5 text-right font-semibold">Battery</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">Status</th>
              <th scope="col" className="px-3 py-2.5 text-right font-semibold">Approved price</th>
            </tr>
          </thead>
          <tbody>
            {units.map((unit) => {
              const open = expanded === unit.id
              const inspection = inspectionChecksFromRecord(unit.inspection)
              const passed = Object.values(inspection.checks).filter(Boolean).length
              return (
                <Fragment key={unit.id}>
                  <tr
                    className="border-b border-[#F0F0F2] transition hover:bg-[#FAFAFC]"
                    onClick={() => setExpanded(open ? null : unit.id)}
                  >
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        aria-expanded={open}
                        className="flex items-center gap-1.5 font-mono text-xs tabular-nums text-[#1D1D1F]"
                      >
                        <ChevronRight className={cn("size-3 text-[#A1A1A6] transition", open && "rotate-90")} aria-hidden="true" />
                        {unit.imei}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      {unit.modelName}
                      <span className="ml-1.5 text-xs text-[#86868B]">{formatStorage(unit.storageGb)}</span>
                    </td>
                    <td className="px-3 py-2 text-[#68686D]">{unit.colour}</td>
                    <td className="px-3 py-2">
                      <span className="rounded-full bg-[#F7F7F8] px-2 py-0.5 text-[11px] font-medium text-[#68686D]">
                        {conditionLabel[unit.condition]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#68686D]">
                      {unit.batteryHealth === null ? (
                        <span className="text-[#8A6517]" title="The inspection reported no battery health">
                          Not measured
                        </span>
                      ) : (
                        `${unit.batteryHealth}%`
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <UnitStatus unit={unit} />
                    </td>
                    <td className="px-2 py-1">
                      <PriceCell
                        unit={unit}
                        busy={busy}
                        onActivate={onActivate}
                        onReprice={onReprice}
                        onRecordBattery={onRecordBattery}
                      />
                    </td>
                  </tr>
                  {open ? (
                    <tr className="border-b border-[#F0F0F2] bg-[#FCFCFD]">
                      <td colSpan={7} className="px-4 py-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#86868B]">
                              Inspection · {passed} of {openingStockInspectionChecks.length} passed
                            </p>
                            <ul className="mt-1 grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
                              {openingStockInspectionChecks.map((check) => (
                                <li key={check.name} className="flex items-center gap-1.5 text-xs text-[#68686D]">
                                  {inspection.checks[check.name] ? (
                                    <Check className="size-3 text-[#267343]" aria-hidden="true" />
                                  ) : (
                                    <CircleAlert className="size-3 text-[#A1A1A6]" aria-hidden="true" />
                                  )}
                                  {check.label}
                                </li>
                              ))}
                            </ul>
                            {inspection.notes ? (
                              <p className="mt-1.5 text-xs leading-5 text-[#68686D]">
                                <span className="font-medium text-[#1D1D1F]">Notes: </span>
                                {inspection.notes}
                              </p>
                            ) : null}
                          </div>
                          <dl className="space-y-1 text-xs">
                            <div className="flex justify-between gap-3">
                              <dt className="text-[#86868B]">Received by</dt>
                              <dd className="text-[#1D1D1F]">
                                {unit.receivedByDisplayName} ·{" "}
                                {new Date(unit.receivedAt).toLocaleDateString("en-GB", {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                })}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt className="text-[#86868B]">Activated by</dt>
                              <dd className="text-[#1D1D1F]">
                                {unit.activatedByDisplayName ?? <span className="text-[#A1A1A6]">Not yet sellable</span>}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt className="text-[#86868B]">Unit cost</dt>
                              <dd className="text-[#1D1D1F]">
                                {unit.costVisible && unit.unitCostPesewas !== null
                                  ? formatPesewas(unit.unitCostPesewas)
                                  : "Restricted"}
                              </dd>
                            </div>
                          </dl>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function UnitStatus({ unit }: { unit: OpeningStockUnit }) {
  const tone =
    unit.status === "activated"
      ? "bg-[#F0FAF3] text-[#267343]"
      : unit.status === "staged"
        ? "bg-[#FFF9EB] text-[#8A6517]"
        : "bg-[#F7F7F8] text-[#68686D]"
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", tone)}>{statusLabel[unit.status]}</span>
  )
}

/**
 * Staged units need an approved sale price before they can be sold. Activated
 * units can be repriced, which is a separate audited operation with an
 * optimistic expected-price check.
 */
function PriceCell({
  unit,
  busy,
  onActivate,
  onReprice,
  onRecordBattery,
}: {
  unit: OpeningStockUnit
  busy: boolean
  onActivate: (unitId: string, approvedPriceGhs: string) => Promise<{ ok: boolean; message?: string }>
  onReprice: (unitId: string, expectedPriceGhs: string, newPriceGhs: string, reason: string) => Promise<{ ok: boolean; message?: string }>
  onRecordBattery: (unitId: string, batteryHealth: string) => Promise<{ ok: boolean; message?: string }>
}) {
  const [error, setError] = useState("")
  const [pendingPrice, setPendingPrice] = useState<string | null>(null)

  if (unit.status === "staged" && unit.batteryHealth === null) {
    // Activation requires a measured battery, so the only meaningful action on
    // this row is recording that measurement.
    return (
      <div className="flex flex-col items-end">
        <EditableCell
          label={`Measured battery health for IMEI ${unit.imei}`}
          align="right"
          inputMode="numeric"
          value=""
          placeholder="%"
          display={<span className="text-[#8A6517]">Record battery</span>}
          editable={!busy}
          disabledReason="This membership cannot record a battery measurement."
          onSave={async (next) => {
            const result = await onRecordBattery(unit.id, next)
            if (!result.ok) setError(result.message ?? "The measurement was not accepted.")
            else setError("")
            return result
          }}
        />
        {error ? <p className="px-1.5 text-[11px] font-medium text-[#A13B34]">{error}</p> : null}
        <p className="px-1.5 text-[11px] text-[#86868B]">Measure before pricing</p>
      </div>
    )
  }

  if (unit.status === "staged") {
    return (
      <div className="flex flex-col items-end">
        <EditableCell
          label={`Approved sale price for IMEI ${unit.imei}`}
          align="right"
          inputMode="decimal"
          value=""
          placeholder="Set price"
          display={<span className="text-[#6E0728]">Set price</span>}
          editable={!busy}
          disabledReason="This membership cannot approve sale prices."
          onSave={async (next) => {
            const result = await onActivate(unit.id, next)
            if (!result.ok) setError(result.message ?? "The price was not accepted.")
            else setError("")
            return result
          }}
        />
        {error ? <p className="px-1.5 text-[11px] font-medium text-[#A13B34]">{error}</p> : null}
      </div>
    )
  }

  if (unit.status === "activated" && unit.approvedPricePesewas !== null) {
    const currentPrice = (unit.approvedPricePesewas / 100).toFixed(2)
    return (
      <div className="flex flex-col items-end">
        <EditableCell
          label={`Approved sale price for IMEI ${unit.imei}`}
          align="right"
          inputMode="decimal"
          value={currentPrice}
          display={<span className="tabular-nums">{formatPesewas(unit.approvedPricePesewas)}</span>}
          editable={!busy}
          onSave={async (next) => {
            // A price change on a sellable unit is an audited correction, so the
            // reason is collected before anything is sent to the server.
            setPendingPrice(next)
            return { ok: true }
          }}
        />
        {error ? <p className="px-1.5 text-[11px] font-medium text-[#A13B34]">{error}</p> : null}
        {pendingPrice !== null ? (
          <ReasonPopover
            title="Change approved sale price"
            description={`Current price ${formatPesewas(unit.approvedPricePesewas)}. The change is audited with your name and reason.`}
            anchor={null}
            busy={busy}
            confirmLabel="Change price"
            onCancel={() => setPendingPrice(null)}
            onConfirm={async (reason) => {
              const result = await onReprice(unit.id, currentPrice, pendingPrice, reason)
              if (result.ok) {
                setPendingPrice(null)
                setError("")
              } else {
                setError(result.message ?? "The price was not changed.")
              }
              return result
            }}
          />
        ) : null}
      </div>
    )
  }

  return <div className="px-1.5 text-right text-sm text-[#A1A1A6]">—</div>
}

const inputClass =
  "h-9 w-full rounded-lg border border-[#D8D8DC] bg-white px-2.5 text-sm outline-none focus:border-[#6E0728] focus:ring-2 focus:ring-[#6E0728]/15 aria-[invalid=true]:border-[#A13B34]"

function FieldLabel({
  htmlFor,
  error,
  children,
}: {
  htmlFor: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-[11px] font-medium text-[#68686D]">
      {children}
      {error ? <span className="ml-1 text-[#A13B34]">· {error}</span> : null}
    </label>
  )
}

function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-1 text-[11px] font-medium text-[#A13B34]">
      {children}
    </p>
  )
}
