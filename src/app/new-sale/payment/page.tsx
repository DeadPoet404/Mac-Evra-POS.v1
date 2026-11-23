"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CircleAlert } from "lucide-react";

const AMOUNT_DUE = 8500;
const methods = ["Cash", "MTN MoMo", "Other Mobile Money", "Bank Transfer", "Card"];

export default function PaymentPage() {
  const router = useRouter();
  const [method, setMethod] = useState("Cash");
  const [amount, setAmount] = useState(String(AMOUNT_DUE));
  const [reference, setReference] = useState("");

  const validAmount = Number(amount) === AMOUNT_DUE;
  const canContinue = validAmount && (method === "Cash" || reference.trim().length > 0);

  function continueWithDemoPayment() {
    if (!canContinue) return;
    sessionStorage.setItem(
      "macEvraPayment",
      JSON.stringify({
        method,
        amount: Number(amount),
        reference: method === "Cash" ? "Cash · demo entry" : reference.trim(),
        status: "Demo only · not provider verified",
      })
    );
    router.push("/new-sale/customer-info");
  }

  return (
    <main className="min-h-screen bg-white pb-10 pt-[env(safe-area-inset-top)] text-[#1D1D1F]">
      <header className="sticky top-0 z-30 flex h-12 items-center justify-between bg-[#FAFAFC]/90 px-6 backdrop-blur-md">
        <button type="button" onClick={() => router.push("/new-sale")} className="text-[14px] font-medium text-[#6E0728]">Back</button>
        <span className="text-[15px] font-semibold">New Sale</span>
        <span className="w-8" />
      </header>

      <div className="mx-auto max-w-lg px-6">
        <section className="mt-9">
          <h1 className="text-[38px] font-semibold leading-tight tracking-[-1.2px] text-[#6E0728]">Payment.</h1>
          <p className="mt-2 text-[21px] font-semibold leading-snug tracking-[-0.45px] text-[#86868B]">
            Record the customer&apos;s payment.
          </p>
        </section>

        <div className="mt-6 flex gap-3 rounded-xl border border-[#F2E2BD] bg-[#FFF9EB] p-4 text-[12px] leading-5 text-[#765613]">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <p>This preview does not contact a payment provider or bank. Entering an amount or reference does not verify that money was received.</p>
        </div>

        <section className="mt-5 rounded-2xl border border-[#E5E5E7] bg-[#FAFAFC] p-5">
          <p className="text-[13px] text-[#86868B]">Amount due</p>
          <p className="mt-1 text-[28px] font-semibold tracking-[-0.7px] text-[#6E0728]">GH₵ 8,500</p>

          <div className="mt-7">
            <label className="mb-3 block text-[13px] font-semibold">Payment method</label>
            <div className="grid grid-cols-2 gap-2">
              {methods.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setMethod(item);
                    setReference("");
                  }}
                  className={`rounded-xl border px-3 py-3 text-[13px] font-medium ${method === item ? "border-[#6E0728] bg-[#6E0728]/[0.06] text-[#6E0728]" : "border-[#E5E5E7] bg-white"}`}
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
              min="0"
              max={AMOUNT_DUE}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="w-full rounded-xl border border-[#E5E5E7] bg-white px-4 py-4 text-[15px] outline-none focus:border-[#6E0728]"
            />
            {amount && !validAmount ? <p className="mt-2 text-xs text-[#A13B34]">The full GH₵ 8,500 is required before this preview can continue.</p> : null}
          </div>

          {method !== "Cash" ? (
            <div className="mt-5">
              <label className="mb-2 block text-[13px] font-semibold">Transaction reference</label>
              <input
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="Enter transaction reference"
                className="w-full rounded-xl border border-[#E5E5E7] bg-white px-4 py-4 text-[14px] outline-none focus:border-[#6E0728]"
              />
            </div>
          ) : null}

          <button
            type="button"
            disabled={!canContinue}
            onClick={continueWithDemoPayment}
            className="mt-7 w-full rounded-full bg-[#6E0728] px-5 py-4 text-[15px] font-semibold text-white active:scale-[0.98] disabled:bg-[#C7AAB4]"
          >
            Continue with Demo Payment
          </button>

          <p className="mt-3 text-center text-[11px] leading-relaxed text-[#86868B]">No payment is processed or verified by this action.</p>
        </section>
      </div>
    </main>
  );
}
