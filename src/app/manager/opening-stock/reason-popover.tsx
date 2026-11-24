"use client"

import { useEffect, useId, useRef, useState } from "react"
import { LoaderCircle, X } from "lucide-react"

/**
 * Small contextual reason prompt for an audited correction.
 *
 * Deliberately not a modal: it opens next to the value that is changing, keeps
 * the surrounding table readable, and can be dismissed without losing the
 * attempted value (the caller keeps it and re-opens with it intact).
 *
 * The reason is a hard requirement of the audited RPC, so this cannot be
 * skipped — but it is one short field instead of a separate page or a large
 * correction form.
 */
/** Viewport-clamped placement below an anchor element, or null when unpinned. */
function measureAnchor(anchor: HTMLElement | null) {
  if (!anchor) return null
  const rect = anchor.getBoundingClientRect()
  const width = 320
  const height = 200
  return {
    top: Math.max(8, Math.min(rect.bottom + window.scrollY + 6, window.scrollY + window.innerHeight - height)),
    left: Math.max(12, Math.min(rect.left + window.scrollX, window.scrollX + window.innerWidth - width - 12)),
  }
}

export function ReasonPopover({
  title,
  description,
  anchor,
  busy = false,
  minLength = 5,
  maxLength = 500,
  confirmLabel = "Record correction",
  onConfirm,
  onCancel,
}: {
  title: string
  description?: string
  anchor: HTMLElement | null
  busy?: boolean
  minLength?: number
  maxLength?: number
  confirmLabel?: string
  onConfirm: (reason: string) => Promise<{ ok: boolean; message?: string }>
  onCancel: () => void
}) {
  const [reason, setReason] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const errorId = useId()

  // Position under the cell that triggered it, clamped to the viewport so the
  // prompt never opens off-screen on a small device. Resolved once on mount
  // (the popover only exists while a correction is pending) and then kept in
  // place by writing styles directly, which keeps this effect free of state.
  const [position] = useState(() => measureAnchor(anchor))
  const placed = Boolean(position)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!position) return
    function reposition() {
      const next = measureAnchor(anchor)
      const panel = panelRef.current
      if (!next || !panel) return
      panel.style.top = `${next.top}px`
      panel.style.left = `${next.left}px`
    }
    window.addEventListener("scroll", reposition, { passive: true })
    window.addEventListener("resize", reposition)
    return () => {
      window.removeEventListener("scroll", reposition)
      window.removeEventListener("resize", reposition)
    }
  }, [anchor, position])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault()
        onCancel()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [onCancel])

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) onCancel()
    }
    document.addEventListener("mousedown", onPointerDown)
    return () => document.removeEventListener("mousedown", onPointerDown)
  }, [onCancel])

  const trimmed = reason.trim()
  const tooShort = trimmed.length > 0 && trimmed.length < minLength

  async function submit() {
    if (saving) return
    if (trimmed.length < minLength) {
      setError(`Give a reason of at least ${minLength} characters so the change can be audited.`)
      return
    }
    setSaving(true)
    setError("")
    const result = await onConfirm(trimmed)
    setSaving(false)
    if (!result.ok) setError(result.message ?? "The correction was not recorded.")
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-transparent" aria-hidden="true" onClick={onCancel} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="false"
        aria-label={title}
        style={position ? { top: position.top, left: position.left, width: 320 } : undefined}
        className={
          placed
            ? "absolute z-50 rounded-xl border border-[#E2D2D8] bg-white p-3 shadow-[0_12px_32px_rgba(29,29,31,0.14)]"
            : "fixed left-1/2 top-1/3 z-50 w-80 -translate-x-1/2 rounded-xl border border-[#E2D2D8] bg-white p-3 shadow-[0_12px_32px_rgba(29,29,31,0.14)]"
        }
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-[#1D1D1F]">{title}</p>
            {description ? <p className="mt-1 text-[11px] leading-4 text-[#86868B]">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel correction"
            className="flex size-6 shrink-0 items-center justify-center rounded text-[#86868B] hover:bg-[#F7F7F8]"
          >
            <X className="size-3.5" />
          </button>
        </div>

        <label className="mt-2 block">
          <span className="mb-1 block text-[11px] font-medium text-[#68686D]">
            Reason <span className="text-[#A13B34]">*</span>
          </span>
          <textarea
            ref={inputRef}
            value={reason}
            rows={2}
            maxLength={maxLength}
            aria-label="Correction reason"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => {
              setReason(event.target.value)
              setError("")
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                void submit()
              }
            }}
            placeholder="e.g. Supplier issued a revised invoice"
            className="w-full resize-none rounded-lg border border-[#D8D8DC] bg-white px-2 py-1.5 text-sm outline-none focus:border-[#6E0728] focus:ring-2 focus:ring-[#6E0728]/15"
          />
        </label>

        {tooShort ? (
          <p className="mt-1 text-[11px] text-[#8A6517]">At least {minLength} characters.</p>
        ) : null}
        {error ? (
          <p id={errorId} role="alert" className="mt-1 text-[11px] font-medium text-[#A13B34]">
            {error}
          </p>
        ) : null}

        <div className="mt-2 flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#68686D] hover:bg-[#F7F7F8]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving || busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#6E0728] px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[#57051F] disabled:opacity-60"
          >
            {saving ? <LoaderCircle className="size-3 animate-spin" aria-hidden="true" /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  )
}
