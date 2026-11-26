"use client"

import { useEffect, useState } from "react"

export function LaunchScreen({ children }: { children: React.ReactNode }) {
  const [showLogin, setShowLogin] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setShowLogin(true), 1500)
    return () => window.clearTimeout(timer)
  }, [])

  if (showLogin) return <>{children}</>

  return (
    <main className="flex min-h-[100svh] w-full items-center justify-center overflow-hidden bg-[#FF3B8D]">
      <img
        src="/shark-mascot.svg"
        alt="Mac Evra shark mascot"
        className="h-auto w-[180px] max-w-[40vw] select-none object-contain"
      />
    </main>
  )
}
