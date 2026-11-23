import { requirePermissions } from "@/lib/auth/server"

export default async function ManagerReportsLayout({ children }: { children: React.ReactNode }) {
  await requirePermissions(["access_manager_workspace", "view_reports"], { nextPath: "/manager/reports" })
  return children
}
