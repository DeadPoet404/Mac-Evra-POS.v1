import assert from "node:assert/strict"
import { randomBytes, randomUUID } from "node:crypto"

import { createClient } from "@supabase/supabase-js"

import {
  invitationConfirmationUrl,
  isExistingAuthUserError,
  parseInvitationConfirmation,
} from "../src/lib/auth/invitation.ts"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const inbucketUrl = process.env.INBUCKET_URL

if (!url || !publishableKey || !serviceRoleKey || !inbucketUrl) {
  throw new Error("Local Supabase URL, publishable key, service-role key, and Inbucket URL are required.")
}

const parsedUrl = new URL(url)
const parsedInbucketUrl = new URL(inbucketUrl)
if (
  !(parsedUrl.protocol === "http:" && ["127.0.0.1", "localhost"].includes(parsedUrl.hostname)) ||
  !(parsedInbucketUrl.protocol === "http:" && ["127.0.0.1", "localhost"].includes(parsedInbucketUrl.hostname))
) {
  throw new Error("Refusing to run authenticated session tests against non-local services.")
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
})

const createBrowserSession = () =>
  createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })

const storeId = "00000000-0000-4000-8000-000000000001"
const employeeRoleId = "00000000-0000-4000-8000-000000000101"
const managerRoleId = "00000000-0000-4000-8000-000000000102"
const employeeWorkspacePermissionId = "00000000-0000-4000-8000-000000000201"
const suffix = randomUUID()
const password = `${randomBytes(18).toString("base64url")}Aa1!`
const invitationPassword = `${randomBytes(18).toString("base64url")}Bb2!`
const localAppUrl = "http://127.0.0.1:3000"

function requireNoError(error, context) {
  if (error) throw new Error(`${context}: ${error.message}`)
}

async function createUser(kind, options = {}) {
  const email = `phase3-${kind}-${suffix}@local.test`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: options.confirmed ?? true,
    user_metadata: { full_name: `Phase 3 ${kind}` },
  })
  if (error || !data.user) throw new Error(`Unable to create local ${kind} fixture: ${error?.message ?? "missing user"}`)
  return { id: data.user.id, email }
}

async function signIn(fixture, signInPassword = password) {
  const client = createBrowserSession()
  const { data, error } = await client.auth.signInWithPassword({ email: fixture.email, password: signInPassword })
  assert.equal(error, null, `${fixture.email} should sign in with email and password`)
  assert.equal(data.user?.id, fixture.id)

  const { data: verified, error: verificationError } = await client.auth.getUser()
  assert.equal(verificationError, null, "session access token should validate with Auth")
  assert.equal(verified.user?.id, fixture.id)
  return client
}

async function prepareInvitation(managerSession, email, targetStoreId = storeId) {
  const { data, error } = await managerSession.rpc("prepare_staff_invitation", {
    p_store_id: targetStoreId,
    p_email: email,
    p_role_id: employeeRoleId,
    p_expires_in_hours: 72,
  })
  requireNoError(error, `Prepare invitation for ${email}`)
  assert.equal(data.length, 1)
  assert.match(data[0].acceptance_token, /^[0-9a-f]{64}$/)
  assert.match(data[0].attempt_id, /^[0-9a-f-]{36}$/)
  return data[0]
}

async function recordDelivery(managerSession, prepared, channel, outcome) {
  const { data, error } = await managerSession.rpc("record_staff_invitation_delivery", {
    p_invitation_id: prepared.invitation_id,
    p_attempt_id: prepared.attempt_id,
    p_channel: channel,
    p_outcome: outcome,
  })
  requireNoError(error, `Audit ${channel} ${outcome}`)
  assert.match(data, /^[0-9a-f-]{36}$/)
}

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&#x2F;", "/")
    .replaceAll("&#x3D;", "=")
    .replaceAll("&#34;", '"')
    .replaceAll("&quot;", '"')
}

