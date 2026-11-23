import { requirePermissions } from "@/lib/auth/server"

export default async function ManagerSalesLayout({ children }: { children: React.ReactNode }) {
  await requirePermissions(["access_manager_workspace"], { nextPath: "/manager/sales" })
  return children
}
