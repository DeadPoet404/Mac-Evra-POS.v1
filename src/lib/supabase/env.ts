type SupabasePublicEnvironment = {
  url: string
  publishableKey: string
}

type SupabaseAdminEnvironment = SupabasePublicEnvironment & {
  serviceRoleKey: string
}

export function getSupabasePublicEnvironment(): SupabasePublicEnvironment {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url || !publishableKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY."
    )
  }

  return { url, publishableKey }
}

/** Server-only callers must keep this result out of props, logs, and responses. */
export function getSupabaseAdminEnvironment(): SupabaseAdminEnvironment {
  const publicEnvironment = getSupabasePublicEnvironment()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey) {
    throw new Error("Supabase administrative access is not configured on the server.")
  }

  return { ...publicEnvironment, serviceRoleKey }
}
