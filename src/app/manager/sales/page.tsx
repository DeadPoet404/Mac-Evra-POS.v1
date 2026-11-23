"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Apple,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  LayoutDashboard,
  Search,
  Settings,
  Users,
  X,
  Wallet,
  Smartphone,
  CalendarDays,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"

type Sale = {
  id: string
  date: string
  time: string
  employee: string
  customer: string
  phone: string
  imei: string
  total: number
  received: number
  method: string
  status: "Completed" | "Pending" | "Partially paid"
}

const initialSales: Sale[] = [
  {
    id: "ME-2026-001",
    date: "23 Nov 2026",
    time: "10:42 AM",
    employee: "Alex Morgan",
    customer: "Daniel Mensah",
    phone: "iPhone 15 Pro · 256GB",
    imei: "356789104567890",
    total: 8500,
    received: 8500,
    method: "MTN MoMo",
    status: "Completed",
  },
  {
    id: "ME-2026-002",
    date: "23 Nov 2026",
    time: "11:18 AM",
    employee: "Sarah Owusu",
    customer: "Ama Boateng",
    phone: "iPhone 14 Pro · 128GB",
    imei: "356789104567891",
    total: 7200,
    received: 5000,
    method: "Cash",
    status: "Partially paid",
  },
  {
    id: "ME-2026-003",
    date: "22 Nov 2026",
    time: "03:25 PM",
    employee: "Alex Morgan",
    customer: "Kwame Asante",
    phone: "iPhone 13 · 128GB",
    imei: "356789104567892",
    total: 4900,
    received: 4900,
    method: "Bank Transfer",
    status: "Completed",
  },
  {
    id: "ME-2026-004",
    date: "22 Nov 2026",
    time: "01:06 PM",
    employee: "Michael Addo",
    customer: "Nana Yeboah",
    phone: "iPhone 15 · 128GB",
    imei: "356789104567893",
    total: 6800,
    received: 0,
    method: "Card",
    status: "Pending",
  },
  {
    id: "ME-2026-005",
    date: "21 Nov 2026",
    time: "04:51 PM",
    employee: "Sarah Owusu",
    customer: "Esi Agyeman",
    phone: "iPhone 14 · 128GB",
    imei: "356789104567894",
    total: 5300,
    received: 5300,
    method: "Cash",
    status: "Completed",
  },
  {
    id: "ME-2026-006",
    date: "21 Nov 2026",
    time: "12:32 PM",
    employee: "Michael Addo",
    customer: "Kojo Frimpong",
    phone: "iPhone 13 Pro · 256GB",
    imei: "356789104567895",
    total: 5900,
    received: 3000,
    method: "MTN MoMo",
    status: "Partially paid",
  },
]

const money = (amount: number) => `GH₵ ${amount.toLocaleString("en-GH")}`

