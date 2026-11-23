import "server-only"

import { membershipWithPermissions } from "@/lib/auth/policy"
import {
  invitationEmailDeliveryEnabled,
  normalizeStaffInvitationInput,
  type StaffInvitationInput,
} from "@/lib/auth/provisioning-policy"
import { getCurrentAccess } from "@/lib/auth/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export type StaffInvitationResult = {
  invitationId: string
  email: string
  delivery: "requested"
}

function invitationRedirectUrl() {
  const configured = process.env.APP_URL
  if (!configured) throw new Error("Staff invitation delivery is not configured.")

  const url = new URL(configured)
  if (!(["http:", "https:"] as string[]).includes(url.protocol) || url.username || url.password) {
    throw new Error("Staff invitation delivery is not configured.")
  }

  return new URL("/auth/confirm", url).toString()
}

/**
 * Prepares trusted invitation metadata through a permission-checked RPC, then
 * uses Supabase Auth Admin from server-only code to request delivery. The role
 * and store are revalidated by the database; the browser cannot self-assign.
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

  if (error || !Array.isArray(data) || data.length !== 1 || typeof data[0]?.invitation_id !== "string") {
    throw new Error("The staff invitation could not be prepared.")
  }

  const invitationId = data[0].invitation_id as string
  const admin = createAdminClient()
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(normalized.email, {
    redirectTo: invitationRedirectUrl(),
    data: { staff_invitation_id: invitationId },
  })

  if (inviteError) {
    // Keep the prepared record pending so a manager can retry after correcting
    // SMTP. Never return provider details or an action link to the browser.
    throw new Error("The invitation was prepared, but secure email delivery failed. Contact an administrator.")
  }

  return { invitationId, email: normalized.email, delivery: "requested" }
}
