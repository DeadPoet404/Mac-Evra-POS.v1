import { NextResponse, type NextRequest } from "next/server"

import { parseInvitationConfirmation } from "@/lib/auth/invitation"
import { authorizedPostSignInPath } from "@/lib/auth/policy"
import { resolveAccess } from "@/lib/auth/resolve"
import { createClient } from "@/lib/supabase/server"

function invalidInvitation(request: NextRequest) {
  return NextResponse.redirect(new URL("/?error=invalid-invitation", request.url))
}

export async function GET(request: NextRequest) {
  const confirmation = parseInvitationConfirmation(request.nextUrl.searchParams)
  if (!confirmation) return invalidInvitation(request)

  const supabase = await createClient()
  const { error: verificationError } = await supabase.auth.verifyOtp({
    token_hash: confirmation.tokenHash,
    type: confirmation.type,
  })
  if (verificationError) return invalidInvitation(request)

  const { data, error: acceptanceError } = await supabase.rpc("accept_staff_invitation", {
    p_invitation_id: confirmation.invitationId,
    p_acceptance_token: confirmation.acceptanceToken,
  })

  if (acceptanceError || !Array.isArray(data) || data.length !== 1) {
    await supabase.auth.signOut({ scope: "local" })
    return invalidInvitation(request)
  }

  if (confirmation.type === "invite") {
    return NextResponse.redirect(new URL("/auth/set-password", request.url))
  }

  try {
    const access = await resolveAccess(supabase)
    const destination = authorizedPostSignInPath(access, null)
    if (destination) return NextResponse.redirect(new URL(destination, request.url))
  } catch {
    // Fail closed below without returning provider or database details.
  }

  await supabase.auth.signOut({ scope: "local" })
  return invalidInvitation(request)
}
