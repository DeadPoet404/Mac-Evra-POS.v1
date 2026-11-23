import { requirePermissions } from "@/lib/auth/server"

export default async function InventoryLayout({ children }: { children: React.ReactNode }) {
  await requirePermissions(["access_employee_workspace"], { nextPath: "/inventory" })
  return children
}
