"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Check, CircleAlert, ScanLine, Search, ShieldCheck } from "lucide-react";

import { DeviceStatus } from "@/components/employee/device-card";
import { EmployeeHeader } from "@/components/employee/employee-header";
import { loadSaleDevice, saveSaleDevice } from "@/lib/employee-sale";
import { findInventoryPhoneByImei, formatGhs, inventoryPhones, isPhoneSelectable, type Phone } from "@/lib/inventory";

export default function NewSalePage() {
  const router = useRouter();
  const [isScanning, setIsScanning] = useState(false);
  const [scannedCode, setScannedCode] = useState(inventoryPhones[0].imei);
  const [selectedPhone, setSelectedPhone] = useState<Phone | null>(inventoryPhones[0]);
  const [scanError, setScanError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const saved = loadSaleDevice();
      setSelectedPhone(saved);
      setScannedCode(saved.imei);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!isScanning || !videoRef.current) return;
    const reader = new BrowserMultiFormatReader();
    let cancelled = false;

    reader
      .decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } } },
        videoRef.current,
        (result) => {
          if (result && !cancelled) {
            const code = result.getText();
            setScannedCode(code);
            setSelectedPhone(findInventoryPhoneByImei(code));
            setIsScanning(false);
            controlsRef.current?.stop();
          }
        }
      )
      .then((controls) => {
        controlsRef.current = controls;
        if (cancelled) controls.stop();
      })
      .catch(() => {
        if (!cancelled) setScanError("Unable to access the camera. Please allow camera access and try again.");
      });

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [isScanning]);

  function startScanning() {
    setScannedCode("");
    setSelectedPhone(null);
    setScanError("");
    setIsScanning(true);
  }

  function stopScanning() {
    controlsRef.current?.stop();
    setIsScanning(false);
  }

  function continueSale() {
    if (!selectedPhone || !isPhoneSelectable(selectedPhone)) return;
    saveSaleDevice(selectedPhone);
    router.push("/new-sale/payment");
  }

  const available = selectedPhone ? isPhoneSelectable(selectedPhone) : false;

  return (
    <main className="min-h-screen bg-white pb-10 text-[#1D1D1F]">
      <EmployeeHeader title="New Sale" backHref="/home" backLabel="Home" />

      <div className="mx-auto max-w-lg px-6">
        <section className="mt-9">
          <h1 className="text-[38px] font-semibold leading-tight tracking-[-1.2px] text-[#6E0728]">New Sale.</h1>
          <p className="mt-2 text-[21px] font-semibold leading-snug tracking-[-0.45px]">
            <span className="text-[#6E0728]">Find the right</span>{" "}
            <span className="text-[#86868B]">iPhone for your customer.</span>
          </p>
        </section>

        {selectedPhone ? (
          <section className="mt-7">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#86868B]">Device selected</p>
                <h2 className="mt-1 text-[23px] font-semibold tracking-[-0.6px]">Phone found.</h2>
              </div>
              <span className={`flex size-9 items-center justify-center rounded-full ${available ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                {available ? <Check size={19} /> : <CircleAlert size={19} />}
              </span>
            </div>

            <div className="overflow-hidden rounded-2xl border border-[#E5E5E7] bg-white">
              <div className="bg-[#FAFAFC] px-5 py-6">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[#86868B]">Physical inventory</p>
                  <DeviceStatus status={selectedPhone.status} />
                </div>
                <h3 className="mt-3 text-[25px] font-semibold tracking-[-0.8px]">{selectedPhone.model}</h3>
                <p className="mt-1 text-[14px] text-[#86868B]">{selectedPhone.storage} · {selectedPhone.colour}</p>
              </div>

              <div className="space-y-4 p-5">
                <div className="grid grid-cols-2 gap-x-4 gap-y-5">
                  <Detail label="Condition" value={selectedPhone.condition} />
                  <Detail label="Battery health" value={`${selectedPhone.battery}%`} />
                  <div className="col-span-2">
                    <p className="text-[12px] text-[#86868B]">IMEI / Barcode</p>
                    <p className="mt-1 break-all font-mono text-[13px] font-medium">{selectedPhone.imei}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[12px] text-[#86868B]">Selling price</p>
                    <p className="mt-1 text-[24px] font-semibold tracking-[-0.6px] text-[#6E0728]">{formatGhs(selectedPhone.price)}</p>
                  </div>
                </div>

                {!available ? (
                  <div className="flex gap-3 rounded-xl border border-[#F2E2BD] bg-[#FFF9EB] p-3 text-xs leading-5 text-[#765613]">
                    <CircleAlert className="mt-0.5 size-4 shrink-0" />
                    <p>This IMEI is {selectedPhone.status.toLowerCase()} and cannot be used for a new sale.</p>
                  </div>
                ) : null}

                <div className="border-t border-[#E5E5E7] pt-4">
                  <button type="button" onClick={continueSale} disabled={!available} className="w-full rounded-full bg-[#6E0728] px-5 py-4 text-[15px] font-semibold text-white transition hover:bg-[#57051F] active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#C7AAB4]">
                    {available ? "Continue with this iPhone" : "Device unavailable"}
                  </button>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button type="button" onClick={startScanning} className="flex items-center justify-center gap-2 rounded-full py-2.5 text-[13px] font-semibold text-[#6E0728]"><ScanLine size={15} /> Scan another</button>
                    <Link href="/inventory" className="flex items-center justify-center gap-2 rounded-full py-2.5 text-[13px] font-semibold text-[#6E0728]"><Search size={15} /> Browse stock</Link>
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : scannedCode ? (
          <div className="mt-7 rounded-2xl border border-[#F0CECC] bg-[#FFF3F2] p-5">
            <p className="text-sm font-semibold text-[#A13B34]">No inventory match</p>
            <p className="mt-2 text-xs leading-5 text-[#7D514D]">No sample device was found for {scannedCode}. The IMEI has not been externally verified.</p>
            <div className="mt-4 flex gap-3">
              <button type="button" onClick={startScanning} className="text-sm font-semibold text-[#6E0728]">Scan again</button>
              <Link href="/inventory" className="text-sm font-semibold text-[#6E0728]">Browse inventory</Link>
            </div>
          </div>
        ) : null}

        {scanError ? <p className="mt-4 rounded-xl bg-[#FFF3F3] p-4 text-[13px] text-[#B42318]">{scanError}</p> : null}

        <div className="mt-6 flex gap-3 rounded-xl bg-[#F7F7F8] p-4 text-xs leading-5 text-[#68686D]">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#6E0728]" />
          <p>Sample inventory only. IMEI and availability are not database-locked or externally verified in this preview.</p>
        </div>
      </div>

      {isScanning ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-black">
          <div className="flex items-center justify-between px-6 pb-5 pt-[calc(env(safe-area-inset-top)+16px)] text-white">
            <button type="button" onClick={stopScanning} className="text-[15px]">Cancel</button>
            <span className="text-[15px] font-semibold">Scan barcode</span>
            <span className="w-12" />
          </div>
          <div className="flex flex-1 flex-col items-center justify-center px-6">
            <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-[#222]">
              <video ref={videoRef} className="aspect-[3/4] w-full object-cover" autoPlay muted playsInline />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative h-36 w-[85%] rounded-xl border-2 border-white/90">
                  <div className="absolute inset-x-2 top-1/2 h-[2px] bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                </div>
              </div>
            </div>
            <p className="mt-7 text-center text-[15px] text-white">Position the barcode inside the frame.</p>
            <p className="mt-2 text-center text-[12px] text-white/60">The result will be matched against sample inventory.</p>
          </div>
          <div className="pb-[calc(env(safe-area-inset-bottom)+24px)]" />
        </div>
      ) : null}
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[12px] text-[#86868B]">{label}</p><p className="mt-1 text-[15px] font-semibold">{value}</p></div>;
}
