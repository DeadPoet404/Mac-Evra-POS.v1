"use client";

export default function HomePage() {
  const Arrow = () => (
    <span className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20 backdrop-blur-md">
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </span>
  );

  return (
    <main className="min-h-screen min-h-[100svh] bg-white pt-[env(safe-area-inset-top)] pb-10 text-[#1D1D1F]">
      {/* Menu Bar */}
      <header className="sticky top-0 z-30 h-12 w-full bg-[#FAFAFC]/90 backdrop-blur-md">
        <div className="mx-auto flex h-full max-w-lg items-center justify-between px-6">
          <a href="#" aria-label="Home" className="flex h-9 w-9 items-center justify-center text-[#1D1D1F] transition hover:opacity-75 active:scale-95">
            <svg viewBox="0 0 384 512" fill="currentColor" className="h-[21px] w-[19px]" aria-hidden="true">
              <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.8-44.6-35.6-2.8-74.4 20.9-88.9 20.9-15.3 0-49.6-19.9-76.8-19.9C61.9 141.6 0 186.9 0 280.8c0 27.7 5.1 56.3 15.3 85.8 13.6 36.7 62.6 126.7 113.7 125.2 26.7-.6 45.6-19 78.4-19 31.8 0 49.4 19 79.2 19 51.5-.7 105.8-82.5 118.7-119.3-75.5-35.6-86.6-104.5-86.6-103.8zM261.1 99.4c27.4-32.5 24.9-62.2 24.1-72.9-24.2 1.4-52.2 16.5-68.1 34.7-17.5 19.6-27.8 43.8-25.6 70.9 26.2 2 50.1-11.4 69.6-32.7z" />
            </svg>
          </a>

          <div className="flex items-center gap-5">
            <button type="button" aria-label="Search" className="flex h-8 w-8 items-center justify-center text-[#1D1D1F] transition hover:opacity-75 active:scale-95">
              <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="6.5" />
                <path d="M16 16l4.5 4.5" />
              </svg>
            </button>

            <button type="button" aria-label="Bag" className="flex h-8 w-8 items-center justify-center text-[#1D1D1F] transition hover:opacity-75 active:scale-95">
              <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6.5 8.5h11l1 11.5h-13l1-11.5z" />
                <path d="M9.5 8.5V6.5a2.5 2.5 0 0 1 5 0v2" />
              </svg>
            </button>

            <button type="button" aria-label="Open menu" className="flex h-8 w-8 items-center justify-center text-[#1D1D1F] transition hover:opacity-75 active:scale-95">
              <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M4.5 9.5h15M4.5 14.5h15" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-lg px-6">
        {/* Greeting */}
        <section className="mt-9">
          <h1
            className="text-[38px] font-semibold leading-tight tracking-[-1.2px] text-[#6E0728]"
            style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif' }}
          >
            Hello, Alex.
          </h1>

          <p
            className="mt-2 text-[21px] font-semibold leading-snug tracking-[-0.45px]"
            style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif' }}
          >
            <span className="text-[#6E0728]">Let&apos;s make</span>{" "}
            <span className="text-[#86868B]">today a great one.</span>
          </p>
        </section>

        {/* Main action cards */}
        <section className="mt-8 grid grid-cols-2 gap-2">

          {/* New Sale */}
          <button className="group relative h-[210px] overflow-hidden rounded-md bg-[#F5F5F7] text-left transition active:scale-[0.98]">
            <img src="/Mac-evra-sale-badge.jpeg" alt="New Sale" className="absolute inset-0 h-full w-full object-cover transition duration-300 group-active:scale-105" />
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-4 pb-4 pt-16 text-white">
              <div>
                <h2 className="text-[18px] font-semibold tracking-[-0.5px]">New Sale</h2>
                <p className="mt-1 text-[12px] leading-snug text-white/85">Find a phone. Make someone&apos;s day.</p>
              </div>
              <Arrow />
            </div>
          </button>

          {/* Process a Swap */}
          <button className="group relative h-[210px] overflow-hidden rounded-md bg-[#E9EAEE] text-left transition active:scale-[0.98]">
            <img
              src="/trade-in-image.webp"
              alt="Trade in and exchange phones"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-4 pb-4 pt-16 text-white">
              <div>
                <h2 className="text-[18px] font-semibold tracking-[-0.5px]">Process a Swap</h2>
                <p className="mt-1 text-[12px] leading-snug text-white/85">Trade in and exchange devices.</p>
              </div>
              <Arrow />
            </div>
          </button>

          {/* Inventory - Full Width */}
          <button className="group relative col-span-2 h-[210px] overflow-hidden rounded-md bg-[#E9EAEE] text-left transition active:scale-[0.98]">
            <img
              src="/inventory.jpeg"
              alt="Phone inventory"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-4 pb-4 pt-16 text-white">
              <div>
                <h2 className="text-[18px] font-semibold tracking-[-0.5px]">Inventory</h2>
                <p className="mt-1 text-[12px] leading-snug text-white/85">Explore available iPhones.</p>
              </div>
              <Arrow />
            </div>
          </button>

        </section>
      </div>
    </main>
  );
}
