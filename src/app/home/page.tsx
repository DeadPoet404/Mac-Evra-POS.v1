"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Apple, ArrowRight, Menu, Search, ShoppingBag } from "lucide-react";

function CardArrow() {
  return (
    <span className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20 backdrop-blur-md">
      <ArrowRight size={16} aria-hidden="true" />
    </span>
  );
}

export default function HomePage() {
  const [message, setMessage] = useState("");

  return (
    <main className="min-h-screen min-h-[100svh] bg-white pb-10 pt-[env(safe-area-inset-top)] text-[#1D1D1F]">
      <header className="sticky top-0 z-30 h-12 w-full bg-[#FAFAFC]/90 backdrop-blur-md">
        <div className="mx-auto flex h-full max-w-lg items-center justify-between px-6">
          <Link href="/home" aria-label="Home" className="flex h-9 w-9 items-center justify-center transition hover:opacity-75 active:scale-95">
            <Apple size={21} fill="currentColor" aria-hidden="true" />
          </Link>

          <div className="flex items-center gap-5">
            <button type="button" aria-label="Search" onClick={() => setMessage("Employee search is not connected yet.")} className="flex h-8 w-8 items-center justify-center transition hover:opacity-75 active:scale-95">
              <Search size={18} aria-hidden="true" />
            </button>
            <button type="button" aria-label="Open current sale" onClick={() => setMessage("There is no active sale in this preview.")} className="flex h-8 w-8 items-center justify-center transition hover:opacity-75 active:scale-95">
              <ShoppingBag size={18} aria-hidden="true" />
            </button>
            <button type="button" aria-label="Open menu" onClick={() => setMessage("Employee menu is not connected yet.")} className="flex h-8 w-8 items-center justify-center transition hover:opacity-75 active:scale-95">
              <Menu size={19} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-lg px-6">
        <section className="mt-9">
          <h1 className="text-[38px] font-semibold leading-tight tracking-[-1.2px] text-[#6E0728]">
            Hello, Alex.
          </h1>
          <p className="mt-2 text-[21px] font-semibold leading-snug tracking-[-0.45px]">
            <span className="text-[#6E0728]">Let&apos;s make</span>{" "}
            <span className="text-[#86868B]">today a great one.</span>
          </p>
        </section>

        {message ? (
          <p role="status" className="mt-5 rounded-xl bg-[#F7F7F8] px-4 py-3 text-sm text-[#68686D]">
            {message}
          </p>
        ) : null}

        <section className="mt-8 grid grid-cols-2 gap-2" aria-label="Employee actions">
          <Link href="/new-sale" className="group relative h-[210px] overflow-hidden rounded-md bg-[#F5F5F7] text-left transition active:scale-[0.98]">
            <Image src="/Mac-evra-sale-badge.jpeg" alt="New Sale" fill sizes="(max-width: 512px) 50vw, 244px" className="object-cover transition duration-300 group-active:scale-105" />
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-4 pb-4 pt-16 text-white">
              <div>
                <h2 className="text-[18px] font-semibold tracking-[-0.5px]">New Sale</h2>
                <p className="mt-1 text-[12px] leading-snug text-white/85">Find a phone. Make someone&apos;s day.</p>
              </div>
              <CardArrow />
            </div>
          </Link>

          <Link href="/trade-in" className="group relative h-[210px] overflow-hidden rounded-md bg-[#E9EAEE] text-left transition active:scale-[0.98]">
            <Image src="/trade-in-image.webp" alt="Trade in and exchange phones" fill sizes="(max-width: 512px) 50vw, 244px" className="object-cover" />
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-4 pb-4 pt-16 text-white">
              <div>
                <h2 className="text-[18px] font-semibold tracking-[-0.5px]">Process a Swap</h2>
                <p className="mt-1 text-[12px] leading-snug text-white/85">Trade in and exchange devices.</p>
              </div>
              <CardArrow />
            </div>
          </Link>

          <Link href="/inventory" className="group relative col-span-2 h-[210px] overflow-hidden rounded-md bg-[#E9EAEE] text-left transition active:scale-[0.98]">
            <Image src="/inventory.jpeg" alt="Phone inventory" fill sizes="(max-width: 512px) 100vw, 488px" className="object-cover" />
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-4 pb-4 pt-16 text-white">
              <div>
                <h2 className="text-[18px] font-semibold tracking-[-0.5px]">Inventory</h2>
                <p className="mt-1 text-[12px] leading-snug text-white/85">Explore available iPhones.</p>
              </div>
              <CardArrow />
            </div>
          </Link>
        </section>
      </div>
    </main>
  );
}
