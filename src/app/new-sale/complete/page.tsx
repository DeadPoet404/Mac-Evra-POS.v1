export default function SaleCompletePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 text-[#1D1D1F]">
      <section className="w-full max-w-md text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-50 text-green-700">
          <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 12 4 4L19 6" />
          </svg>
        </div>
        <h1 className="mt-6 text-[32px] font-semibold tracking-[-1px] text-[#6E0728]">Sale complete.</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[#86868B]">The sale preview has been completed successfully.</p>
        <p className="mt-8 text-[12px] text-[#86868B]">Receipt generation will be connected in a later step.</p>
        <a href="/home" className="mt-8 block w-full rounded-full bg-[#6E0728] px-5 py-4 text-[15px] font-semibold text-white">Back to Home</a>
      </section>
    </main>
  );
}
