"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Check, LoaderCircle, Pencil, X } from "lucide-react"

import { cn } from "@/lib/utils"

import { clearDraft, registerDraft } from "./draft-guard"

export type InlineSaveState = "idle" | "saving" | "saved"

/** Module-scope hook so a save can focus the next cell in document order. */
const cellRegistry = new Map<string, HTMLElement>()

export function registerFocusableCell(key: string, element: HTMLElement | null) {
  if (element) cellRegistry.set(key, element)
  else cellRegistry.delete(key)
}

export function focusCell(key: string | null) {
  if (!key) return false
  const element = cellRegistry.get(key)
  if (!element) return false
  element.focus()
  return true
}

/**
 * One editable table cell.
 *
 * Behaviour contract:
 *  - Read mode shows the value plus a small pencil affordance.
 *  - Clicking the value, the pencil, or pressing Enter on the focused cell
 *    activates editing.
 *  - Enter saves. Escape reverts and leaves read mode. Tab saves and moves on.
 *  - While saving, the cell is busy and the input is locked.
 *  - A rejected save keeps the attempted value on screen so nothing is lost.
 *
 * `onSave` is responsible for the network call and for returning a result. The
 * cell never mutates local business state itself; the parent re-renders from the
 * authoritative value once the server confirms, which keeps this component free
 * of any way to desynchronise a financial value from the database.
 */
