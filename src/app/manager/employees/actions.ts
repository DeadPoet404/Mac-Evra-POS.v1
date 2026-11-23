"use server"

import { redirect } from "next/navigation"

import { inviteStaffMember } from "@/lib/auth/provisioning"
import { requirePermissions } from "@/lib/auth/server"
import { createClient } from "@/lib/supabase/server"

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
      message: result.delivery === "existing_account"
        ? "A secure store-access link was sent to the employee's existing account."
        : "A secure invitation email was sent to the new employee account.",
    }
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "The staff invitation could not be created.",
    }
  }
}

export async function inviteStaffFormAction(formData: FormData): Promise<void> {
  const { membership } = await requirePermissions(["manage_employee_access"], { nextPath: "/manager/employees" })
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const roleCode = String(formData.get("roleCode") ?? "")
  if (!["employee", "manager", "administrator"].includes(roleCode)) {
    redirect("/manager/employees?error=invalid-role")
  }
  const supabase = await createClient()
  const { data: role } = await supabase.from("roles").select("id").eq("code", roleCode).maybeSingle()
  if (!role) redirect("/manager/employees?error=invalid-role")
  try {
    await inviteStaffMember({ storeId: membership.storeId, roleId: role.id, email })
  } catch {
    redirect("/manager/employees?error=invite-failed")
  }
  redirect("/manager/employees?notice=invitation-sent")
}

export async function updateStaffAction(formData: FormData): Promise<void> {
  const { membership } = await requirePermissions(["manage_employee_access"], { nextPath: "/manager/employees" })
  const membershipId = String(formData.get("membershipId") ?? "")
  const roleCode = String(formData.get("roleCode") ?? "")
  const status = String(formData.get("status") ?? "")
  if (!membershipId || (!["employee", "manager", "administrator"].includes(roleCode) && !["active", "suspended", "inactive"].includes(status))) {
    redirect("/manager/employees?error=invalid-change")
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc("update_staff_membership", {
    p_store_id: membership.storeId,
    p_membership_id: membershipId,
    p_role_code: roleCode || null,
    p_status: status || null,
  })
  if (error) redirect("/manager/employees?error=update-failed")
  redirect("/manager/employees?notice=staff-updated")
}
