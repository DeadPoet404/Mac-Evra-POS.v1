import Image from "next/image";

export default function ActionCards() {
  const arrow = (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F0F0F2] transition group-hover:bg-[#E5E5E7]">
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5 text-gray-600"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">

      {/* NEW SALE */}
      <button className="group overflow-hidden rounded-[28px] bg-white text-left shadow-sm transition hover:shadow-md active:scale-[0.99]">
        <div className="flex h-[240px] items-center justify-center bg-white p-5">
          <Image
            src="/Mac-evra-sale-badge.jpeg"
            alt="New Sale"
            width={190}
            height={190}
            className="h-[190px] w-[190px] object-contain"
          />
        </div>

        <div className="flex items-center justify-between px-6 pb-6 pt-2">
          <div>
            <h2 className="text-xl font-semibold text-[#1D1D1F]">New Sale</h2>
            <p className="mt-1 text-sm text-gray-500">
              Start a sale for a customer.
            </p>
          </div>
          {arrow}
        </div>
      </button>

      {/* PROCESS A SWAP */}
      <button className="group overflow-hidden rounded-[28px] bg-white text-left shadow-sm transition hover:shadow-md active:scale-[0.99]">
        <div className="flex h-[240px] items-center justify-center bg-white p-5">
          <svg viewBox="0 0 200 200" className="h-[180px] w-[180px]" fill="none">
            <rect x="53" y="20" width="94" height="160" rx="17" fill="#F2F2F4" />
            <rect x="60" y="30" width="80" height="140" rx="11" fill="#D9D9DE" />
            <circle cx="100" cy="155" r="5" fill="#A1A1AA" />
            <path d="M78 85h44m-10-10 10 10-10 10" stroke="#555" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M122 112H78m10-10-10 10 10 10" stroke="#555" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <div className="flex items-center justify-between px-6 pb-6 pt-2">
          <div>
            <h2 className="text-xl font-semibold text-[#1D1D1F]">Process a Swap</h2>
            <p className="mt-1 text-sm text-gray-500">
              Trade in a customer&apos;s device.
            </p>
          </div>
          {arrow}
        </div>
      </button>

      {/* INVENTORY */}
      <button className="group overflow-hidden rounded-[28px] bg-white text-left shadow-sm transition hover:shadow-md active:scale-[0.99]">
        <div className="flex h-[240px] items-center justify-center bg-white p-5">
          <svg viewBox="0 0 200 200" className="h-[180px] w-[180px]" fill="none">
            <rect x="53" y="20" width="94" height="160" rx="17" fill="#F2F2F4" />
            <rect x="60" y="30" width="80" height="140" rx="11" fill="#D9D9DE" />
            <circle cx="100" cy="155" r="5" fill="#A1A1AA" />
            <rect x="78" y="65" width="44" height="36" rx="5" stroke="#777" strokeWidth="4" />
            <path d="M78 115h44M78 128h32" stroke="#777" strokeWidth="4" strokeLinecap="round" />
          </svg>
        </div>

        <div className="flex items-center justify-between px-6 pb-6 pt-2">
          <div>
            <h2 className="text-xl font-semibold text-[#1D1D1F]">Inventory</h2>
            <p className="mt-1 text-sm text-gray-500">
              Browse and manage your stock.
            </p>
          </div>
          {arrow}
        </div>
      </button>

    </div>
  );
}
