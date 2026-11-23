import { redirect } from "next/navigation"
import { Apple } from "lucide-react"

import { PasswordForm } from "@/app/auth/set-password/password-form"
import { createClient } from "@/lib/supabase/server"

export default async function SetPasswordPage() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) redirect("/?error=invalid-invitation")

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F5F5F7] px-5 py-12 text-[#1D1D1F]">
      <section className="w-full max-w-md rounded-3xl border border-black/[0.06] bg-white p-7 shadow-[0_20px_60px_rgba(0,0,0,0.08)] sm:p-9">
        <span className="flex size-11 items-center justify-center rounded-2xl bg-[#6E0728] text-white">
          <Apple className="size-5" fill="currentColor" />
        </span>
        <p className="mt-7 text-xs font-semibold uppercase tracking-[0.16em] text-[#6E0728]">Mac Evra staff invitation</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Secure your account</h1>
        <p className="mt-3 text-sm leading-6 text-[#68686D]">
          Choose a unique password of at least 12 characters. Your assigned store and role come from the invitation and cannot be changed here.
        </p>
        <PasswordForm />
      </section>
    </main>
  )
}
