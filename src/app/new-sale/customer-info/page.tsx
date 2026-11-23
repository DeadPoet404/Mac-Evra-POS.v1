"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { SaleDeviceSummary } from "@/components/employee/device-card";
import { EmployeeHeader } from "@/components/employee/employee-header";
import { useSaleDevice } from "@/hooks/use-sale-device";
import { SALE_CUSTOMER_STORAGE_KEY } from "@/lib/employee-sale";

export default function CustomerInfoPage() {
  const router = useRouter();
  const device = useSaleDevice();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  function continueToCheckout() {
    if (!name.trim() || !phone.trim()) return;
    sessionStorage.setItem(SALE_CUSTOMER_STORAGE_KEY, JSON.stringify({ name: name.trim(), phone: phone.trim(), email: email.trim() }));
    router.push("/new-sale/checkout");
  }

  return (
    <main className="min-h-screen bg-white pb-12 text-[#1D1D1F]">
      <EmployeeHeader title="Customer" backHref="/new-sale/payment" />

      <section className="mx-auto max-w-lg px-6 pt-8">
        <h1 className="text-[38px] font-semibold tracking-tight text-[#6E0728]">Customer.</h1>
        <p className="mt-1 text-[21px] font-semibold tracking-tight">
          <span className="text-[#6E0728]">Who is purchasing</span>{" "}
          <span className="text-[#86868B]">this iPhone?</span>
        </p>

        <SaleDeviceSummary phone={device} className="mt-7" />

        <div className="mt-8 space-y-5">
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Full name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Customer's full name" autoComplete="name" className="w-full rounded-xl border border-[#E5E5E7] bg-[#FAFAFC] px-4 py-4 text-base outline-none focus:border-[#6E0728]" />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Phone number</span>
            <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="e.g. 024 000 0000" type="tel" autoComplete="tel" className="w-full rounded-xl border border-[#E5E5E7] bg-[#FAFAFC] px-4 py-4 text-base outline-none focus:border-[#6E0728]" />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Email <span className="font-normal text-[#86868B]">(optional)</span></span>
            <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Customer's email address" type="email" autoComplete="email" className="w-full rounded-xl border border-[#E5E5E7] bg-[#FAFAFC] px-4 py-4 text-base outline-none focus:border-[#6E0728]" />
          </label>
        </div>

        <button onClick={continueToCheckout} disabled={!name.trim() || !phone.trim()} className="mt-10 w-full rounded-full bg-[#6E0728] px-6 py-4 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
          Continue to Checkout
        </button>
      </section>
    </main>
  );
}
