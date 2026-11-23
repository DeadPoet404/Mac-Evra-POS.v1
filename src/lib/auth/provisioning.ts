import "server-only"

import { invitationConfirmationUrl, isExistingAuthUserError } from "@/lib/auth/invitation"
import { membershipWithPermissions } from "@/lib/auth/policy"
import {
  invitationEmailDeliveryEnabled,
  normalizeStaffInvitationInput,
  type StaffInvitationInput,
} from "@/lib/auth/provisioning-policy"
import { getCurrentAccess } from "@/lib/auth/server"
import { createAdminClient, createAuthDeliveryClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export type StaffInvitationResult = {
  invitationId: string
  email: string
  delivery: "new_account" | "existing_account"
}

type PreparedInvitation = {
  invitation_id: string
  acceptance_token: string
  attempt_id: string
}

function configuredInvitationUrl(invitationId: string, acceptanceToken: string) {
  const configured = process.env.APP_URL
  if (!configured) throw new Error("Staff invitation delivery is not configured.")
  return invitationConfirmationUrl(configured, invitationId, acceptanceToken)
}

async function recordDelivery(
  supabase: Awaited<ReturnType<typeof createClient>>,
  prepared: PreparedInvitation,
  channel: "auth_invite" | "existing_account_magic_link",
  outcome: "sent" | "failed"
) {
  const { error } = await supabase.rpc("record_staff_invitation_delivery", {
    p_invitation_id: prepared.invitation_id,
    p_attempt_id: prepared.attempt_id,
    p_channel: channel,
    p_outcome: outcome,
  })

  if (error) {
    throw new Error("The invitation delivery result could not be audited. Contact an administrator.")
  }
}

/**
 * Prepares trusted invitation metadata through a permission-checked RPC, then
 * requests either a Supabase invitation email for a new account or a no-signup
 * magic link for an existing account. Store and role authority remain solely
 * in the database invitation row; no editable Auth metadata is trusted.
 */
export async function inviteStaffMember(input: StaffInvitationInput): Promise<StaffInvitationResult> {
  const normalized = normalizeStaffInvitationInput(input)

  if (!invitationEmailDeliveryEnabled()) {
    throw new Error("Staff invitation email is unavailable until SMTP and redirect URLs are configured.")
  }

  const access = await getCurrentAccess()
  if (!membershipWithPermissions(access, ["manage_employee_access"], normalized.storeId)) {
    throw new Error("You are not authorized to invite staff for this store.")
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("prepare_staff_invitation", {
    p_store_id: normalized.storeId,
    p_email: normalized.email,
    p_role_id: normalized.roleId,
    p_expires_in_hours: normalized.expiresInHours,
  })

  const prepared = Array.isArray(data) ? (data[0] as Partial<PreparedInvitation> | undefined) : undefined
  if (
    error ||
    !prepared ||
    typeof prepared.invitation_id !== "string" ||
    typeof prepared.acceptance_token !== "string" ||
    typeof prepared.attempt_id !== "string"
  ) {
    throw new Error("The staff invitation could not be prepared.")
  }

  const invitation = prepared as PreparedInvitation
  const redirectTo = configuredInvitationUrl(invitation.invitation_id, invitation.acceptance_token)
  const admin = createAdminClient()
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(normalized.email, {
    redirectTo,
  })

  if (!inviteError) {
    await recordDelivery(supabase, invitation, "auth_invite", "sent")
    return {
      invitationId: invitation.invitation_id,
      email: normalized.email,
      delivery: "new_account",
    }
  }

  if (!isExistingAuthUserError(inviteError)) {
    await recordDelivery(supabase, invitation, "auth_invite", "failed")
    throw new Error("The invitation was prepared, but secure email delivery failed. Contact an administrator.")
  }

  // Existing accounts cannot receive another Auth Admin invitation. Request a
  // normal magic link without allowing account creation; it carries the same
  // invitation-specific application token in its server-approved redirect.
  const deliveryClient = createAuthDeliveryClient()
  const { error: existingAccountError } = await deliveryClient.auth.signInWithOtp({
    email: normalized.email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: redirectTo,
    },
  })

  if (existingAccountError) {
    await recordDelivery(supabase, invitation, "existing_account_magic_link", "failed")
    throw new Error(
      "The invitation was prepared for an existing account, but its secure access email could not be sent. Contact an administrator."
    )
  }

  await recordDelivery(supabase, invitation, "existing_account_magic_link", "sent")
  return {
    invitationId: invitation.invitation_id,
    email: normalized.email,
    delivery: "existing_account",
  }
}
