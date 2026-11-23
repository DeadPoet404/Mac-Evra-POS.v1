const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type StaffInvitationInput = {
  storeId: string
  roleId: string
  email: string
  expiresInHours?: number
}

export type NormalizedStaffInvitationInput = {
  storeId: string
  roleId: string
  email: string
  expiresInHours: number
}

export function normalizeStaffInvitationInput(input: StaffInvitationInput): NormalizedStaffInvitationInput {
  const email = input.email.trim().toLowerCase()
  const expiresInHours = input.expiresInHours ?? 72

  if (!uuidPattern.test(input.storeId)) throw new Error("A valid store is required.")
  if (!uuidPattern.test(input.roleId)) throw new Error("A valid role is required.")
  if (email.length > 320 || !emailPattern.test(email)) throw new Error("Enter a valid work email address.")
  if (!Number.isInteger(expiresInHours) || expiresInHours < 1 || expiresInHours > 168) {
    throw new Error("Invitation expiry must be between 1 and 168 hours.")
  }

  return { storeId: input.storeId, roleId: input.roleId, email, expiresInHours }
}

export function invitationEmailDeliveryEnabled(environment = process.env) {
  return environment.STAFF_INVITATION_EMAIL_ENABLED === "true"
}
