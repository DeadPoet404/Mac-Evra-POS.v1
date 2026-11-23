import { ManagerShell } from "@/components/manager/manager-shell"
import { requirePermissions } from "@/lib/auth/server"

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const { access, membership } = await requirePermissions(["access_manager_workspace"], {
    nextPath: "/manager",
  })

  return (
    <ManagerShell
      account={{
        displayName: access.displayName ?? "Team member",
        roleName: membership.roleName,
        storeName: membership.storeName,
      }}
    >
      {children}
    </ManagerShell>
  )
}
