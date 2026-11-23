"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CircleAlert } from "lucide-react";

type Customer = { name: string; phone: string; email: string };
type Payment = { method: string; amount: number; reference: string; status: string };

const emptyCustomer: Customer = { name: "—", phone: "—", email: "" };
const emptyPayment: Payment = { method: "—", amount: 0, reference: "—", status: "No demo payment recorded" };

export default function CheckoutPage() {
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer>(emptyCustomer);
  const [payment, setPayment] = useState<Payment>(emptyPayment);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const savedCustomer = sessionStorage.getItem("macEvraCustomer");
      const savedPayment = sessionStorage.getItem("macEvraPayment");
      if (savedCustomer) {
        try {
          setCustomer(JSON.parse(savedCustomer) as Customer);
        } catch {
          setCustomer(emptyCustomer);
        }
      }
      if (savedPayment) {
        try {
          setPayment(JSON.parse(savedPayment) as Payment);
        } catch {
          setPayment(emptyPayment);
        }
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <main className="min-h-screen bg-white text-[#1D1D1F]">
      <header className="flex items-center justify-between px-6 py-5">
        <button onClick={() => router.push("/new-sale/customer-info")} className="text-sm text-[#6E0728]">← Back</button>
        <span className="text-sm font-semibold">New Sale</span>
        <div className="w-10" />
      </header>

      <section className="mx-auto max-w-lg px-6 pb-12 pt-8">
        <h1 className="text-[38px] font-semibold tracking-tight text-[#6E0728]">Checkout.</h1>
        <p className="mt-1 text-[21px] font-semibold tracking-tight">
          <span className="text-[#6E0728]">Review the details</span>{" "}
          <span className="text-[#86868B]">before completing the preview.</span>
        </p>

        <div className="mt-6 flex gap-3 rounded-xl border border-[#F2E2BD] bg-[#FFF9EB] p-4 text-xs leading-5 text-[#765613]">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <p>This is a frontend demonstration. The payment has not been independently confirmed, no inventory will be sold, and no device should be handed over.</p>
        </div>

        <div className="mt-6 space-y-4">
          <section className="rounded-2xl border border-[#E5E5E7] p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">iPhone details</h2>
              <span className="text-xs text-[#86868B]">Device</span>
            </div>
            <div className="mt-4">
              <p className="font-semibold">iPhone 15 Pro</p>
              <p className="mt-1 text-sm text-[#86868B]">256GB · Natural Titanium</p>
              <p className="mt-1 text-sm text-[#86868B]">Excellent condition · 92% battery</p>
            </div>
            <div className="mt-4 border-t border-[#E5E5E7] pt-3 text-sm text-[#86868B]">IMEI / Barcode: 356789104567890</div>
          </section>

          <section className="rounded-2xl border border-[#E5E5E7] p-5">
            <h2 className="font-semibold">Customer information</h2>
            <div className="mt-4 space-y-2 text-sm">
              <p><span className="text-[#86868B]">Name:</span> {customer.name}</p>
              <p><span className="text-[#86868B]">Phone:</span> {customer.phone}</p>
              {customer.email ? <p><span className="text-[#86868B]">Email:</span> {customer.email}</p> : null}
            </div>
          </section>

          <section className="rounded-2xl border border-[#E5E5E7] p-5">
            <h2 className="font-semibold">Payment summary</h2>
            <div className="mt-4 flex justify-between gap-4 text-sm">
              <span className="text-[#86868B]">Confirmation</span>
              <span className="text-right font-medium text-[#98701A]">{payment.status}</span>
            </div>
            <div className="mt-3 flex justify-between text-sm">
              <span className="text-[#86868B]">Method</span>
              <span className="font-medium">{payment.method}</span>
            </div>
            <div className="mt-3 flex justify-between text-sm">
              <span className="text-[#86868B]">Amount entered</span>
              <span className="font-medium">GH₵ {payment.amount.toLocaleString("en-GH")}</span>
            </div>
            <div className="mt-3 flex justify-between gap-4 text-sm">
              <span className="text-[#86868B]">Reference</span>
              <span className="break-all text-right font-mono text-xs">{payment.reference}</span>
            </div>
          </section>

          <section className="rounded-2xl bg-[#FAFAFC] p-5">
            <div className="flex items-center justify-between">
              <span className="font-semibold">Total sale amount</span>
              <span className="text-2xl font-semibold text-[#6E0728]">GH₵ 8,500</span>
            </div>
          </section>
        </div>

        <button onClick={() => router.push("/new-sale/complete")} className="mt-8 w-full rounded-full bg-[#6E0728] px-6 py-4 text-base font-semibold text-white transition-opacity hover:opacity-90">
          Complete Preview
        </button>
      </section>
    </main>
  );
}
