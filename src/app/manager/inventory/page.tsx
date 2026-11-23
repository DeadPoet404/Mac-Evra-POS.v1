"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Apple,
  ArrowDown,
  ArrowLeft,
  ArrowUpRight,
  Boxes,
  Check,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  LayoutDashboard,
  Menu,
  Plus,
  Search,
  Settings,
  Smartphone,
  Users,
  X,
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

type Phone = {
  id: number
  model: string
  storage: string
  colour: string
  condition: string
  battery: number
  imei: string
  price: number
  status: "Available" | "Sold" | "Reserved"
}

const initialPhones: Phone[] = [
  {
    id: 1,
    model: "iPhone 15 Pro",
    storage: "256GB",
    colour: "Natural Titanium",
    condition: "Excellent",
    battery: 92,
    imei: "356789104567890",
    price: 8500,
    status: "Available",
  },
  {
    id: 2,
    model: "iPhone 14 Pro",
    storage: "128GB",
    colour: "Deep Purple",
    condition: "Excellent",
    battery: 89,
    imei: "356789104567891",
    price: 7200,
    status: "Available",
  },
  {
    id: 3,
    model: "iPhone 13",
    storage: "128GB",
    colour: "Midnight",
    condition: "Good",
    battery: 86,
    imei: "356789104567892",
    price: 4900,
    status: "Reserved",
  },
  {
    id: 4,
    model: "iPhone 15",
    storage: "128GB",
    colour: "Pink",
    condition: "Excellent",
    battery: 96,
    imei: "356789104567893",
    price: 6800,
    status: "Available",
  },
  {
    id: 5,
    model: "iPhone 14",
    storage: "128GB",
    colour: "Blue",
    condition: "Good",
    battery: 84,
    imei: "356789104567894",
    price: 5300,
    status: "Sold",
  },
  {
    id: 6,
    model: "iPhone 13 Pro",
    storage: "256GB",
    colour: "Sierra Blue",
    condition: "Good",
    battery: 88,
    imei: "356789104567895",
    price: 5900,
    status: "Available",
  },
]

const money = (amount: number) =>
  `GH₵ ${amount.toLocaleString("en-GH")}`

