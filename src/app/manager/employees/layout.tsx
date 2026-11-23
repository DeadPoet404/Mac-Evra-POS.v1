import { requirePermissions } from "@/lib/auth/server"

export default async function ManagerEmployeesLayout({ children }: { children: React.ReactNode }) {
  await requirePermissions(["access_manager_workspace", "manage_employee_access"], { nextPath: "/manager/employees" })
  return children
}
