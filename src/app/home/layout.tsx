import { requirePermissions } from "@/lib/auth/server"

export default async function HomeLayout({ children }: { children: React.ReactNode }) {
  await requirePermissions(["access_employee_workspace"], { nextPath: "/home" })
  return children
}
