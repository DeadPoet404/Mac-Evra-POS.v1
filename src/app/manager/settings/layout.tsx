import { requirePermissions } from "@/lib/auth/server"

export default async function ManagerSettingsLayout({ children }: { children: React.ReactNode }) {
  await requirePermissions(["access_manager_workspace", "manage_store_settings"], { nextPath: "/manager/settings" })
  return children
}
