/** Client-safe status helpers shared by live manager inventory views and tests. */
export type PersistentInventoryStatus = "available" | "reserved" | "sold"

export type InventoryStatusSummary = {
  available: number
  reserved: number
  sold: number
  total: number
}

export function summarizeInventoryStatuses(
  statuses: readonly PersistentInventoryStatus[]
): InventoryStatusSummary {
  return statuses.reduce<InventoryStatusSummary>(
    (summary, status) => {
      if (status === "available") summary.available += 1
      else if (status === "reserved") summary.reserved += 1
      else if (status === "sold") summary.sold += 1
      summary.total += 1
      return summary
    },
    { available: 0, reserved: 0, sold: 0, total: 0 }
  )
}

export function inventoryStatusLabel(status: PersistentInventoryStatus) {
  return status[0].toUpperCase() + status.slice(1)
}