export default function SalesPage() {
  const router = useRouter()
  const [sales] = useState(initialSales)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("All")
  const [methodFilter, setMethodFilter] = useState("All")
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)

  const completed = sales.filter((sale) => sale.status === "Completed")
  const pending = sales.filter((sale) => sale.status === "Pending")
  const revenue = completed.reduce((sum, sale) => sum + sale.received, 0)
  const collected = sales.reduce((sum, sale) => sum + sale.received, 0)
  const outstanding = sales.reduce(
    (sum, sale) => sum + Math.max(0, sale.total - sale.received),
    0
  )

  const filteredSales = useMemo(() => {
    const query = search.toLowerCase().trim()

    return sales.filter((sale) => {
      const matchesSearch =
        !query ||
        sale.id.toLowerCase().includes(query) ||
        sale.customer.toLowerCase().includes(query) ||
        sale.employee.toLowerCase().includes(query) ||
        sale.phone.toLowerCase().includes(query) ||
        sale.imei.includes(query)

      const matchesStatus =
        statusFilter === "All" || sale.status === statusFilter

      const matchesMethod =
        methodFilter === "All" || sale.method === methodFilter

      return matchesSearch && matchesStatus && matchesMethod
    })
  }, [sales, search, statusFilter, methodFilter])

  const navItems = [
    { label: "Overview", icon: LayoutDashboard, href: "/manager" },
    { label: "Inventory", icon: Boxes, href: "/manager/inventory" },
    { label: "Sales", icon: ClipboardList, href: "/manager/sales" },
    { label: "Employees", icon: Users, href: "/manager/employees" },
  ]

  return (
    <SidebarProvider>
      <Sidebar className="border-r border-[#E8E8ED] bg-white">
        <SidebarHeader className="px-5 py-6">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-[#6E0728] text-white">
              <Apple size={19} />
            </div>
            <div>
              <p className="text-[15px] font-semibold tracking-[0.12em] text-[#1D1D1F]">
                MAC EVRA
              </p>
              <p className="text-xs text-[#86868B]">Management</p>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent className="px-3">
          <SidebarGroup>
            <SidebarGroupLabel className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-[#A1A1A6]">
              Workspace
            </SidebarGroupLabel>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton
                    isActive={item.label === "Sales"}
                    onClick={() => router.push(item.href)}
                    className="h-10 rounded-lg px-3"
                  >
                    <item.icon size={18} />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="px-3 pb-5">
          <Separator className="mb-4" />
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton className="h-10 rounded-lg px-3">
                <Settings size={18} />
                <span>Settings</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton className="h-10 rounded-lg px-3">
                <CircleHelp size={18} />
                <span>Help & Support</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <div className="mt-4 flex items-center gap-3 rounded-xl bg-[#F7F7F8] p-3">
            <div className="flex size-9 items-center justify-center rounded-full bg-[#E9DCE1] text-sm font-semibold text-[#6E0728]">
              A
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[#1D1D1F]">Alex Morgan</p>
              <p className="text-xs text-[#86868B]">Manager</p>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-h-screen bg-[#F7F7F8]">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[#E8E8ED] bg-white/90 px-5 backdrop-blur-md md:px-8">
          <div className="flex items-center gap-3">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-5" />
            <span className="text-sm text-[#86868B]">Manager</span>
            <ChevronRight size={14} className="text-[#A1A1A6]" />
            <span className="text-sm font-medium text-[#1D1D1F]">Sales</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden size-8 items-center justify-center rounded-full bg-[#F1E8EC] text-sm font-semibold text-[#6E0728] sm:flex">
              A
            </div>
            <span className="hidden text-sm font-medium text-[#1D1D1F] sm:block">Alex Morgan</span>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1500px] space-y-7 p-5 md:p-8">
          <div>
            <p className="mb-2 text-sm font-medium text-[#86868B]">TRANSACTION MANAGEMENT</p>
            <h1 className="text-3xl font-semibold tracking-tight text-[#1D1D1F]">
              Sales
            </h1>
            <p className="mt-2 text-sm text-[#86868B]">
              Track transactions, payments and customer purchases.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="Completed sales"
              value={String(completed.length)}
              note="Successfully completed"
              icon={CheckCircle2}
            />
            <SummaryCard
              label="Sales revenue"
              value={money(revenue)}
              note="From completed transactions"
              icon={ArrowUpRight}
            />
            <SummaryCard
              label="Payments collected"
              value={money(collected)}
              note="Total received so far"
              icon={Wallet}
            />
            <SummaryCard
              label="Outstanding balance"
              value={money(outstanding)}
              note={`${pending.length} pending payment${pending.length === 1 ? "" : "s"}`}
              icon={ArrowDownRight}
            />
          </div>

          <div className={`grid gap-5 ${selectedSale ? "xl:grid-cols-[minmax(0,1fr)_340px]" : "grid-cols-1"}`}>
            <Card className="min-w-0 rounded-xl border-[#E8E8ED] shadow-none">
              <CardContent className="p-0">
                <div className="flex flex-col justify-between gap-4 border-b border-[#E8E8ED] p-5 lg:flex-row lg:items-center">
                  <div>
                    <h2 className="font-semibold text-[#1D1D1F]">All transactions</h2>
                    <p className="mt-1 text-sm text-[#86868B]">
                      {filteredSales.length} transactions shown
                    </p>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <div className="relative">
                      <Search
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A1A1A6]"
                        size={16}
                      />
                      <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search sales..."
                        className="w-full pl-9 sm:w-[210px]"
                      />
                    </div>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="All">All statuses</option>
                      <option value="Completed">Completed</option>
                      <option value="Pending">Pending</option>
                      <option value="Partially paid">Partially paid</option>
                    </select>
                    <select
                      value={methodFilter}
                      onChange={(e) => setMethodFilter(e.target.value)}
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="All">All methods</option>
                      <option value="Cash">Cash</option>
                      <option value="MTN MoMo">MTN MoMo</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="Card">Card</option>
                    </select>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead className="bg-[#FAFAFB] text-xs font-medium uppercase tracking-wide text-[#86868B]">
                      <tr>
                        <th className="px-5 py-3">Receipt</th>
                        <th className="px-4 py-3">Customer</th>
                        <th className="px-4 py-3">Device</th>
                        <th className="px-4 py-3">Employee</th>
                        <th className="px-4 py-3">Total</th>
                        <th className="px-4 py-3">Payment</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSales.map((sale) => (
                        <tr
                          key={sale.id}
                          onClick={() => setSelectedSale(sale)}
                          className={`cursor-pointer border-t border-[#F0F0F2] transition-colors hover:bg-[#FAF7F8] ${
                            selectedSale?.id === sale.id ? "bg-[#FAF3F6]" : "bg-white"
                          }`}
                        >
                          <td className="px-5 py-4">
                            <p className="font-medium text-[#1D1D1F]">{sale.id}</p>
                            <p className="mt-1 text-xs text-[#86868B]">{sale.date}</p>
                          </td>
                          <td className="px-4 py-4 font-medium text-[#424245]">
                            {sale.customer}
                          </td>
                          <td className="px-4 py-4">
                            <p className="font-medium text-[#424245]">{sale.phone}</p>
                            <p className="mt-1 font-mono text-[11px] text-[#A1A1A6]">
                              IMEI {sale.imei}
                            </p>
                          </td>
                          <td className="px-4 py-4 text-[#424245]">{sale.employee}</td>
                          <td className="px-4 py-4 font-medium text-[#1D1D1F]">
                            {money(sale.total)}
                          </td>
                          <td className="px-4 py-4 text-[#424245]">{sale.method}</td>
                          <td className="px-4 py-4">
                            <StatusBadge status={sale.status} />
                          </td>
                          <td className="px-4 py-4 text-[#A1A1A6]">
                            <ChevronRight size={17} />
                          </td>
                        </tr>
                      ))}
                      {filteredSales.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-5 py-12 text-center text-sm text-[#86868B]">
                            No transactions match your filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {selectedSale && (
              <Card className="h-fit rounded-xl border-[#E8E8ED] shadow-none">
                <CardContent className="p-5">
                  <div className="mb-5 flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-[#86868B]">
                        Transaction details
                      </p>
                      <h2 className="mt-2 text-lg font-semibold text-[#1D1D1F]">
                        {selectedSale.id}
                      </h2>
                      <p className="mt-1 text-sm text-[#86868B]">
                        {selectedSale.date} · {selectedSale.time}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSelectedSale(null)}
                    >
                      <X size={18} />
                    </Button>
                  </div>

                  <StatusBadge status={selectedSale.status} />

                  <Separator className="my-5" />

                  <div className="space-y-4">
                    <DetailRow label="Customer" value={selectedSale.customer} />
                    <DetailRow label="Employee" value={selectedSale.employee} />
                    <DetailRow label="Device" value={selectedSale.phone} />
                    <DetailRow label="IMEI" value={selectedSale.imei} />
                    <DetailRow label="Payment method" value={selectedSale.method} />
                  </div>

                  <Separator className="my-5" />

                  <div className="space-y-3">
                    <DetailRow label="Sale total" value={money(selectedSale.total)} />
                    <DetailRow label="Amount received" value={money(selectedSale.received)} />
                    <DetailRow
                      label="Balance due"
                      value={money(Math.max(0, selectedSale.total - selectedSale.received))}
                    />
                  </div>

                  <div className="mt-5 rounded-lg bg-[#F7F7F8] p-3">
                    <p className="text-xs text-[#86868B]">Payment progress</p>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#E5E5EA]">
                      <div
                        className="h-full rounded-full bg-[#6E0728]"
                        style={{
                          width: `${Math.min(100, (selectedSale.received / selectedSale.total) * 100)}%`,
                        }}
                      />
                    </div>
                    <p className="mt-2 text-right text-xs font-medium text-[#424245]">
                      {Math.round((selectedSale.received / selectedSale.total) * 100)}% received
                    </p>
                  </div>

                  <Button
                    variant="outline"
                    className="mt-5 w-full"
                    onClick={() => setSelectedSale(null)}
                  >
                    Close details
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          <p className="text-xs text-[#A1A1A6]">
            Sample transaction data for frontend preview. No real payments or sales records are being changed.
          </p>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

function SummaryCard({
  label,
  value,
  note,
  icon: Icon,
}: {
  label: string
  value: string
  note: string
  icon: React.ElementType
}) {
  return (
    <Card className="rounded-xl border-[#E8E8ED] shadow-none">
      <CardContent className="flex items-start justify-between p-5">
        <div className="min-w-0">
          <p className="text-sm text-[#86868B]">{label}</p>
          <p className="mt-2 truncate text-2xl font-semibold tracking-tight text-[#1D1D1F]">
            {value}
          </p>
          <p className="mt-1 text-xs text-[#A1A1A6]">{note}</p>
        </div>
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#F5EDF0] text-[#6E0728]">
          <Icon size={19} />
        </div>
      </CardContent>
    </Card>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-sm text-[#86868B]">{label}</span>
      <span className="max-w-[190px] break-all text-right text-sm font-medium text-[#1D1D1F]">
        {value}
      </span>
    </div>
  )
}

function StatusBadge({ status }: { status: Sale["status"] }) {
  const styles = {
    Completed: "border-[#CDE9D7] bg-[#F0FAF3] text-[#267343]",
    Pending: "border-[#F2E2BD] bg-[#FFF9EB] text-[#98701A]",
    "Partially paid": "border-[#D8DDF5] bg-[#F3F5FF] text-[#4D5CA8]",
  }

  return (
    <Badge variant="outline" className={styles[status]}>
      {status}
    </Badge>
  )
}
