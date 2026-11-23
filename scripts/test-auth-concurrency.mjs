import assert from "node:assert/strict"
import { randomBytes, randomUUID } from "node:crypto"

import { createClient } from "@supabase/supabase-js"
import pg from "pg"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const databaseUrl = process.env.DB_URL ?? process.env.LOCAL_DATABASE_URL

if (!supabaseUrl || !publishableKey || !serviceRoleKey || !databaseUrl) {
  throw new Error("Local Supabase API and database environment values are required.")
}

const parsedApiUrl = new URL(supabaseUrl)
const parsedDatabaseUrl = new URL(databaseUrl)
if (
  parsedApiUrl.protocol !== "http:" ||
  !["127.0.0.1", "localhost"].includes(parsedApiUrl.hostname) ||
  !["127.0.0.1", "localhost"].includes(parsedDatabaseUrl.hostname)
) {
  throw new Error("Refusing to run invitation concurrency tests against a non-local Supabase stack.")
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
})
const browserClient = () =>
  createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })

const storeId = "00000000-0000-4000-8000-000000000001"
const managerRoleId = "00000000-0000-4000-8000-000000000102"
const employeeRoleId = "00000000-0000-4000-8000-000000000101"
const suffix = randomUUID()
const password = `${randomBytes(18).toString("base64url")}Aa1!`

function requireNoError(error, context) {
  if (error) throw new Error(`${context}: ${error.message}`)
}

async function createConfirmedUser(kind) {
  const email = `phase3-concurrency-${kind}-${suffix}@local.test`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Phase 3 concurrency ${kind}` },
  })
  requireNoError(error, `Create ${kind} Auth user`)
  assert.ok(data.user)
  return { id: data.user.id, email }
}

async function signedInClient(user) {
  const client = browserClient()
  const { error } = await client.auth.signInWithPassword({ email: user.email, password })
  requireNoError(error, `Sign in ${user.email}`)
  return client
}

const manager = await createConfirmedUser("manager")
const candidate = await createConfirmedUser("candidate")
const { error: managerMembershipError } = await admin.from("store_memberships").insert({
  id: randomUUID(),
  store_id: storeId,
  user_id: manager.id,
  role_id: managerRoleId,
  status: "active",
  joined_at: new Date().toISOString(),
})
requireNoError(managerMembershipError, "Create manager membership")

const managerSession = await signedInClient(manager)
const { data: preparedRows, error: prepareError } = await managerSession.rpc("prepare_staff_invitation", {
  p_store_id: storeId,
  p_email: candidate.email,
  p_role_id: employeeRoleId,
  p_expires_in_hours: 72,
})
requireNoError(prepareError, "Prepare concurrency invitation")
assert.equal(preparedRows.length, 1)
const prepared = preparedRows[0]
assert.match(prepared.acceptance_token, /^[0-9a-f]{64}$/)

const candidateSession = await signedInClient(candidate)
const suspendConnection = new pg.Client({ connectionString: databaseUrl })
const acceptConnection = new pg.Client({ connectionString: databaseUrl })
await Promise.all([suspendConnection.connect(), acceptConnection.connect()])

try {
  await suspendConnection.query("begin")
  const suspension = await suspendConnection.query(
    "update public.profiles set status = 'suspended' where id = $1 returning id",
    [candidate.id]
  )
  assert.equal(suspension.rowCount, 1)

  await acceptConnection.query("begin")
  await acceptConnection.query("set local role authenticated")
  await acceptConnection.query("select set_config('request.jwt.claim.sub', $1, true)", [candidate.id])
  await acceptConnection.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: candidate.id, role: "authenticated" }),
  ])

  let acceptanceSettled = false
  const acceptance = acceptConnection
    .query("select * from public.accept_staff_invitation($1, $2)", [
      prepared.invitation_id,
      prepared.acceptance_token,
    ])
    .then(
      (value) => {
        acceptanceSettled = true
        return { value, error: null }
      },
      (error) => {
        acceptanceSettled = true
        return { value: null, error }
      }
    )

  // The acceptance transaction must wait on the profile lock rather than read
  // stale active state and insert a membership behind the suspension.
  await new Promise((resolve) => setTimeout(resolve, 300))
  assert.equal(acceptanceSettled, false, "acceptance should block behind an in-flight profile suspension")

  await suspendConnection.query("commit")
  const acceptanceResult = await acceptance
  assert.ok(acceptanceResult.error, "acceptance should fail after the suspension commits")
  assert.equal(acceptanceResult.error.code, "42501")
  await acceptConnection.query("rollback")

  const { data: invitation, error: invitationError } = await admin
    .from("staff_invitations")
    .select("status")
    .eq("id", prepared.invitation_id)
    .single()
  requireNoError(invitationError, "Read invitation after suspension race")
  assert.equal(invitation.status, "pending")

  const { data: memberships, error: membershipsError } = await admin
    .from("store_memberships")
    .select("id")
    .eq("store_id", storeId)
    .eq("user_id", candidate.id)
  requireNoError(membershipsError, "Read memberships after suspension race")
  assert.equal(memberships.length, 0)

  const deniedAttempt = await candidateSession.rpc("accept_staff_invitation", {
    p_invitation_id: prepared.invitation_id,
    p_acceptance_token: prepared.acceptance_token,
  })
  assert.ok(deniedAttempt.error)
} finally {
  await Promise.allSettled([
    suspendConnection.query("rollback"),
    acceptConnection.query("rollback"),
  ])
  await Promise.allSettled([suspendConnection.end(), acceptConnection.end()])
}

console.log("PASS: invitation acceptance blocked on profile suspension and failed after suspension committed.")
console.log("PASS: the raced invitation remained pending and created no latent membership.")
