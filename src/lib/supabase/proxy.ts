import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { evaluateRouteAccess, routeRequirement } from "@/lib/auth/policy"
import { anonymousAccess, resolveAccessForUser } from "@/lib/auth/resolve"
import { getSupabasePublicEnvironment } from "@/lib/supabase/env"

function responseWithSessionCookies(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie))
  return target
}

export async function updateSession(request: NextRequest) {
  const { url, publishableKey } = getSupabasePublicEnvironment()
  let response = NextResponse.next({ request })

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        )
      },
    },
  })

  // getUser validates the access token with Supabase Auth and refreshes through
  // the cookie adapter when needed. A cookie value by itself is never trusted.
  const { data, error } = await supabase.auth.getUser()
  const requirement = routeRequirement(request.nextUrl.pathname)
  const needsAuthorization = requirement.protected || request.nextUrl.pathname === "/"

  if (!needsAuthorization) return response

  let access = anonymousAccess
  if (!error && data.user) {
    try {
      access = await resolveAccessForUser(supabase, data.user)
    } catch {
      if (requirement.protected) {
        const unavailable = NextResponse.redirect(new URL("/?error=unavailable", request.url))
        return responseWithSessionCookies(response, unavailable)
      }
    }
  }

  const decision = evaluateRouteAccess(request.nextUrl.pathname, access)
  if (decision.kind === "allow") return response

  const redirectResponse = NextResponse.redirect(new URL(decision.location, request.url))
  return responseWithSessionCookies(response, redirectResponse)
}
