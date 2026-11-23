import { HomeClient } from "@/app/home/home-client"
import { requirePermissions } from "@/lib/auth/server"

export default async function HomePage() {
  const { access } = await requirePermissions(["access_employee_workspace"], { nextPath: "/home" })
  return <HomeClient displayName={access.displayName ?? "Team member"} />
}
