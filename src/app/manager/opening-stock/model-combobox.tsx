"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { Check, ChevronDown, Search } from "lucide-react"

import type { DeviceModelCatalogEntry } from "@/lib/opening-stock-server"
import { cn } from "@/lib/utils"

export function formatStorage(storageGb: number) {
  return storageGb >= 1024 && storageGb % 1024 === 0 ? `${storageGb / 1024}TB` : `${storageGb}GB`
}

/**
 * Searchable catalogue picker.
 *
 * Replaces the old two-step "type in a search box, then pick from a native
 * select" control. Keyboard: type to filter, ArrowUp/ArrowDown to move,
 * Enter to choose, Escape to close. Selecting a storage is a property of the
 * catalogue entry, so model and storage are always chosen together and can never
 * disagree — the RPC receives one catalogue id.
 */
export function ModelCombobox({
  deviceModels,
  value,
  onSelect,
  disabled = false,
  invalid = false,
  describedBy,
}: {
  deviceModels: readonly DeviceModelCatalogEntry[]
  value: string | null
  onSelect: (entry: DeviceModelCatalogEntry) => void
  disabled?: boolean
  invalid?: boolean
  describedBy?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listId = useId()

  const selected = deviceModels.find((entry) => entry.id === value) ?? null

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) return deviceModels
    return deviceModels.filter((entry) =>
      `${entry.modelName} ${entry.storageGb}gb ${formatStorage(entry.storageGb)}`.toLowerCase().includes(trimmed)
    )
  }, [deviceModels, query])

  useEffect(() => {
    if (!open) return
    searchRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    return () => document.removeEventListener("mousedown", onPointerDown)
  }, [open])

  function choose(entry: DeviceModelCatalogEntry) {
    onSelect(entry)
    setOpen(false)
    setQuery("")
    setActiveIndex(0)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen((current) => !current)
          setQuery("")
          setActiveIndex(0)
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-describedby={describedBy}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-lg border bg-white px-2.5 text-left text-sm outline-none transition",
          "focus:border-[#6E0728] focus:ring-2 focus:ring-[#6E0728]/15 disabled:cursor-not-allowed disabled:bg-[#F7F7F8] disabled:text-[#86868B]",
          invalid ? "border-[#A13B34]" : "border-[#D8D8DC]"
        )}
      >
        <span className={cn("truncate", !selected && "text-[#86868B]")}>
          {selected ? (
            <>
              {selected.modelName}
              <span className="ml-1.5 text-xs text-[#86868B]">{formatStorage(selected.storageGb)}</span>
            </>
          ) : (
            "Select model"
          )}
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-[#A1A1A6]" aria-hidden="true" />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-lg border border-[#E8E8ED] bg-white shadow-[0_8px_24px_rgba(29,29,31,0.10)]">
          <div className="relative border-b border-[#F0F0F2]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#A1A1A6]" aria-hidden="true" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setActiveIndex(0)
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault()
                  setActiveIndex((index) => Math.min(index + 1, filtered.length - 1))
                } else if (event.key === "ArrowUp") {
                  event.preventDefault()
                  setActiveIndex((index) => Math.max(index - 1, 0))
                } else if (event.key === "Enter") {
                  event.preventDefault()
                  const entry = filtered[activeIndex]
                  if (entry) choose(entry)
                } else if (event.key === "Escape") {
                  event.preventDefault()
                  setOpen(false)
                }
              }}
              placeholder="Search model or storage"
              aria-label="Search the iPhone model catalogue"
              aria-controls={listId}
              className="h-9 w-full border-0 bg-white pl-8 pr-2 text-sm outline-none placeholder:text-[#A1A1A6]"
            />
          </div>
          <ul id={listId} role="listbox" className="max-h-56 overflow-y-auto py-1">
            {filtered.length ? (
              filtered.map((entry, index) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={entry.id === value}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose(entry)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm",
                      index === activeIndex ? "bg-[#F7EDF0]" : "bg-white",
                      entry.id === value && "font-medium text-[#6E0728]"
                    )}
                  >
                    <span className="truncate">{entry.modelName}</span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-[#86868B]">
                      {formatStorage(entry.storageGb)}
                      {entry.id === value ? <Check className="size-3.5 text-[#6E0728]" aria-hidden="true" /> : null}
                    </span>
                  </button>
                </li>
              ))
            ) : (
              <li className="px-3 py-3 text-xs leading-5 text-[#86868B]">
                No catalogue model matches “{query}”. Add it to the catalogue first.
              </li>
            )}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
