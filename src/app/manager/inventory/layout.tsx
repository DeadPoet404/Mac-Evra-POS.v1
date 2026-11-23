import { requirePermissions } from "@/lib/auth/server"

export default async function ManagerInventoryLayout({ children }: { children: React.ReactNode }) {
  await requirePermissions(["access_manager_workspace", "manage_inventory"], { nextPath: "/manager/inventory" })
  return children
}
