import { requirePermissions } from "@/lib/auth/server"
import { EmployeePlaceholder } from "@/components/employee/employee-placeholder"

export default async function HomePage() {
  await requirePermissions(["access_employee_workspace"], { nextPath: "/home" })
  return <EmployeePlaceholder activeTab="home" />
}