export default function InventoryPage() {
  const router = useRouter()
  const [phones, setPhones] = useState(initialPhones)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("All")
  const [selectedPhone, setSelectedPhone] = useState<Phone | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  const [newPhone, setNewPhone] = useState({
    model: "",
    storage: "",
    colour: "",
    condition: "Excellent",
    battery: "",
    imei: "",
    price: "",
  })

  const available = phones.filter((phone) => phone.status === "Available").length
  const reserved = phones.filter((phone) => phone.status === "Reserved").length
  const sold = phones.filter((phone) => phone.status === "Sold").length

  const filteredPhones = useMemo(() => {
    const query = search.toLowerCase().trim()

    return phones.filter((phone) => {
      const matchesSearch =
        !query ||
        phone.model.toLowerCase().includes(query) ||
        phone.imei.toLowerCase().includes(query) ||
        phone.colour.toLowerCase().includes(query) ||
        phone.storage.toLowerCase().includes(query)

      const matchesStatus =
        statusFilter === "All" || phone.status === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [phones, search, statusFilter])

  function addPhone() {
    if (
      !newPhone.model.trim() ||
      !newPhone.storage.trim() ||
      !newPhone.imei.trim() ||
      !newPhone.price.trim()
    ) {
      return
    }

    const phone: Phone = {
      id: Date.now(),
      model: newPhone.model,
      storage: newPhone.storage,
      colour: newPhone.colour || "Not specified",
      condition: newPhone.condition,
      battery: Number(newPhone.battery) || 0,
      imei: newPhone.imei,
      price: Number(newPhone.price),
      status: "Available",
    }

    setPhones((current) => [phone, ...current])
    setSelectedPhone(phone)
    setShowAddForm(false)
    setNewPhone({
      model: "",
      storage: "",
      colour: "",
      condition: "Excellent",
      battery: "",
      imei: "",
      price: "",
    })
  }

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
                    isActive={item.label === "Inventory"}
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
            <span className="text-sm font-medium text-[#1D1D1F]">Inventory</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden size-8 items-center justify-center rounded-full bg-[#F1E8EC] text-sm font-semibold text-[#6E0728] sm:flex">
              A
            </div>
            <span className="hidden text-sm font-medium text-[#1D1D1F] sm:block">Alex Morgan</span>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1500px] space-y-7 p-5 md:p-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="mb-2 text-sm font-medium text-[#86868B]">STOCK MANAGEMENT</p>
              <h1 className="text-3xl font-semibold tracking-tight text-[#1D1D1F]">
                Inventory
              </h1>
              <p className="mt-2 text-sm text-[#86868B]">
                Manage your iPhones and keep track of every device.
              </p>
            </div>
            <Button
              onClick={() => {
                setShowAddForm(!showAddForm)
                setSelectedPhone(null)
              }}
              className="h-10 rounded-lg bg-[#6E0728] px-4 text-white hover:bg-[#56051F]"
            >
              {showAddForm ? <X size={17} /> : <Plus size={17} />}
              {showAddForm ? "Close form" : "Add a phone"}
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Total devices", value: phones.length, note: "Across all stock", icon: Smartphone },
              { label: "Available", value: available, note: "Ready for sale", icon: Check },
              { label: "Reserved", value: reserved, note: "Awaiting completion", icon: ClipboardList },
              { label: "Sold", value: sold, note: "Completed sales", icon: ArrowUpRight },
            ].map((item) => (
              <Card key={item.label} className="rounded-xl border-[#E8E8ED] shadow-none">
                <CardContent className="flex items-start justify-between p-5">
                  <div>
                    <p className="text-sm text-[#86868B]">{item.label}</p>
                    <p className="mt-2 text-3xl font-semibold tracking-tight text-[#1D1D1F]">
                      {item.value}
                    </p>
                    <p className="mt-1 text-xs text-[#A1A1A6]">{item.note}</p>
                  </div>
                  <div className="flex size-10 items-center justify-center rounded-xl bg-[#F5EDF0] text-[#6E0728]">
                    <item.icon size={19} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {showAddForm && (
            <Card className="rounded-xl border-[#E8E8ED] shadow-none">
              <CardContent className="p-5 md:p-6">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-[#1D1D1F]">Add a device</h2>
                    <p className="mt-1 text-sm text-[#86868B]">
                      Enter the details of the physical iPhone being added to stock.
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setShowAddForm(false)}>
                    <X size={18} />
                  </Button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <FormField label="iPhone model">
                    <Input
                      placeholder="e.g. iPhone 15 Pro"
                      value={newPhone.model}
                      onChange={(e) => setNewPhone({ ...newPhone, model: e.target.value })}
                    />
                  </FormField>
                  <FormField label="Storage">
                    <Input
                      placeholder="e.g. 256GB"
                      value={newPhone.storage}
                      onChange={(e) => setNewPhone({ ...newPhone, storage: e.target.value })}
                    />
                  </FormField>
                  <FormField label="Colour">
                    <Input
                      placeholder="e.g. Natural Titanium"
                      value={newPhone.colour}
                      onChange={(e) => setNewPhone({ ...newPhone, colour: e.target.value })}
                    />
                  </FormField>
                  <FormField label="Condition">
                    <select
                      value={newPhone.condition}
                      onChange={(e) => setNewPhone({ ...newPhone, condition: e.target.value })}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option>Excellent</option>
                      <option>Good</option>
                      <option>Fair</option>
                    </select>
                  </FormField>
                  <FormField label="Battery health (%)">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      placeholder="e.g. 92"
                      value={newPhone.battery}
                      onChange={(e) => setNewPhone({ ...newPhone, battery: e.target.value })}
                    />
                  </FormField>
                  <FormField label="IMEI">
                    <Input
                      placeholder="Enter device IMEI"
                      value={newPhone.imei}
                      onChange={(e) => setNewPhone({ ...newPhone, imei: e.target.value })}
                    />
                  </FormField>
                  <FormField label="Selling price (GH₵)">
                    <Input
                      type="number"
                      min="0"
                      placeholder="e.g. 8500"
                      value={newPhone.price}
                      onChange={(e) => setNewPhone({ ...newPhone, price: e.target.value })}
                    />
                  </FormField>
                </div>

                <div className="mt-5 flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowAddForm(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={addPhone}
                    disabled={!newPhone.model.trim() || !newPhone.storage.trim() || !newPhone.imei.trim() || !newPhone.price.trim()}
                    className="bg-[#6E0728] text-white hover:bg-[#56051F]"
                  >
                    <Plus size={16} />
                    Add to inventory
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className={`grid gap-5 ${selectedPhone ? "xl:grid-cols-[minmax(0,1fr)_340px]" : "grid-cols-1"}`}>
            <Card className="min-w-0 rounded-xl border-[#E8E8ED] shadow-none">
              <CardContent className="p-0">
                <div className="flex flex-col justify-between gap-4 border-b border-[#E8E8ED] p-5 lg:flex-row lg:items-center">
                  <div>
                    <h2 className="font-semibold text-[#1D1D1F]">All devices</h2>
                    <p className="mt-1 text-sm text-[#86868B]">
                      {filteredPhones.length} devices shown
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A1A1A6]" size={16} />
                      <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search model or IMEI"
                        className="w-full pl-9 sm:w-[230px]"
                      />
                    </div>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="All">All statuses</option>
                      <option value="Available">Available</option>
                      <option value="Reserved">Reserved</option>
                      <option value="Sold">Sold</option>
                    </select>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="bg-[#FAFAFB] text-xs font-medium uppercase tracking-wide text-[#86868B]">
                      <tr>
                        <th className="px-5 py-3">Device</th>
                        <th className="px-4 py-3">Condition</th>
                        <th className="px-4 py-3">Battery</th>
                        <th className="px-4 py-3">IMEI</th>
                        <th className="px-4 py-3">Price</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPhones.map((phone) => (
                        <tr
                          key={phone.id}
                          onClick={() => {
                            setSelectedPhone(phone)
                            setShowAddForm(false)
                          }}
                          className={`cursor-pointer border-t border-[#F0F0F2] transition-colors hover:bg-[#FAF7F8] ${
                            selectedPhone?.id === phone.id ? "bg-[#FAF3F6]" : "bg-white"
                          }`}
                        >
                          <td className="px-5 py-4">
                            <div className="font-medium text-[#1D1D1F]">{phone.model}</div>
                            <div className="mt-1 text-xs text-[#86868B]">
                              {phone.storage} · {phone.colour}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-[#424245]">{phone.condition}</td>
                          <td className="px-4 py-4 text-[#424245]">{phone.battery}%</td>
                          <td className="px-4 py-4 font-mono text-xs text-[#86868B]">{phone.imei}</td>
                          <td className="px-4 py-4 font-medium text-[#1D1D1F]">{money(phone.price)}</td>
                          <td className="px-4 py-4">
                            <StatusBadge status={phone.status} />
                          </td>
                          <td className="px-4 py-4 text-[#A1A1A6]">
                            <ChevronRight size={17} />
                          </td>
                        </tr>
                      ))}
                      {filteredPhones.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-5 py-12 text-center text-sm text-[#86868B]">
                            No devices match your search.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {selectedPhone && (
              <Card className="h-fit rounded-xl border-[#E8E8ED] shadow-none">
                <CardContent className="p-5">
                  <div className="mb-5 flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-[#86868B]">
                        Device details
                      </p>
                      <h2 className="mt-2 text-lg font-semibold text-[#1D1D1F]">
                        {selectedPhone.model}
                      </h2>
                      <p className="mt-1 text-sm text-[#86868B]">
                        {selectedPhone.storage} · {selectedPhone.colour}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setSelectedPhone(null)}>
                      <X size={18} />
                    </Button>
                  </div>

                  <div className="mb-5 flex h-36 items-center justify-center rounded-xl bg-[#F7F7F8]">
                    <Smartphone size={58} strokeWidth={1.2} className="text-[#A1A1A6]" />
                  </div>

                  <div className="mb-5">
                    <StatusBadge status={selectedPhone.status} />
                  </div>

                  <div className="space-y-4">
                    <DetailRow label="Condition" value={selectedPhone.condition} />
                    <DetailRow label="Battery health" value={`${selectedPhone.battery}%`} />
                    <DetailRow label="IMEI" value={selectedPhone.imei} />
                    <DetailRow label="Selling price" value={money(selectedPhone.price)} />
                  </div>

                  <Separator className="my-5" />
                  <Button variant="outline" className="w-full" onClick={() => setSelectedPhone(null)}>
                    Close details
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-[#424245]">{label}</label>
      {children}
    </div>
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

function StatusBadge({ status }: { status: Phone["status"] }) {
  const styles = {
    Available: "border-[#CDE9D7] bg-[#F0FAF3] text-[#267343]",
    Reserved: "border-[#F2E2BD] bg-[#FFF9EB] text-[#98701A]",
    Sold: "border-[#E5E5EA] bg-[#F5F5F7] text-[#68686D]",
  }

  return (
    <Badge variant="outline" className={styles[status]}>
      {status}
    </Badge>
  )
}
