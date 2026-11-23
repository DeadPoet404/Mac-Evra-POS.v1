import { redirect } from "next/navigation"

import { LoginForm } from "@/app/login-form"
import { getCurrentAccess } from "@/lib/auth/server"
import { membershipWithPermissions, safeInternalPath } from "@/lib/auth/policy"

const errorMessages: Record<string, string> = {
  inactive: "Your profile, store, or membership is inactive. Contact an administrator.",
  "access-denied": "Your account does not have employee workspace access.",
  unavailable: "Access could not be checked. Try signing in again shortly.",
  "invalid-invitation": "This invitation link is invalid or has expired. Request a new invitation.",
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const params = await searchParams
  const nextPath = safeInternalPath(params.next)

  let hasEmployeeAccess = false
  try {
    const access = await getCurrentAccess()
    hasEmployeeAccess = Boolean(membershipWithPermissions(access, ["access_employee_workspace"]))
  } catch {
    // The form remains available with a non-sensitive availability message.
  }
  if (hasEmployeeAccess) redirect(nextPath)

  return (
    <main className="relative min-h-screen min-h-[100svh] w-full overflow-hidden bg-neutral-950 text-white">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/Mac-evra-login-img.webp')" }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/25 to-black/90" />

      <div className="relative z-10 mx-auto flex min-h-screen min-h-[100svh] w-full max-w-[560px] flex-col justify-between px-7 py-8">
        <header className="pt-1">
          <span
            className="text-[25px] font-black tracking-[-1.5px] text-white"
            style={{ fontFamily: "'Trebuchet MS', sans-serif" }}
          >
            MAC EVRA
          </span>
        </header>

        <section className="pb-5">
          <p className="mb-3 text-[10px] font-bold tracking-[0.25em] text-white/70">
            WELCOME TO MAC EVRA
          </p>
          <h1 className="text-[clamp(42px,10vw,56px)] font-semibold leading-[1.02] tracking-[-0.05em]">
            Good to have
            <br />
            you here.
          </h1>
          <p className="mb-7 mt-4 text-sm text-white/75">
            Sign in with your authorized employee account.
          </p>

          <LoginForm
            nextPath={nextPath}
            initialMessage={params.error ? errorMessages[params.error] : undefined}
          />

          <p className="mt-6 text-center text-[10px] tracking-wide text-white/60">
            Authorized Mac Evra team members only. Accounts are provisioned by an administrator.
          </p>
        </section>
      </div>
    </main>
  )
}
