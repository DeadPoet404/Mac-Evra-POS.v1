"use client"

import { useMemo, useState } from "react"
import type { DeviceModelCatalogEntry } from "@/lib/opening-stock-server"

function formatStorage(storageGb: number) {
  return storageGb >= 1024 && storageGb % 1024 === 0 ? `${storageGb / 1024}TB` : `${storageGb}GB`
}

export function ModelSelector({
  deviceModels,
  inputClass,
}: {
  deviceModels: DeviceModelCatalogEntry[]
  inputClass: string
}) {
  const [query, setQuery] = useState("")
  const [selectedDeviceModelId, setSelectedDeviceModelId] = useState(deviceModels[0]?.id ?? "")

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) return deviceModels
    return deviceModels.filter((entry) => {
      const label = `${entry.modelName} ${entry.storageGb}gb ${formatStorage(entry.storageGb)}`.toLowerCase()
      return label.includes(trimmed)
    })
  }, [deviceModels, query])

  const activeSelection = filtered.some((entry) => entry.id === selectedDeviceModelId)
    ? selectedDeviceModelId
    : (filtered[0]?.id ?? "")
  const selectedEntry = deviceModels.find((entry) => entry.id === activeSelection) ?? null

  return (
    <div className="space-y-2">
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search model or storage (e.g. 15 Pro, 256GB, SE)"
        aria-label="Search registered iPhone models"
        className={inputClass}
      />
      <select
        name="deviceModelId"
        required
        disabled={!filtered.length}
        value={activeSelection}
        onChange={(event) => setSelectedDeviceModelId(event.target.value)}
        className={inputClass}
      >
        {!filtered.length ? (
          <option value="">No matching model</option>
        ) : (
          filtered.map((model) => (
            <option key={model.id} value={model.id}>
              {model.modelName} · {formatStorage(model.storageGb)}
            </option>
          ))
        )}
      </select>
      <input type="hidden" name="modelCatalogueId" value={selectedEntry?.catalogueId ?? selectedEntry?.id ?? ""} />
    </div>
  )
}
