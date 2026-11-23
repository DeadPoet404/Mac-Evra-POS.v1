"use client";

import { useState } from "react";

export default function PaymentPage() {
  const [method, setMethod] = useState("Cash");
  const [amount, setAmount] = useState("8500");
  const [reference, setReference] = useState("");

  const methods = ["Cash", "MTN MoMo", "Other Mobile Money", "Bank Transfer", "Card"];

  return (
    <main className="min-h-screen bg-white pb-10 pt-[env(safe-area-inset-top)] text-[#1D1D1F]">
      <header className="sticky top-0 z-30 flex h-12 items-center justify-between bg-[#FAFAFC]/90 px-6 backdrop-blur-md">
        <a href="/new-sale" className="text-[14px] font-medium text-[#6E0728]">Back</a>
        <span className="text-[15px] font-semibold">New Sale</span>
        <span className="w-8" />
      </header>

      <div className="mx-auto max-w-lg px-6">
        <section className="mt-9">
          <h1 className="text-[38px] font-semibold leading-tight tracking-[-1.2px] text-[#6E0728]">
            Payment.
          </h1>
          <p className="mt-2 text-[21px] font-semibold leading-snug tracking-[-0.45px] text-[#86868B]">
            Record the customer's payment.
          </p>
        </section>

        <section className="mt-8 rounded-2xl border border-[#E5E5E7] bg-[#FAFAFC] p-5">
          <p className="text-[13px] text-[#86868B]">Amount due</p>
          <p className="mt-1 text-[28px] font-semibold tracking-[-0.7px] text-[#6E0728]">
            GH₵ 8,500
          </p>

          <div className="mt-7">
            <label className="mb-3 block text-[13px] font-semibold">Payment method</label>
            <div className="grid grid-cols-2 gap-2">
              {methods.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setMethod(item)}
                  className={`rounded-xl border px-3 py-3 text-[13px] font-medium ${
                    method === item
                      ? "border-[#6E0728] bg-[#6E0728]/[0.06] text-[#6E0728]"
                      : "border-[#E5E5E7] bg-white"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <label className="mb-2 block text-[13px] font-semibold">Amount received (GH₵)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-xl border border-[#E5E5E7] bg-white px-4 py-4 text-[15px] outline-none focus:border-[#6E0728]"
            />
          </div>

          {method !== "Cash" && (
            <div className="mt-5">
              <label className="mb-2 block text-[13px] font-semibold">Transaction reference</label>
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Enter transaction reference"
                className="w-full rounded-xl border border-[#E5E5E7] bg-white px-4 py-4 text-[14px] outline-none focus:border-[#6E0728]"
              />
            </div>
          )}

          <button
            type="button"
            disabled={!amount || Number(amount) < 8500 || (method !== "Cash" && !reference.trim())}
            onClick={() => window.location.href = "/new-sale/customer-info"}
            className="mt-7 w-full rounded-full bg-[#6E0728] px-5 py-4 text-[15px] font-semibold text-white active:scale-[0.98] disabled:bg-[#C7AAB4]"
          >
            Verify Payment
          </button>

          <p className="mt-3 text-center text-[11px] leading-relaxed text-[#86868B]">
            Payment verification is simulated for this UI preview.
          </p>
        </section>
      </div>
    </main>
  );
}
