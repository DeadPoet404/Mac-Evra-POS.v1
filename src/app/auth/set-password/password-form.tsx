"use client"

import { initialAuthActionState } from "@/app/auth/action-state"

import { useActionState } from "react"
import { LoaderCircle, LockKeyhole } from "lucide-react"

import { setPasswordAction } from "@/app/auth/actions"

export function PasswordForm() {
  const [state, formAction, pending] = useActionState(setPasswordAction, initialAuthActionState)

  return (
    <form action={formAction} className="mt-7 grid gap-4">
      <label className="grid gap-2 text-sm font-medium text-[#424245]">
        New password
        <span className="relative">
          <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#86868B]" />
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
            disabled={pending}
            className="h-12 w-full rounded-xl border border-[#D2D2D7] bg-white pl-11 pr-4 outline-none focus:border-[#6E0728] focus:ring-2 focus:ring-[#6E0728]/15"
          />
        </span>
      </label>
      <label className="grid gap-2 text-sm font-medium text-[#424245]">
        Confirm password
        <input
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
          disabled={pending}
          className="h-12 w-full rounded-xl border border-[#D2D2D7] bg-white px-4 outline-none focus:border-[#6E0728] focus:ring-2 focus:ring-[#6E0728]/15"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="mt-1 flex h-12 items-center justify-center gap-2 rounded-xl bg-[#6E0728] px-5 text-sm font-semibold text-white transition hover:bg-[#57051F] disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
        {pending ? "Saving…" : "Set password and continue"}
      </button>
      {state.message ? (
        <p role="alert" className="rounded-xl bg-[#F9ECEF] px-4 py-3 text-sm leading-5 text-[#6E0728]">
          {state.message}
        </p>
      ) : null}
    </form>
  )
}
