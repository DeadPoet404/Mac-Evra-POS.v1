"use server"

import { inviteStaffMember } from "@/lib/auth/provisioning"

export type StaffInvitationActionState = {
  status: "idle" | "success" | "error"
  message: string
}

export const initialStaffInvitationState: StaffInvitationActionState = { status: "idle", message: "" }

export async function inviteStaffAction(
  _previousState: StaffInvitationActionState,
  formData: FormData
): Promise<StaffInvitationActionState> {
  try {
    await inviteStaffMember({
      storeId: String(formData.get("storeId") ?? ""),
      roleId: String(formData.get("roleId") ?? ""),
      email: String(formData.get("email") ?? ""),
    })
    return { status: "success", message: "The staff invitation was prepared for secure email delivery." }
  } catch (error) {
    const message = error instanceof Error ? error.message : "The staff invitation could not be created."
    return { status: "error", message }
  }
}
