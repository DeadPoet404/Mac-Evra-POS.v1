"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BrowserMultiFormatReader } from "@zxing/browser";

export default function NewSalePage() {
  const router = useRouter();
  const [isScanning, setIsScanning] = useState(false);
  const [scannedCode, setScannedCode] = useState("356789104567890");
  const [scanError, setScanError] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    if (!isScanning || !videoRef.current) return;

    const reader = new BrowserMultiFormatReader();
    let cancelled = false;

    reader
      .decodeFromConstraints(
        {
          video: {
            facingMode: { ideal: "environment" },
          },
        },
        videoRef.current,
        (result) => {
          if (result && !cancelled) {
            setScannedCode(result.getText());
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
        if (!cancelled) {
          setScanError(
            "Unable to access the camera. Please allow camera access and try again."
          );
        }
      });

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [isScanning]);

  const startScanning = () => {
    setScannedCode("");
    setScanError("");
    setIsScanning(true);
  };

  const stopScanning = () => {
    controlsRef.current?.stop();
    setIsScanning(false);
  };

  return (
    <main className="min-h-screen min-h-[100svh] bg-white pt-[env(safe-area-inset-top)] pb-10 text-[#1D1D1F]">

      {/* Menu Bar */}
      <header className="sticky top-0 z-30 h-12 w-full bg-[#FAFAFC]/90 backdrop-blur-md">
        <div className="mx-auto flex h-full max-w-lg items-center justify-between px-6">

          <a
            href="/home"
            aria-label="Home"
            className="flex h-9 w-9 items-center justify-center text-[#1D1D1F] transition hover:opacity-75 active:scale-95"
          >
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

        {/* Introduction */}
        <section className="mt-9">
          <h1
            className="text-[38px] font-semibold leading-tight tracking-[-1.2px] text-[#6E0728]"
            style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif' }}
          >
            New Sale.
          </h1>

          <p
            className="mt-2 text-[21px] font-semibold leading-snug tracking-[-0.45px]"
            style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif' }}
          >
            <span className="text-[#6E0728]">Find the right</span>{" "}
            <span className="text-[#86868B]">iPhone for your customer.</span>
          </p>
        </section>

        {/* Scanned Phone Details */}
        {scannedCode && (
          <section className="mt-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#86868B]">
                  Scan successful
                </p>
                <h2 className="mt-1 text-[23px] font-semibold tracking-[-0.6px] text-[#1D1D1F]">
                  Phone found.
                </h2>
              </div>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-green-50 text-green-700">
                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m5 12 4 4L19 6" />
                </svg>
              </span>
            </div>

            <div className="overflow-hidden rounded-2xl border border-[#E5E5E7] bg-white">
              <div className="bg-[#FAFAFC] px-5 py-6">
                <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[#86868B]">
                  Available inventory
                </p>
                <h3 className="mt-3 text-[25px] font-semibold tracking-[-0.8px] text-[#1D1D1F]">
                  iPhone 15 Pro
                </h3>
                <p className="mt-1 text-[14px] text-[#86868B]">
                  256GB · Natural Titanium
                </p>
              </div>

              <div className="space-y-4 p-5">
                <div className="grid grid-cols-2 gap-x-4 gap-y-5">
                  <div>
                    <p className="text-[12px] text-[#86868B]">Condition</p>
                    <p className="mt-1 text-[15px] font-semibold">Excellent</p>
                  </div>
                  <div>
                    <p className="text-[12px] text-[#86868B]">Battery health</p>
                    <p className="mt-1 text-[15px] font-semibold">92%</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[12px] text-[#86868B]">IMEI / Barcode</p>
                    <p className="mt-1 break-all text-[14px] font-medium tracking-wide">
                      {scannedCode}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[12px] text-[#86868B]">Selling price</p>
                    <p className="mt-1 text-[24px] font-semibold tracking-[-0.6px] text-[#6E0728]">
                      GH₵ 8,500
                    </p>
                  </div>
                </div>

                <div className="border-t border-[#E5E5E7] pt-4">
                  <button
                    type="button"
                    onClick={() => router.push("/new-sale/payment")}
                    className="w-full rounded-full bg-[#6E0728] px-5 py-4 text-[15px] font-semibold text-white transition hover:bg-[#57051F] active:scale-[0.98]"
                  >
                    Continue
                  </button>
                  <button
                    type="button"
                    onClick={startScanning}
                    className="mt-4 w-full py-2 text-[14px] font-semibold text-[#6E0728]"
                  >
                    Scan another phone
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {scanError && (
          <p className="mt-4 rounded-xl bg-[#FFF3F3] p-4 text-[13px] text-[#B42318]">
            {scanError}
          </p>
        )}

      </div>

      {/* Camera Scanner */}
      {isScanning && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black">
          <div className="flex items-center justify-between px-6 pt-[calc(env(safe-area-inset-top)+16px)] pb-5 text-white">
            <button type="button" onClick={stopScanning} className="text-[15px]">
              Cancel
            </button>
            <span className="text-[15px] font-semibold">Scan barcode</span>
            <span className="w-12" />
          </div>

          <div className="flex flex-1 flex-col items-center justify-center px-6">
            <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-[#222]">
              <video
                ref={videoRef}
                className="aspect-[3/4] w-full object-cover"
                autoPlay
                muted
                playsInline
              />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative h-36 w-[85%]">
                  <span className="absolute left-0 top-0 h-7 w-7 rounded-tl-lg border-l-[3px] border-t-[3px] border-white" />
                  <span className="absolute right-0 top-0 h-7 w-7 rounded-tr-lg border-r-[3px] border-t-[3px] border-white" />
                  <span className="absolute bottom-0 left-0 h-7 w-7 rounded-bl-lg border-b-[3px] border-l-[3px] border-white" />
                  <span className="absolute bottom-0 right-0 h-7 w-7 rounded-br-lg border-b-[3px] border-r-[3px] border-white" />
                  <div className="absolute inset-x-2 top-1/2 h-[2px] bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                </div>
              </div>
            </div>
            <p className="mt-7 text-center text-[15px] text-white">
              Position the barcode inside the frame.
            </p>
            <p className="mt-2 text-center text-[12px] text-white/60">
              Hold your phone steady while scanning.
            </p>
          </div>

          <div className="pb-[calc(env(safe-area-inset-bottom)+24px)]" />
        </div>
      )}
    </main>
  );
}
