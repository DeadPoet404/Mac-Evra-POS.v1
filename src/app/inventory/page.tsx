import { requirePermissions } from "@/lib/auth/server"
import { EmployeePlaceholder } from "@/components/employee/employee-placeholder"

export default async function EmployeeInventoryPage() {
  await requirePermissions(["access_employee_workspace"], { nextPath: "/inventory" })
  return <EmployeePlaceholder activeTab="inventory" />
}
