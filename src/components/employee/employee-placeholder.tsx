import Link from "next/link"
import { Protest_Guerrilla } from "next/font/google"
import { Search, MessageCircle, UserRound } from "lucide-react"

const protest = Protest_Guerrilla({
  weight: "400",
  subsets: ["latin"],
})

type Tab = "home" | "sale" | "swap" | "inventory"

const navigation: { id: Tab; label: string; href: string; image: string }[] = [
  { id: "home", label: "Home", href: "/home", image: "/home-logo.svg" },
  { id: "sale", label: "Sale", href: "/new-sale", image: "/add-sale.svg" },
  { id: "swap", label: "Swap", href: "/trade-in", image: "/swap.svg" },
  { id: "inventory", label: "Inventory", href: "/inventory", image: "/inventory.svg" },
]

export function EmployeePlaceholder({ activeTab }: { activeTab: Tab }) {
  const returnTo =
    activeTab === "swap" ? "/trade-in" :
    activeTab === "inventory" ? "/inventory" :
    "/home"

  const saleHref = `/new-sale?from=${encodeURIComponent(returnTo)}`

  return (
    <main className="relative flex min-h-[100svh] flex-col overflow-hidden bg-white pb-28 text-[#171717]">
      <header className="flex h-[76px] w-full items-center justify-between px-5 sm:px-8">
        <div className="flex items-center gap-3">
          <img
            src="/menu-logo.svg"
            alt=""
            className="size-6 object-contain"
          />
          <span className="text-[21px] font-extrabold tracking-[-1px]">
            Shark<span className="text-[#704BFA]">Pay</span>
          </span>
        </div>

        <div className="flex items-center gap-4">
          <img src="/search-logo.svg" alt="Search" className="size-5 object-contain" />
          <MessageCircle size={20} strokeWidth={1.8} aria-hidden="true" />
          <span className="flex size-9 items-center justify-center rounded-full bg-[#EEE9FF] text-[#704BFA]">
            <UserRound size={19} strokeWidth={1.8} aria-hidden="true" />
          </span>
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-6 pb-10 text-center">
        <img
          src="/waving-hand-mascot.png"
          alt="SharkPay waving mascot"
          className="mb-7 h-auto w-[270px] max-w-[78vw] object-contain"
        />

        <h1 className={`${protest.className} text-[34px] leading-[1.12] sm:text-[40px]`}>
          Oops! this page is
          <br />
          not built yet.
        </h1>

        <Link
          href={saleHref}
          className="mt-7 inline-flex h-[42px] items-center justify-center gap-3 rounded-full bg-[#704BFA] px-7 text-sm font-semibold text-white transition hover:bg-[#5D39E8] active:scale-[0.98]"
        >
          Continue to sales
          <span aria-hidden="true">→</span>
        </Link>
      </section>

      <nav
        aria-label="Employee navigation"
        className="fixed bottom-5 left-1/2 z-20 flex w-[calc(100%-32px)] max-w-[440px] -translate-x-1/2 items-center justify-around rounded-[46px] bg-[#171717] px-2 py-3 text-white shadow-[0_8px_30px_rgba(0,0,0,0.22)]"
      >
        {navigation.map(({ id, label, href, image }) => {
          const active = activeTab === id
          return (
            <Link
              key={id}
              href={id === "sale" ? saleHref : href}
              aria-current={active ? "page" : undefined}
              className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-full py-1 text-[10px] font-medium transition ${
                active ? "text-[#A995FF]" : "text-white/65 hover:text-white"
              }`}
            >
              <img
  src={image}
  alt=""
  className="h-8 w-8 object-contain"
  style={{
    filter: active
      ? "brightness(0) saturate(100%) invert(39%) sepia(78%) saturate(2300%) hue-rotate(230deg) brightness(100%)"
      : "grayscale(1)",
    opacity: active ? 1 : 0.6,
  }}
/>
<span className={active ? "text-[#704BFA]" : "text-gray-400"}>
  {label}
</span>
            </Link>
          )
        })}
      </nav>
    </main>
  )
}
