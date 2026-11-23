"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CustomerInfoPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  function continueToCheckout() {
    if (!name.trim() || !phone.trim()) return;

    sessionStorage.setItem("macEvraCustomer", JSON.stringify({
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim()
    }));

    router.push("/new-sale/checkout");
  }

  return (
    <main className="min-h-screen bg-white text-[#1D1D1F]">
      <header className="flex items-center justify-between px-6 py-5">
        <button onClick={() => router.push("/new-sale/payment")} className="text-sm text-[#6E0728]">← Back</button>
        <span className="text-sm font-semibold">New Sale</span>
        <div className="w-10" />
      </header>

      <section className="mx-auto max-w-lg px-6 pb-12 pt-8">
        <h1 className="text-[38px] font-semibold tracking-tight text-[#6E0728]">Customer.</h1>
        <p className="mt-1 text-[21px] font-semibold tracking-tight">
          <span className="text-[#6E0728]">Who is purchasing</span>{" "}
          <span className="text-[#86868B]">this iPhone?</span>
        </p>

        <div className="mt-10 space-y-5">
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Full name</span>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Customer's full name" className="w-full rounded-xl border border-[#E5E5E7] bg-[#FAFAFC] px-4 py-4 text-base outline-none focus:border-[#6E0728]" />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium">Phone number</span>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 024 000 0000" type="tel" className="w-full rounded-xl border border-[#E5E5E7] bg-[#FAFAFC] px-4 py-4 text-base outline-none focus:border-[#6E0728]" />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium">Email <span className="font-normal text-[#86868B]">(optional)</span></span>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Customer's email address" type="email" className="w-full rounded-xl border border-[#E5E5E7] bg-[#FAFAFC] px-4 py-4 text-base outline-none focus:border-[#6E0728]" />
          </label>
        </div>

        <button onClick={continueToCheckout} disabled={!name.trim() || !phone.trim()} className="mt-10 w-full rounded-full bg-[#6E0728] px-6 py-4 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
          Continue to Checkout
        </button>
      </section>
    </main>
  );
}
