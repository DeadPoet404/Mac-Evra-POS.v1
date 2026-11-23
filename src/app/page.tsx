"use client";

import { useState } from "react";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
      <path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.6c3.9-3.6 6.1-8.8 6.1-15Z"/>
      <path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.6-5.1c-1.8 1.2-4.1 2-6.9 2-5.3 0-9.8-3.6-11.4-8.4H5.8v5.2A20 20 0 0 0 24 44Z"/>
      <path fill="#FBBC05" d="M12.6 27.6a12 12 0 0 1 0-7.2v-5.2H5.8a20 20 0 0 0 0 17.6l6.8-5.2Z"/>
      <path fill="#EA4335" d="M24 12c3 0 5.7 1 7.8 3.1l5.8-5.8C34.1 5.9 29.5 4 24 4A20 20 0 0 0 5.8 15.2l6.8 5.2C14.2 15.6 18.7 12 24 12Z"/>
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 384 512" className="h-[21px] w-[18px] fill-current" aria-hidden="true">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 8 181.8 8 264.3c0 24.4 4.5 49.6 13.5 75.5 12 33.9 55.3 117 100.4 115.6 24.5-.6 41.8-17.4 74.7-17.4 31.9 0 47.9 17.4 75.2 17.4 45.5-.7 84.7-75.8 96.1-109.8-61-28.7-57.9-75.2-59.2-77Zm-56.4-164.5C289.6 80 309.6 49.1 306.6 16c-27.3 1.9-58.9 18.2-76.9 37.9-19.8 21.2-31.4 47.5-28.9 78.3 29.5 2.3 56.5-13.2 71.5-28Z"/>
    </svg>
  );
}

export default function LoginPage() {
  const [message, setMessage] = useState("");

  return (
    <main className="relative min-h-screen min-h-[100svh] w-full overflow-hidden bg-neutral-950 text-white">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/Mac-evra-login-img.webp')" }}
      />

      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/25 to-black/85" />

      <div className="relative z-10 mx-auto flex min-h-screen min-h-[100svh] w-full max-w-[560px] flex-col justify-between px-7 py-8">

        {/* Wordmark */}
        <header className="pt-1">
          <span
            className="text-[25px] font-black tracking-[-1.5px] text-white"
            style={{ fontFamily: "'Trebuchet MS', sans-serif" }}
          >
            MAC EVRA
          </span>
        </header>

        {/* Welcome and sign-in */}
        <section className="pb-5">
          <p className="mb-3 text-[10px] font-bold tracking-[0.25em] text-white/70">
            WELCOME TO MAC EVRA
          </p>

          <h1 className="text-[clamp(42px,10vw,56px)] font-semibold leading-[1.02] tracking-[-0.05em]">
            Good to have
            <br />
            you here.
          </h1>

          <p className="mb-8 mt-4 text-sm text-white/75">
            Sign in to continue to your workspace.
          </p>

          <div className="grid gap-3">
            <button
              onClick={() => setMessage("Google sign-in is not connected yet.")}
              className="group flex h-[58px] w-full items-center justify-center gap-3 rounded-2xl border border-white/80 bg-white text-[14px] font-semibold text-neutral-800 shadow-[0_4px_20px_rgba(0,0,0,0.15)] transition-all duration-200 hover:bg-neutral-100 active:scale-[0.98]"
            >
              <GoogleIcon />
              Continue with Google
            </button>

            <button
              onClick={() => setMessage("Apple sign-in is not connected yet.")}
              className="flex h-[58px] w-full items-center justify-center gap-3 rounded-2xl border border-white/25 bg-neutral-950/75 text-[14px] font-semibold text-white shadow-[0_4px_20px_rgba(0,0,0,0.15)] backdrop-blur-md transition-all duration-200 hover:bg-black active:scale-[0.98]"
            >
              <AppleIcon />
              Continue with Apple
            </button>
          </div>

          {message && (
            <p className="mt-4 text-center text-xs text-white/80" role="status">
              {message}
            </p>
          )}

          <p className="mt-6 text-center text-[10px] tracking-wide text-white/60">
            Authorized Mac Evra team members only.
          </p>
        </section>
      </div>
    </main>
  );
}
