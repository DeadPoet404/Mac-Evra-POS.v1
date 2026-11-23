import { redirect } from "next/navigation"

import { LoginForm } from "@/app/login-form"
import { authorizedPostSignInPath, loginErrorMessage } from "@/lib/auth/policy"
import { getCurrentAccess } from "@/lib/auth/server"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; error?: string | string[] }>
}) {
  const params = await searchParams
  const requestedPath = typeof params.next === "string" ? params.next : null

  let destination: string | null = null
  try {
    const access = await getCurrentAccess()
    destination = authorizedPostSignInPath(access, requestedPath)
  } catch {
    // The form remains available with a non-sensitive availability message.
  }
  if (destination) redirect(destination)

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
            nextPath={requestedPath ?? "/home"}
            initialMessage={loginErrorMessage(params.error)}
          />

          <p className="mt-6 text-center text-[10px] tracking-wide text-white/60">
            Authorized Mac Evra team members only. Accounts are provisioned by an administrator.
          </p>
        </section>
      </div>
    </main>
  )
}
