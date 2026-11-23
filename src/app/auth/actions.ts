"use server"

import { redirect } from "next/navigation"

import { membershipWithPermissions, publicAuthErrorMessage, safeInternalPath } from "@/lib/auth/policy"
import { resolveAccess } from "@/lib/auth/resolve"
import { createClient } from "@/lib/supabase/server"

export type AuthActionState = {
  status: "idle" | "error"
  message: string
}

export const initialAuthActionState: AuthActionState = { status: "idle", message: "" }

function normalizedEmail(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim().toLowerCase() : ""
}

async function acceptPendingInvitations(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { error } = await supabase.rpc("accept_staff_invitations")

  // PGRST202 means the separately reviewed Phase 3 database migration has not
  // been applied yet. Existing provisioned memberships can still sign in.
  if (error && error.code !== "PGRST202") return false
  return !error
}

export async function signInAction(
  _previousState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = normalizedEmail(formData.get("email"))
  const password = formData.get("password")

  if (!email || typeof password !== "string" || password.length === 0) {
    return { status: "error", message: "Enter your work email and password." }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { status: "error", message: publicAuthErrorMessage(error) }
  }

  await acceptPendingInvitations(supabase)

  let access
  try {
    access = await resolveAccess(supabase)
  } catch {
    await supabase.auth.signOut({ scope: "local" })
    return {
      status: "error",
      message: "Your account was verified, but access could not be checked. Try again shortly.",
    }
  }

  if (!membershipWithPermissions(access, ["access_employee_workspace"])) {
    await supabase.auth.signOut({ scope: "local" })
    return {
      status: "error",
      message: "Your account has no active Mac Evra store assignment. Contact an administrator.",
    }
  }

  redirect(safeInternalPath(formData.get("next")))
}

export async function signOutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: "local" })
  redirect("/")
}

export async function setPasswordAction(
  _previousState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const password = formData.get("password")
  const confirmation = formData.get("confirmPassword")

  if (typeof password !== "string" || password.length < 12 || password.length > 128) {
    return { status: "error", message: "Use a password between 12 and 128 characters." }
  }
  if (password !== confirmation) {
    return { status: "error", message: "The passwords do not match." }
  }

  const supabase = await createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) {
    return { status: "error", message: "This invitation session is no longer valid. Request a new invitation." }
  }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    return { status: "error", message: "The password could not be saved. Request a new invitation and try again." }
  }

  const invitationsAccepted = await acceptPendingInvitations(supabase)
  const access = await resolveAccess(supabase)
  if (!membershipWithPermissions(access, ["access_employee_workspace"])) {
    return {
      status: "error",
      message: invitationsAccepted
        ? "Your invitation does not provide an active employee assignment. Contact an administrator."
        : "Your password was saved, but staff access could not be activated. Contact an administrator.",
    }
  }

  redirect("/home")
}
