"use client"

import { createBrowserClient } from "@supabase/ssr"

import { getSupabasePublicEnvironment } from "@/lib/supabase/env"

let browserClient: ReturnType<typeof createBrowserClient> | undefined

export function createClient() {
  const { url, publishableKey } = getSupabasePublicEnvironment()

  browserClient ??= createBrowserClient(url, publishableKey)
  return browserClient
}
