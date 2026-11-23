import Link from "next/link"
import { Apple, ArrowLeft, Boxes, RefreshCcw, ShoppingBag } from "lucide-react"

export function EmployeeHeader({
  title,
  backHref,
  backLabel = "Back",
}: {
  title: string
  backHref?: string
  backLabel?: string
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-black/[0.04] bg-[#FAFAFC]/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          {backHref ? (
            <Link
              href={backHref}
              aria-label={backLabel}
              className="flex h-9 items-center gap-1 rounded-full px-2 text-sm font-medium text-[#6E0728] transition hover:bg-[#F5E8EC] active:scale-95"
            >
              <ArrowLeft size={17} aria-hidden="true" />
              <span className="hidden sm:inline">{backLabel}</span>
            </Link>
          ) : (
            <Link href="/home" aria-label="Home" className="flex size-9 items-center justify-center rounded-full transition hover:bg-black/[0.04] active:scale-95">
              <Apple size={20} fill="currentColor" aria-hidden="true" />
            </Link>
          )}
          <span className="truncate text-sm font-semibold text-[#1D1D1F] sm:text-[15px]">{title}</span>
        </div>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Employee navigation">
          <HeaderLink href="/home">Home</HeaderLink>
          <HeaderLink href="/inventory" icon={Boxes}>Inventory</HeaderLink>
          <HeaderLink href="/trade-in" icon={RefreshCcw}>Process a Swap</HeaderLink>
          <HeaderLink href="/new-sale" icon={ShoppingBag}>New Sale</HeaderLink>
        </nav>

        <div className="flex items-center gap-1 md:hidden">
          <Link href="/inventory" aria-label="Inventory" className="flex size-9 items-center justify-center rounded-full transition hover:bg-black/[0.04] active:scale-95">
            <Boxes size={17} aria-hidden="true" />
          </Link>
          <Link href="/new-sale" aria-label="New sale" className="flex size-9 items-center justify-center rounded-full transition hover:bg-black/[0.04] active:scale-95">
            <ShoppingBag size={17} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </header>
  )
}

function HeaderLink({ href, children, icon: Icon }: { href: string; children: React.ReactNode; icon?: React.ElementType }) {
  return (
    <Link href={href} className="flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium text-[#68686D] transition hover:bg-black/[0.04] hover:text-[#1D1D1F]">
      {Icon ? <Icon size={14} aria-hidden="true" /> : null}
      {children}
    </Link>
  )
}
