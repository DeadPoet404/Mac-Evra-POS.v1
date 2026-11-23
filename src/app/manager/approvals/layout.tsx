import { requirePermissions } from "@/lib/auth/server"

export default async function ManagerApprovalsLayout({ children }: { children: React.ReactNode }) {
  await requirePermissions(["access_manager_workspace", "review_approvals"], { nextPath: "/manager/approvals" })
  return children
}
