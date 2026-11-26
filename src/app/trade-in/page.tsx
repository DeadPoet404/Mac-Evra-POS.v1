import { requirePermissions } from "@/lib/auth/server"
import { EmployeePlaceholder } from "@/components/employee/employee-placeholder"

export default async function TradeInPage() {
  await requirePermissions(["access_employee_workspace"], { nextPath: "/trade-in" })
  return <EmployeePlaceholder activeTab="swap" />
}
