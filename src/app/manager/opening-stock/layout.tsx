import { requirePermissions } from "@/lib/auth/server"

export default async function OpeningStockLayout({ children }: { children: React.ReactNode }) {
  await requirePermissions(["access_manager_workspace", "manage_inventory"], {
    nextPath: "/manager/opening-stock",
  })
  return children
}
