"use server"

import { redirect } from "next/navigation"

import { authorizedPostSignInPath, publicAuthErrorMessage } from "@/lib/auth/policy"
import { resolveAccess } from "@/lib/auth/resolve"
import { createClient } from "@/lib/supabase/server"
import type { AuthActionState } from "@/app/auth/action-state"

function normalizedEmail(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim().toLowerCase() : ""
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

  // Password authentication never consumes an invitation. Only the
  // invitation-specific, verified email callback can activate membership.
  const destination = authorizedPostSignInPath(access, formData.get("next"))
  if (!destination) {
    await supabase.auth.signOut({ scope: "local" })
    return {
      status: "error",
      message: "Your account has no active Mac Evra store assignment. Contact an administrator.",
    }
  }

  redirect(destination)
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

  let access
  try {
    access = await resolveAccess(supabase)
  } catch {
    return {
      status: "error",
      message: "Your password was saved, but staff access could not be checked. Contact an administrator.",
    }
  }

  const destination = authorizedPostSignInPath(access, null)
  if (!destination) {
    return {
      status: "error",
      message: "Your invitation does not provide an active store assignment. Contact an administrator.",
    }
  }

  redirect(destination)
}
