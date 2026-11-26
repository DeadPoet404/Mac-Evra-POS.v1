import { redirect } from "next/navigation"

import { LoginForm } from "@/app/login-form"
import { LaunchScreen } from "@/app/launch-screen"
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
    // Keep the sign-in form available if access checking is temporarily unavailable.
  }

  if (destination) redirect(destination)

  return (
    <LaunchScreen>
      <main className="min-h-[100svh] w-full bg-white text-[#111111]">
        <section className="flex h-[40svh] min-h-[300px] max-h-[390px] w-full items-center justify-center overflow-hidden bg-[#694BFB]">
          <img
            src="/hero-yellow-boxes-stack.png"
            alt="Stacked yellow Mac Evra boxes with shark branding"
            className="h-full w-full max-w-[430px] object-contain px-5 py-3"
          />
        </section>

        <section className="mx-auto w-full max-w-[480px] px-6 pb-8 pt-6">
          <header className="mb-6 text-center">
            <h1 className="text-[28px] font-bold leading-[34px] tracking-[-0.5px]">
              Welcome Back!
            </h1>
            <p className="mt-1 text-base leading-[22px] text-[#4A4A4A]">
              Sign in to continue
            </p>
          </header>

          <LoginForm
            nextPath={requestedPath ?? "/home"}
            initialMessage={loginErrorMessage(params.error)}
          />

          <p className="mt-6 text-center text-[11px] leading-5 text-gray-500">
            Authorized Mac Evra team members only.
          </p>
        </section>
      </main>
    </LaunchScreen>
  )
}
