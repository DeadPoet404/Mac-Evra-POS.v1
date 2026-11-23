import "server-only"

import { createClient as createSupabaseClient } from "@supabase/supabase-js"

import { getSupabaseAdminEnvironment } from "@/lib/supabase/env"

/**
 * Administrative Auth client for trusted server operations only. Never import
 * this module from a Client Component or expose its credential in responses.
 */
export function createAdminClient() {
  const { url, serviceRoleKey } = getSupabaseAdminEnvironment()

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  })
}
