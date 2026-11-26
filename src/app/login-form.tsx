"use client"

import { useActionState } from "react"
import { LoaderCircle, LockKeyhole, Mail } from "lucide-react"

import { signInAction } from "@/app/auth/actions"
import { initialAuthActionState } from "@/app/auth/action-state"

export function LoginForm({
  nextPath,
  initialMessage,
}: {
  nextPath: string
  initialMessage?: string
}) {
  const [state, formAction, pending] = useActionState(
    signInAction,
    initialAuthActionState
  )
  const message = state.message || initialMessage

  return (
    <form action={formAction} className="grid gap-3" aria-label="Employee sign in">
      <input type="hidden" name="next" value={nextPath} />

      <label className="relative block">
        <Mail
          className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[#555555]"
          aria-hidden="true"
        />
        <input
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          required
          disabled={pending}
          placeholder="Email address"
          aria-label="Email address"
          className="h-[52px] w-full rounded-[14px] border border-[#D1D5DB] bg-white pl-12 pr-4 text-[15px] text-[#111111] outline-none transition placeholder:text-[#6B7280] focus:border-[#3B82F6] focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
        />
      </label>

      <label className="relative block">
        <LockKeyhole
          className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[#555555]"
          aria-hidden="true"
        />
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={pending}
          placeholder="Password"
          aria-label="Password"
          className="h-[52px] w-full rounded-[14px] border border-[#D1D5DB] bg-white pl-12 pr-4 text-[15px] text-[#111111] outline-none transition placeholder:text-[#6B7280] focus:border-[#3B82F6] focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
        />
      </label>

      <div className="flex justify-end">
        <a
          href="/forgot-password"
          className="text-sm font-semibold text-[#3B82F6]"
        >
          Forgot password?
        </a>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[#18181B] text-base font-semibold text-white transition hover:bg-black active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? (
          <>
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Signing in…
          </>
        ) : (
          "Sign in"
        )}
      </button>

      {message ? (
        <p
          className="mt-1 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm leading-5 text-red-700"
          role="alert"
        >
          {message}
        </p>
      ) : null}
    </form>
  )
}
