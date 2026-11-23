import type { EmailOtpType } from "@supabase/supabase-js"

export type InvitationConfirmation = {
  invitationId: string
  acceptanceToken: string
  tokenHash: string
  type: "invite" | "magiclink"
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const acceptanceTokenPattern = /^[0-9a-f]{64}$/i
const allowedOtpTypes = new Set<EmailOtpType>(["invite", "magiclink"])

function validApplicationUrl(value: string) {
  const url = new URL(value)
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Staff invitation delivery is not configured.")
  }
  return url
}

export function invitationConfirmationUrl(
  appUrl: string,
  invitationId: string,
  acceptanceToken: string
) {
  if (!uuidPattern.test(invitationId) || !acceptanceTokenPattern.test(acceptanceToken)) {
    throw new Error("The staff invitation could not be prepared.")
  }

  const url = new URL("/auth/confirm", validApplicationUrl(appUrl))
  url.searchParams.set("invitation_id", invitationId)
  url.searchParams.set("acceptance_token", acceptanceToken)
  return url.toString()
}

export function parseInvitationConfirmation(searchParams: URLSearchParams): InvitationConfirmation | null {
  const invitationId = searchParams.get("invitation_id")
  const acceptanceToken = searchParams.get("acceptance_token")
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null

  if (
    !invitationId ||
    !uuidPattern.test(invitationId) ||
    !acceptanceToken ||
    !acceptanceTokenPattern.test(acceptanceToken) ||
    !tokenHash ||
    tokenHash.length > 2048 ||
    !type ||
    !allowedOtpTypes.has(type)
  ) {
    return null
  }

  return {
    invitationId,
    acceptanceToken,
    tokenHash,
    type: type as "invite" | "magiclink",
  }
}

export function isExistingAuthUserError(error: unknown) {
  if (typeof error !== "object" || error === null) return false

  const code = "code" in error ? String((error as { code?: unknown }).code ?? "") : ""
  const status = "status" in error ? Number((error as { status?: unknown }).status) : 0
  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : ""

  return (
    code === "email_exists" ||
    code === "user_already_exists" ||
    (status === 422 && /already (?:been )?(?:registered|exists)/i.test(message))
  )
}
