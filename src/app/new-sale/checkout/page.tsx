"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CircleAlert } from "lucide-react";

import { SaleDeviceSummary } from "@/components/employee/device-card";
import { EmployeeHeader } from "@/components/employee/employee-header";
import { useSaleDevice } from "@/hooks/use-sale-device";
import { SALE_CUSTOMER_STORAGE_KEY, SALE_PAYMENT_STORAGE_KEY } from "@/lib/employee-sale";
import { formatGhs } from "@/lib/inventory";

type Customer = { name: string; phone: string; email: string };
type Payment = { deviceImei?: string; method: string; amount: number; reference: string; status: string };

const emptyCustomer: Customer = { name: "—", phone: "—", email: "" };
const emptyPayment: Payment = { method: "—", amount: 0, reference: "—", status: "No demo payment recorded" };

export default function CheckoutPage() {
  const router = useRouter();
  const device = useSaleDevice();
  const [customer, setCustomer] = useState<Customer>(emptyCustomer);
  const [payment, setPayment] = useState<Payment>(emptyPayment);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const savedCustomer = sessionStorage.getItem(SALE_CUSTOMER_STORAGE_KEY);
      const savedPayment = sessionStorage.getItem(SALE_PAYMENT_STORAGE_KEY);
      if (savedCustomer) {
        try { setCustomer(JSON.parse(savedCustomer) as Customer); } catch { setCustomer(emptyCustomer); }
      }
      if (savedPayment) {
        try { setPayment(JSON.parse(savedPayment) as Payment); } catch { setPayment(emptyPayment); }
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const paymentMatchesDevice = payment.deviceImei === device.imei && payment.amount === device.price;

  return (
    <main className="min-h-screen bg-white pb-12 text-[#1D1D1F]">
      <EmployeeHeader title="Checkout" backHref="/new-sale/customer-info" />

      <section className="mx-auto max-w-lg px-6 pt-8">
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
          <section>
            <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">iPhone details</h2><span className="text-xs text-[#86868B]">Selected by IMEI</span></div>
            <SaleDeviceSummary phone={device} />
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
            <SummaryRow label="Confirmation" value={payment.status} emphasis />
            <SummaryRow label="Method" value={payment.method} />
            <SummaryRow label="Amount entered" value={formatGhs(payment.amount)} />
            <SummaryRow label="Reference" value={payment.reference} mono />
            {!paymentMatchesDevice ? <p className="mt-4 rounded-lg bg-[#FFF3F2] p-3 text-xs leading-5 text-[#A13B34]">The demo payment does not match this device and sale total. Return to Payment before continuing.</p> : null}
          </section>

          <section className="rounded-2xl bg-[#FAFAFC] p-5">
            <div className="flex items-center justify-between">
              <span className="font-semibold">Total sale amount</span>
              <span className="text-2xl font-semibold text-[#6E0728]">{formatGhs(device.price)}</span>
            </div>
          </section>
        </div>

        <button disabled={!paymentMatchesDevice} onClick={() => router.push("/new-sale/complete")} className="mt-8 w-full rounded-full bg-[#6E0728] px-6 py-4 text-base font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
          Complete Preview
        </button>
      </section>
    </main>
  );
}

function SummaryRow({ label, value, emphasis = false, mono = false }: { label: string; value: string; emphasis?: boolean; mono?: boolean }) {
  return (
    <div className="mt-3 flex justify-between gap-4 text-sm first:mt-4">
      <span className="text-[#86868B]">{label}</span>
      <span className={`break-all text-right font-medium ${emphasis ? "text-[#98701A]" : ""} ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}