export function EditableCell({
  value,
  display,
  onSave,
  editable = true,
  label,
  align = "left",
  type = "text",
  inputMode,
  placeholder,
  className,
  disabledReason,
  cellKey,
  onRegisterCell,
  onActivate,
  onRequestSave,
  nextCellKey = null,
}: {
  value: string
  display?: React.ReactNode
  onSave: (next: string) => Promise<{ ok: boolean; message?: string }>
  editable?: boolean
  label: string
  align?: "left" | "right"
  type?: "text" | "number" | "date"
  inputMode?: "text" | "numeric" | "decimal"
  placeholder?: string
  className?: string
  disabledReason?: string
  cellKey?: string
  onRegisterCell?: (key: string, el: HTMLElement | null) => void
  onActivate?: (key: string) => void
  onRequestSave?: (key: string, next: string) => void
  /** Key of the cell to focus after a successful Tab-save, in document order. */
  nextCellKey?: string | null
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [justSaved, setJustSaved] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const errorId = useId()
  const draftKey = cellKey ? `${label}:${cellKey}` : label

  // Adopt the authoritative value whenever the row is not mid-edit, so a server
  // refresh can never be masked by stale local text. Derived rather than copied
  // into an effect, so an idle cell can never hold a stale draft.
  const [draftBase, setDraftBase] = useState(value)
  if (!editing && draftBase !== value) {
    setDraftBase(value)
    if (draft !== value) setDraft(value)
  }

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  // Register the open draft so the workspace can refuse to navigate away from
  // it, and always clear it on unmount so a torn-down tab cannot stay "dirty".
  useEffect(() => {
    if (editing && draft !== value) registerDraft(draftKey, `${label}: ${draft}`)
    else clearDraft(draftKey)
  }, [draft, draftKey, editing, label, value])

  useEffect(() => {
    // Cleanup on unmount (or a changed key) so the workspace never believes a
    // dismantled table still holds an unsaved edit.
    return () => clearDraft(draftKey)
  }, [draftKey])

  useEffect(() => {
    if (!onRegisterCell || !cellKey) return
    onRegisterCell(cellKey, wrapperRef.current)
    return () => onRegisterCell(cellKey, null)
  }, [cellKey, onRegisterCell])

  useEffect(() => {
    if (!cellKey) return
    registerFocusableCell(cellKey, wrapperRef.current)
    return () => registerFocusableCell(cellKey, null)
  }, [cellKey])

  function startEditing() {
    if (!editable || saving) return
    setDraft(value)
    setError("")
    setEditing(true)
    if (cellKey) onActivate?.(cellKey)
  }

  function cancel() {
    setDraft(value)
    setError("")
    setEditing(false)
    wrapperRef.current?.focus()
  }

  async function commit(moveNext: boolean) {
    if (saving) return
    const next = draft
    if (next === value) {
      setEditing(false)
      setError("")
      if (moveNext && cellKey) onRequestSave?.(cellKey, next)
      if (moveNext) focusCell(nextCellKey)
      return
    }
    setSaving(true)
    setError("")
    const result = await onSave(next)
    setSaving(false)
    if (result.ok) {
      setEditing(false)
      // The tick is cleared from the save handler, not from an effect.
      setJustSaved(true)
      window.setTimeout(() => setJustSaved(false), 2000)
      if (moveNext && cellKey) onRequestSave?.(cellKey, next)
      if (moveNext) focusCell(nextCellKey ?? null)
    } else {
      // Keep the attempted value and the error beside the field.
      setError(result.message ?? "That value was not accepted.")
    }
  }

  return (
    <div
      ref={wrapperRef}
      tabIndex={editable ? 0 : -1}
      role={editable ? "button" : undefined}
      aria-label={editable ? `${label}: ${value || "empty"}. Activate to edit.` : undefined}
      aria-disabled={!editable}
      data-cell-key={cellKey}
      onKeyDown={(event) => {
        if (editing) return
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          startEditing()
        }
      }}
      onClick={(event) => {
        // Let an in-progress edit keep focus on the input.
        if (editing) event.stopPropagation()
      }}
      className={cn(
        "group/cell relative flex min-h-9 items-center gap-1 rounded-md px-1.5 py-1 outline-none transition",
        editable && "cursor-text focus-visible:ring-2 focus-visible:ring-[#6E0728]/25 hover:bg-[#F7F7F8]",
        align === "right" && "justify-end text-right",
        error && "bg-[#FCF4F6]",
        className
      )}
    >
      {editing ? (
        <div className="flex w-full items-center gap-1">
          <input
            ref={inputRef}
            type={type}
            inputMode={inputMode}
            value={draft}
            placeholder={placeholder}
            aria-label={label}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            disabled={saving}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                void commit(false)
              } else if (event.key === "Escape") {
                event.preventDefault()
                cancel()
              } else if (event.key === "Tab") {
                event.preventDefault()
                void commit(true)
              }
            }}
            className={cn(
              "min-w-0 flex-1 rounded-md border bg-white px-2 py-1 text-sm text-[#1D1D1F] outline-none",
              "focus:ring-2 focus:ring-[#6E0728]/20",
              error ? "border-[#A13B34]" : "border-[#D8D8DC] focus:border-[#6E0728]",
              align === "right" && "text-right"
            )}
          />
          <button
            type="button"
            onClick={() => void commit(false)}
            disabled={saving}
            aria-label="Save"
            className="flex size-6 shrink-0 items-center justify-center rounded text-[#267343] hover:bg-[#F0FAF3] disabled:opacity-40"
          >
            {saving ? <LoaderCircle className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={saving}
            aria-label="Cancel edit"
            className="flex size-6 shrink-0 items-center justify-center rounded text-[#86868B] hover:bg-[#F7F7F8] disabled:opacity-40"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <>
          <span className="min-w-0 truncate">
            {display ?? (value || <span className="text-[#A1A1A6]">—</span>)}
          </span>
          {editable ? (
            <span
              aria-hidden="true"
              className="ml-auto shrink-0 text-[#A1A1A6] opacity-0 transition group-hover/cell:opacity-100 group-focus-visible/cell:opacity-100"
            >
              {saving ? <LoaderCircle className="size-3 animate-spin" /> : <Pencil className="size-3" />}
            </span>
          ) : null}
          {justSaved ? (
            <span role="status" className="ml-1 shrink-0 text-[#267343]">
              <Check className="size-3" aria-hidden="true" />
              <span className="sr-only">Saved</span>
            </span>
          ) : null}
        </>
      )}

      {error ? (
        <p
          id={errorId}
          role="alert"
          className="absolute left-1 top-full z-20 mt-0.5 w-max max-w-[16rem] rounded-md bg-[#A13B34] px-2 py-1 text-[11px] font-medium leading-4 text-white shadow-sm"
        >
          {error}
        </p>
      ) : null}
      {!editable && disabledReason ? (
        <span className="sr-only">{disabledReason}</span>
      ) : null}
    </div>
  )
}

/** A read-only cell with identical geometry, so columns line up. */
export function StaticCell({
  children,
  align = "left",
  className,
  muted = false,
}: {
  children: React.ReactNode
  align?: "left" | "right"
  className?: string
  muted?: boolean
}) {
  return (
    <div
      className={cn(
        "flex min-h-9 items-center px-1.5 py-1 text-sm",
        align === "right" && "justify-end text-right",
        muted ? "text-[#86868B]" : "text-[#1D1D1F]",
        className
      )}
    >
      <span className="min-w-0 truncate">{children}</span>
    </div>
  )
}
