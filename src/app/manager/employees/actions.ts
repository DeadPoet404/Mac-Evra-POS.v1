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
    const result = await inviteStaffMember({
      storeId: String(formData.get("storeId") ?? ""),
      roleId: String(formData.get("roleId") ?? ""),
      email: String(formData.get("email") ?? ""),
    })
    return {
      status: "success",
      message:
        result.delivery === "existing_account"
          ? "A secure store-access link was sent to the employee's existing account."
          : "A secure invitation email was sent to the new employee account.",
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "The staff invitation could not be created."
    return { status: "error", message }
  }
}
