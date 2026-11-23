import "server-only"

import { cache } from "react"
import { redirect } from "next/navigation"

import {
  membershipWithPermissions,
  safeInternalPath,
  type AccessSnapshot,
  type AuthorizedMembership,
  type PermissionCode,
} from "@/lib/auth/policy"
import { resolveAccess } from "@/lib/auth/resolve"
import { createClient } from "@/lib/supabase/server"

export const getCurrentAccess = cache(async (): Promise<AccessSnapshot> => {
  const supabase = await createClient()
  return resolveAccess(supabase)
})

export async function requirePermissions(
  permissions: readonly PermissionCode[],
  options: { nextPath: string; storeId?: string } = { nextPath: "/home" }
): Promise<{ access: AccessSnapshot; membership: AuthorizedMembership }> {
  const access = await getCurrentAccess()

  if (access.state === "anonymous") {
    redirect(`/?next=${encodeURIComponent(safeInternalPath(options.nextPath))}`)
  }

  if (access.state !== "active") {
    redirect("/?error=inactive")
  }

  const membership = membershipWithPermissions(access, permissions, options.storeId)
  if (!membership) {
    if (options.nextPath === "/home") redirect("/?error=access-denied")
    redirect("/home?notice=access-denied")
  }

  return { access, membership }
}
