import { type EmailOtpType } from "@supabase/supabase-js"
import { NextResponse, type NextRequest } from "next/server"

import { createClient } from "@/lib/supabase/server"

const allowedTypes = new Set<EmailOtpType>(["invite", "signup", "recovery", "email"])

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash")
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null

  if (!tokenHash || !type || !allowedTypes.has(type)) {
    return NextResponse.redirect(new URL("/?error=invalid-invitation", request.url))
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
  if (error) {
    return NextResponse.redirect(new URL("/?error=invalid-invitation", request.url))
  }

  return NextResponse.redirect(new URL("/auth/set-password", request.url))
}
