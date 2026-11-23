"use client"

import { initialAuthActionState } from "@/app/auth/action-state"

import { useActionState } from "react"
import { LoaderCircle, LockKeyhole, Mail } from "lucide-react"

import { signInAction } from "@/app/auth/actions"

export function LoginForm({ nextPath, initialMessage }: { nextPath: string; initialMessage?: string }) {
  const [state, formAction, pending] = useActionState(signInAction, initialAuthActionState)
  const message = state.message || initialMessage

  return (
    <form action={formAction} className="grid gap-3" aria-label="Employee sign in">
      <input type="hidden" name="next" value={nextPath} />

      <label className="grid gap-1.5 text-xs font-medium text-white/85">
        Work email
        <span className="relative">
          <Mail className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-neutral-500" aria-hidden="true" />
          <input
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            required
            disabled={pending}
            className="h-[54px] w-full rounded-2xl border border-white/35 bg-white/95 pl-11 pr-4 text-[14px] text-neutral-900 outline-none transition placeholder:text-neutral-500 focus:border-white focus:ring-2 focus:ring-white/30 disabled:opacity-70"
            placeholder="you@company.com"
          />
        </span>
      </label>

      <label className="grid gap-1.5 text-xs font-medium text-white/85">
        Password
        <span className="relative">
          <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-neutral-500" aria-hidden="true" />
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={pending}
            className="h-[54px] w-full rounded-2xl border border-white/35 bg-white/95 pl-11 pr-4 text-[14px] text-neutral-900 outline-none transition placeholder:text-neutral-500 focus:border-white focus:ring-2 focus:ring-white/30 disabled:opacity-70"
            placeholder="Enter your password"
          />
        </span>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="mt-1 flex h-[58px] w-full items-center justify-center gap-2 rounded-2xl border border-white/80 bg-white text-[14px] font-semibold text-neutral-800 shadow-[0_4px_20px_rgba(0,0,0,0.15)] transition-all duration-200 hover:bg-neutral-100 active:scale-[0.98] disabled:cursor-wait disabled:opacity-75"
      >
        {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
        {pending ? "Signing in…" : "Sign in securely"}
      </button>

      {message ? (
        <p className="mt-2 rounded-xl border border-white/15 bg-black/45 px-4 py-3 text-center text-xs leading-5 text-white/90" role="alert">
          {message}
        </p>
      ) : null}
    </form>
  )
}