function findConfirmationUrl(value, acceptanceToken) {
  const decoded = decodeHtml(value)
  const candidates = decoded.match(/https?:\/\/[^\s"'<>]+/g) ?? []
  return candidates.find((candidate) => candidate.includes("/auth/confirm") && candidate.includes(acceptanceToken)) ?? null
}

async function readConfirmationEmail(email, acceptanceToken) {
  const mailboxUrl = `${inbucketUrl.replace(/\/$/, "")}/api/v1/mailbox/${encodeURIComponent(email)}`
  const deadline = Date.now() + 15_000

  while (Date.now() < deadline) {
    const response = await fetch(mailboxUrl)
    if (response.ok) {
      const payload = await response.json()
      const messages = Array.isArray(payload) ? payload : (payload.messages ?? [])
      for (const message of messages) {
        const detailResponse = await fetch(`${mailboxUrl}/${encodeURIComponent(message.id)}`)
        if (!detailResponse.ok) continue
        const detail = await detailResponse.json()
        const confirmationUrl = findConfirmationUrl(JSON.stringify(detail), acceptanceToken)
        if (confirmationUrl) return new URL(confirmationUrl)
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  throw new Error(`Timed out waiting for invitation-specific email to ${email}.`)
}

async function confirmEmailedInvitation(email, prepared, expectedType) {
  const emailedUrl = await readConfirmationEmail(email, prepared.acceptance_token)
  const confirmation = parseInvitationConfirmation(emailedUrl.searchParams)
  assert.ok(confirmation, "custom Supabase email must contain a complete confirmation URL")
  assert.equal(confirmation.invitationId, prepared.invitation_id)
  assert.equal(confirmation.acceptanceToken, prepared.acceptance_token)
  assert.equal(confirmation.type, expectedType)
  assert.equal(emailedUrl.searchParams.has("store_id"), false)
  assert.equal(emailedUrl.searchParams.has("role_id"), false)

  const session = createBrowserSession()
  const { error: verifyError } = await session.auth.verifyOtp({
    token_hash: confirmation.tokenHash,
    type: confirmation.type,
  })
  requireNoError(verifyError, `Verify ${expectedType} email`)

  const { data: accepted, error: acceptanceError } = await session.rpc("accept_staff_invitation", {
    p_invitation_id: confirmation.invitationId,
    p_acceptance_token: confirmation.acceptanceToken,
  })
  requireNoError(acceptanceError, `Accept ${expectedType} invitation`)
  assert.equal(accepted.length, 1)
  return session
}

const employee = await createUser("employee")
const manager = await createUser("manager-only")
const suspended = await createUser("suspended")
const existingCandidate = await createUser("existing-candidate")

const managerMembershipId = randomUUID()
const { error: membershipError } = await admin.from("store_memberships").insert([
  {
    id: randomUUID(),
    store_id: storeId,
    user_id: employee.id,
    role_id: employeeRoleId,
    status: "active",
    joined_at: new Date().toISOString(),
  },
  {
    id: managerMembershipId,
    store_id: storeId,
    user_id: manager.id,
    role_id: managerRoleId,
    status: "active",
    joined_at: new Date().toISOString(),
  },
  {
    id: randomUUID(),
    store_id: storeId,
    user_id: suspended.id,
    role_id: managerRoleId,
    status: "suspended",
    joined_at: new Date().toISOString(),
  },
])
if (membershipError) throw new Error(`Unable to create local membership fixtures: ${membershipError.message}`)

// Remove only the employee-workspace permission. The manager retains trusted
// manager and employee-access permissions and must still be able to sign in.
const { error: overrideError } = await admin.from("membership_permission_overrides").insert({
  membership_id: managerMembershipId,
  permission_id: employeeWorkspacePermissionId,
  allowed: false,
  reason: "Manager-only regression coverage",
  granted_by: manager.id,
})
requireNoError(overrideError, "Create manager-only permission override")

const secondStoreId = randomUUID()
const { error: secondStoreError } = await admin.from("stores").insert({
  id: secondStoreId,
  code: `phase3-second-${suffix}`,
  name: "Phase 3 Session Second Store",
  status: "active",
})
requireNoError(secondStoreError, "Create second local store")
const { error: secondManagerMembershipError } = await admin.from("store_memberships").insert({
  id: randomUUID(),
  store_id: secondStoreId,
  user_id: manager.id,
  role_id: managerRoleId,
  status: "active",
  joined_at: new Date().toISOString(),
})
requireNoError(secondManagerMembershipError, "Create second-store manager membership")

const employeeSession = await signIn(employee)
const managerSession = await signIn(manager)
const suspendedSession = await signIn(suspended)

const employeeInvitations = await employeeSession.from("staff_invitations").select("id")
assert.equal(employeeInvitations.error, null)
assert.equal(employeeInvitations.data?.length, 0, "employee must not see staff invitations")

const suspendedStores = await suspendedSession.from("stores").select("id")
assert.equal(suspendedStores.error, null)
assert.equal(suspendedStores.data?.length, 0, "suspended membership must expose no active store")

const anonymous = createBrowserSession()
const anonymousStores = await anonymous.from("stores").select("id")
assert.ok(anonymousStores.error, "anonymous client must not receive store table access")

// New-account invite: two invitations share an email, but the emailed link can
// activate only the invitation whose database token it carries.
const invitedEmail = `phase3-emailed-invite-${suffix}@local.test`
const firstStoreInvitation = await prepareInvitation(managerSession, invitedEmail, storeId)
const secondStoreInvitation = await prepareInvitation(managerSession, invitedEmail, secondStoreId)
const firstRedirect = invitationConfirmationUrl(localAppUrl, firstStoreInvitation.invitation_id, firstStoreInvitation.acceptance_token)
const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(invitedEmail, { redirectTo: firstRedirect })
requireNoError(inviteError, "Send actual local Supabase invitation email")
await recordDelivery(managerSession, firstStoreInvitation, "auth_invite", "sent")

const invitationSession = await confirmEmailedInvitation(invitedEmail, firstStoreInvitation, "invite")
const { error: passwordError } = await invitationSession.auth.updateUser({ password: invitationPassword })
requireNoError(passwordError, "Set password after actual invitation confirmation")
const invitedUser = (await invitationSession.auth.getUser()).data.user
assert.ok(invitedUser)
assert.equal(invitedUser.user_metadata.staff_invitation_id, undefined)
assert.equal(invitedUser.user_metadata.store_id, undefined)
assert.equal(invitedUser.user_metadata.role_id, undefined)

const { error: invitedSignOutError } = await invitationSession.auth.signOut({ scope: "local" })
requireNoError(invitedSignOutError, "Sign out newly invited employee")
await signIn({ id: invitedUser.id, email: invitedEmail }, invitationPassword)

const { data: invitationStates, error: invitationStatesError } = await admin
  .from("staff_invitations")
  .select("id, status")
  .in("id", [firstStoreInvitation.invitation_id, secondStoreInvitation.invitation_id])
requireNoError(invitationStatesError, "Read multiple invitation states")
assert.equal(invitationStates.find((item) => item.id === firstStoreInvitation.invitation_id)?.status, "accepted")
assert.equal(invitationStates.find((item) => item.id === secondStoreInvitation.invitation_id)?.status, "pending")
const { data: invitedMemberships, error: invitedMembershipsError } = await admin
  .from("store_memberships")
  .select("store_id")
  .eq("user_id", invitedUser.id)
requireNoError(invitedMembershipsError, "Read specifically activated membership")
assert.deepEqual(invitedMemberships.map((item) => item.store_id), [storeId])

// Existing-account and repeated-delivery flow. Password sign-in alone leaves
// the pending invitation untouched, and retrying rotates the application token.
const existingSession = await signIn(existingCandidate)
const existingFirst = await prepareInvitation(managerSession, existingCandidate.email, secondStoreId)
let existingMemberships = await admin
  .from("store_memberships")
  .select("id")
  .eq("store_id", secondStoreId)
  .eq("user_id", existingCandidate.id)
assert.equal(existingMemberships.error, null)
assert.equal(existingMemberships.data.length, 0, "ordinary password sign-in must not consume a pending invitation")

const firstExistingRedirect = invitationConfirmationUrl(localAppUrl, existingFirst.invitation_id, existingFirst.acceptance_token)
const firstExistingInvite = await admin.auth.admin.inviteUserByEmail(existingCandidate.email, { redirectTo: firstExistingRedirect })
assert.ok(firstExistingInvite.error)
assert.equal(isExistingAuthUserError(firstExistingInvite.error), true)
const firstMagicDelivery = createBrowserSession()
const { error: firstMagicError } = await firstMagicDelivery.auth.signInWithOtp({
  email: existingCandidate.email,
  options: { shouldCreateUser: false, emailRedirectTo: firstExistingRedirect },
})
requireNoError(firstMagicError, "Send first existing-account access email")
await recordDelivery(managerSession, existingFirst, "existing_account_magic_link", "sent")

await new Promise((resolve) => setTimeout(resolve, 1100))
const existingRetry = await prepareInvitation(managerSession, existingCandidate.email, secondStoreId)
assert.equal(existingRetry.result, "reprepared")
assert.equal(existingRetry.invitation_id, existingFirst.invitation_id)
assert.notEqual(existingRetry.acceptance_token, existingFirst.acceptance_token)

const staleAcceptance = await existingSession.rpc("accept_staff_invitation", {
  p_invitation_id: existingFirst.invitation_id,
  p_acceptance_token: existingFirst.acceptance_token,
})
assert.ok(staleAcceptance.error, "an older email token must fail after repeated preparation")

const retryRedirect = invitationConfirmationUrl(localAppUrl, existingRetry.invitation_id, existingRetry.acceptance_token)
const retryInvite = await admin.auth.admin.inviteUserByEmail(existingCandidate.email, { redirectTo: retryRedirect })
assert.ok(retryInvite.error)
assert.equal(isExistingAuthUserError(retryInvite.error), true)
const retryMagicDelivery = createBrowserSession()
const { error: retryMagicError } = await retryMagicDelivery.auth.signInWithOtp({
  email: existingCandidate.email,
  options: { shouldCreateUser: false, emailRedirectTo: retryRedirect },
})
requireNoError(retryMagicError, "Send repeated existing-account access email")
await recordDelivery(managerSession, existingRetry, "existing_account_magic_link", "sent")

const existingAcceptanceSession = await confirmEmailedInvitation(existingCandidate.email, existingRetry, "magiclink")
const acceptedExistingUser = await existingAcceptanceSession.auth.getUser()
assert.equal(acceptedExistingUser.data.user?.id, existingCandidate.id)

const { data: repeatedAudit, error: repeatedAuditError } = await admin
  .from("audit_events")
  .select("action, event_data")
  .eq("entity_id", existingRetry.invitation_id)
  .in("action", ["staff.invitation_prepared", "staff.invitation_delivery"])
requireNoError(repeatedAuditError, "Read repeated invitation audit events")
assert.equal(repeatedAudit.filter((event) => event.action === "staff.invitation_prepared").length, 2)
assert.equal(repeatedAudit.filter((event) => event.action === "staff.invitation_delivery").length, 2)
assert.ok(
  repeatedAudit
    .filter((event) => event.action === "staff.invitation_delivery")
    .every((event) => event.event_data.channel === "existing_account_magic_link" && event.event_data.outcome === "sent")
)

existingMemberships = await admin
  .from("store_memberships")
  .select("id, status")
  .eq("store_id", secondStoreId)
  .eq("user_id", existingCandidate.id)
assert.equal(existingMemberships.error, null)
assert.equal(existingMemberships.data.length, 1)
assert.equal(existingMemberships.data[0].status, "active")

const { error: signOutError } = await employeeSession.auth.signOut({ scope: "local" })
assert.equal(signOutError, null)
const signedOutUser = await employeeSession.auth.getUser()
assert.equal(signedOutUser.data.user, null, "sign-out must remove the employee session")

console.log("PASS: email/password, token validation, sign-out, manager-only access, suspension, and anonymous denial.")
console.log("PASS: actual Supabase invite email confirmation led to password setup and one specific membership.")
console.log("PASS: ordinary sign-in did not consume invitations; existing-account magic links and repeated audits passed.")
