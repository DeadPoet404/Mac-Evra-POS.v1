"use client"

import { useRef, useState } from "react"
import { Plus, Trash2 } from "lucide-react"

import { openingStockConditions, openingStockInspectionChecks } from "@/lib/opening-stock"

const inputClass = "h-10 w-full rounded-lg border border-input bg-white px-3 text-sm outline-none focus:border-[#6E0728]"
const labelClass = "space-y-1.5 text-xs font-medium text-[#68686D]"
const buttonClass = "h-10 rounded-full bg-[#6E0728] px-5 text-sm font-semibold text-white hover:bg-[#57051F]"

export type BatchReceivingLine = {
  id: string
  label: string
}

export function BatchReceivingForm({
  action,
  lines,
}: {
  action: (formData: FormData) => void | Promise<void>
  lines: readonly BatchReceivingLine[]
}) {
  const [rows, setRows] = useState<number[]>([0])
  const nextId = useRef(1)

  function addRow() {
    setRows((current) => {
      if (current.length >= 100) return current
      return [...current, nextId.current++]
    })
  }

  function removeRow(id: number) {
    setRows((current) => (current.length === 1 ? current : current.filter((row) => row !== id)))
  }

  return (
    <form action={action} className="space-y-3 rounded-2xl bg-[#FAFAFB] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Receive a batch</h3>
          <p className="mt-1 text-xs leading-5 text-[#86868B]">Every numbered device has its own colour, condition, battery health, and inspection attestation.</p>
        </div>
        <button
          type="button"
          onClick={addRow}
          disabled={rows.length >= 100 || !lines.length}
          className="inline-flex h-9 items-center gap-1 rounded-full border border-[#D8C4CB] px-3 text-xs font-semibold text-[#6E0728] disabled:opacity-50"
        >
          <Plus size={14} /> Add device
        </button>
      </div>

      <input type="hidden" name="deviceCount" value={rows.length} />
      <label className={labelClass}>
        <span>Invoice line</span>
        <select name="lineId" required disabled={!lines.length} className={inputClass}>
          {lines.map((line) => <option key={line.id} value={line.id}>{line.label}</option>)}
        </select>
      </label>

      <div className="max-h-[42rem] space-y-3 overflow-y-auto pr-1">
        {rows.map((rowId, index) => (
          <fieldset key={rowId} className="space-y-3 rounded-2xl border border-[#E8E8ED] bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#86868B]">Device {index + 1}</p>
              <button
                type="button"
                onClick={() => removeRow(rowId)}
                disabled={rows.length === 1}
                aria-label={`Remove device ${index + 1}`}
                className="text-[#A1A1A6] hover:text-[#6E0728] disabled:opacity-40"
              >
                <Trash2 size={15} />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={labelClass}>
                <span>IMEI · 15 digits</span>
                <input name={`devices.${index}.imei`} required inputMode="numeric" maxLength={20} placeholder="357000000000017" className={inputClass} />
              </label>
              <label className={labelClass}>
                <span>Colour</span>
                <input name={`devices.${index}.colour`} required maxLength={60} placeholder="Natural Titanium" className={inputClass} />
              </label>
              <label className={labelClass}>
                <span>Condition</span>
                <select name={`devices.${index}.condition`} required defaultValue="" className={inputClass}>
                  <option value="" disabled>Select condition</option>
                  {openingStockConditions.map((condition) => (
                    <option key={condition} value={condition}>{condition[0].toUpperCase() + condition.slice(1)}</option>
                  ))}
                </select>
              </label>
              <label className={labelClass}>
                <span>Battery health · %</span>
                <input name={`devices.${index}.batteryHealth`} required type="number" min={1} max={100} placeholder="Actual %" className={inputClass} />
              </label>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-[#424245]">Inspection attestation for this device</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {openingStockInspectionChecks.map((check) => (
                  <label key={check.name} htmlFor={`device-${rowId}-${check.name}`} className="flex items-start gap-2 rounded-xl bg-[#FAFAFB] p-3 text-xs leading-5 text-[#424245]">
                    <input id={`device-${rowId}-${check.name}`} type="checkbox" name={`devices.${index}.${check.name}`} required className="mt-0.5 size-4 accent-[#6E0728]" />
                    <span>{check.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <label className={labelClass}>
              <span>Inspection notes · optional</span>
              <input name={`devices.${index}.inspectionNotes`} maxLength={500} className={inputClass} />
            </label>
          </fieldset>
        ))}
      </div>

      <button type="submit" disabled={!lines.length} className={`${buttonClass} w-full disabled:opacity-50`}>
        Receive {rows.length} inspected device{rows.length === 1 ? "" : "s"} atomically
      </button>
    </form>
  )
}
