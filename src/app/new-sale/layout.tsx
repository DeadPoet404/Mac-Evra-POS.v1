import { requirePermissions } from "@/lib/auth/server"

export default async function NewSaleLayout({ children }: { children: React.ReactNode }) {
  await requirePermissions(["access_employee_workspace", "create_sales"], { nextPath: "/new-sale" })
  return children
}
