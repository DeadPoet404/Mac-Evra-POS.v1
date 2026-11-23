"use client";

import { useMemo, useState } from "react";
import {
  LayoutDashboard, ReceiptText, Smartphone, Users,
  ClipboardCheck, ChartNoAxesCombined, Search, Bell,
  ArrowUpRight, MoreHorizontal, CreditCard, Package,
  CircleAlert, CheckCircle2, Menu, CalendarDays,
  ChevronDown, Plus, Settings, LogOut, Store
} from "lucide-react";

import {
  SidebarProvider, Sidebar, SidebarHeader, SidebarContent,
  SidebarGroup, SidebarGroupLabel, SidebarMenu,
  SidebarMenuItem, SidebarMenuButton, SidebarFooter,
  SidebarInset, SidebarTrigger
} from "@/components/ui/sidebar";

import {
  Card, CardContent, CardHeader, CardTitle,
  CardDescription
} from "@/components/ui/card";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";

import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue
} from "@/components/ui/select";

import {
  DropdownMenu, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow
} from "@/components/ui/table";

import {
  Tabs, TabsList, TabsTrigger
} from "@/components/ui/tabs";

import {
  TooltipProvider, Tooltip, TooltipContent,
  TooltipTrigger
} from "@/components/ui/tooltip";

const navigation = [
  { label: "Overview", icon: LayoutDashboard, href: "#overview" },
  { label: "Sales", icon: ReceiptText, href: "#sales" },
  { label: "Inventory", icon: Smartphone, href: "#inventory" },
  { label: "Employees", icon: Users, href: "#employees" },
  { label: "Approvals", icon: ClipboardCheck, href: "#approvals", count: 2 },
  { label: "Reports", icon: ChartNoAxesCombined, href: "#reports" },
];

const sales = [
  { id: "ME-1048", customer: "Daniel Mensah", device: "iPhone 15 Pro · 256GB", amount: 8500, employee: "Alex", status: "Completed" },
  { id: "ME-1047", customer: "Ama Boateng", device: "iPhone 14 Pro · 128GB", amount: 6800, employee: "Sarah", status: "Completed" },
  { id: "ME-1046", customer: "Kojo Asante", device: "iPhone 13 · 128GB", amount: 4200, employee: "Alex", status: "Completed" },
  { id: "ME-1045", customer: "Nana Owusu", device: "iPhone 15 · 128GB", amount: 6100, employee: "Michael", status: "Pending" },
];

const stock = [
  { name: "iPhone 15 Pro", detail: "256GB · Natural Titanium", quantity: 6, status: "Healthy" },
  { name: "iPhone 14 Pro", detail: "128GB · Deep Purple", quantity: 3, status: "Low stock" },
  { name: "iPhone 13", detail: "128GB · Midnight", quantity: 10, status: "Healthy" },
];

const activities = [
  { icon: CheckCircle2, title: "Sale completed", detail: "Alex completed sale ME-1048", time: "12 min ago" },
  { icon: CreditCard, title: "Payment received", detail: "GH₵ 8,500 · MTN Mobile Money", time: "28 min ago" },
  { icon: CircleAlert, title: "Approval requested", detail: "Discount request · iPhone 14 Pro", time: "46 min ago" },
  { icon: Package, title: "Inventory updated", detail: "3 new devices added to stock", time: "1 hr ago" },
];

const money = (value: number) =>
  `GH₵ ${value.toLocaleString("en-GH")}`;

export default function ManagerDashboard() {
  const [active, setActive] = useState("Overview");
  const [period, setPeriod] = useState("30");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      const matchesSearch = [
        sale.id, sale.customer, sale.device, sale.employee
      ].join(" ").toLowerCase().includes(search.toLowerCase());

      const matchesStatus =
        status === "all" || sale.status.toLowerCase() === status;

      return matchesSearch && matchesStatus;
    });
  }, [search, status]);

  return (
    <TooltipProvider>
      <div className="manager-theme min-h-screen bg-background text-foreground">
        <SidebarProvider>
          <Sidebar collapsible="icon" variant="inset">
            <SidebarHeader className="px-4 py-6">
              <a href="/manager" className="flex items-center gap-2">
                <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">
                  M
                </div>
                <div className="group-data-[collapsible=icon]:hidden">
                  <p className="text-sm font-bold tracking-tight">MAC EVRA</p>
                  <p className="text-[10px] text-muted-foreground">Manager workspace</p>
                </div>
              </a>
            </SidebarHeader>

            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupLabel>STORE MANAGEMENT</SidebarGroupLabel>
                <SidebarMenu>
                  {navigation.map((item) => (
                    <SidebarMenuItem key={item.label}>
                      <SidebarMenuButton
                        isActive={active === item.label}
                        onClick={() => {
                          setActive(item.label);
                          document.querySelector(item.href)?.scrollIntoView({ behavior: "smooth" });
                        }}
                      >
                        <item.icon />
                        <span>{item.label}</span>
                        {item.count && (
                          <Badge className="ml-auto h-5 min-w-5 justify-center px-1 text-[10px]">
                            {item.count}
                          </Badge>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroup>

              <SidebarGroup className="mt-auto">
                <SidebarGroupLabel>SETTINGS</SidebarGroupLabel>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton tooltip="Settings">
                      <Settings />
                      <span>Settings</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroup>
            </SidebarContent>

            <SidebarFooter>
              <DropdownMenu>
                <DropdownMenuTrigger className="flex w-full cursor-pointer items-center rounded-lg text-left outline-none hover:bg-accent">
                  <div className="flex w-full items-center gap-3 px-2 py-3">
                    <Avatar className="size-9">
                      <AvatarFallback className="bg-[#F5E8EC] text-primary">MA</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1 text-left group-data-[collapsible=icon]:hidden">
                      <p className="truncate text-xs font-semibold">Manager Account</p>
                      <p className="text-[10px] text-muted-foreground">Store administrator</p>
                    </div>
                    <MoreHorizontal className="size-4 group-data-[collapsible=icon]:hidden" />
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="top">
                  <DropdownMenuLabel>Manager account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem><Settings /> Settings</DropdownMenuItem>
                  <DropdownMenuItem><LogOut /> Sign out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarFooter>
          </Sidebar>

          <SidebarInset className="min-w-0">
            <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/90 px-4 backdrop-blur-md sm:px-6 lg:px-8">
              <div className="flex items-center gap-3">
                <SidebarTrigger />
                <Separator orientation="vertical" className="h-5" />
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Store className="size-4" />
                  <span>Mac Evra Store</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon" className="relative">
                      <Bell />
                      <span className="absolute right-2 top-2 size-2 rounded-full bg-primary" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Notifications</TooltipContent>
                </Tooltip>
                <Avatar className="size-9">
                  <AvatarFallback className="bg-[#F5E8EC] text-primary">MA</AvatarFallback>
                </Avatar>
              </div>
            </header>

            <main id="overview" className="mx-auto w-full max-w-[1500px] space-y-6 p-4 sm:p-6 lg:p-8">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Monday, 23 November 2026</p>
                  <h1 className="mt-1 text-3xl font-semibold tracking-tight">Store overview</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Here's what's happening at your store.
                  </p>
                </div>
                <Button className="gap-2">
                  <Plus className="size-4" /> New action
                </Button>
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
                <Card>
                  <CardHeader className="flex flex-row items-start justify-between space-y-0">
                    <div>
                      <CardTitle className="text-base">Sales summary</CardTitle>
                      <CardDescription className="mt-1">Your store's sales performance</CardDescription>
                    </div>
                    <Select value={period} onValueChange={setPeriod}>
                      <SelectTrigger className="w-[145px]">
                        <CalendarDays className="mr-2 size-4 text-muted-foreground" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">Last 7 days</SelectItem>
                        <SelectItem value="30">Last 30 days</SelectItem>
                        <SelectItem value="year">This year</SelectItem>
                      </SelectContent>
                    </Select>
                  </CardHeader>

                  <CardContent>
                    <div className="flex items-end gap-3">
                      <p className="text-3xl font-semibold tracking-tight">GH₵ 48,960</p>
                      <Badge className="mb-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">↗ 12.8%</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">Total sales · selected period</p>

                    <div className="mt-6 h-[140px] w-full">
                      <svg viewBox="0 0 600 140" preserveAspectRatio="none" className="h-full w-full">
                        <defs>
                          <linearGradient id="salesArea" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="#6E0728" stopOpacity=".16" />
                            <stop offset="100%" stopColor="#6E0728" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <path d="M0 90 C30 75 40 86 65 80 S105 92 130 75 S170 58 195 70 S230 92 255 75 S295 61 320 68 S360 98 385 80 S425 72 450 83 S490 96 515 68 S555 61 575 48 S590 45 600 40 L600 140 L0 140 Z" fill="url(#salesArea)" />
                        <path d="M0 90 C30 75 40 86 65 80 S105 92 130 75 S170 58 195 70 S230 92 255 75 S295 61 320 68 S360 98 385 80 S425 72 450 83 S490 96 515 68 S555 61 575 48 S590 45 600 40" fill="none" stroke="#6E0728" strokeWidth="2.5" strokeLinecap="round" />
                      </svg>
                    </div>

                    <Separator className="my-5" />
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Completed sales</p>
                        <p className="mt-1 text-xl font-semibold">612</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Average sale</p>
                        <p className="mt-1 text-xl font-semibold">GH₵ 80</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Growth</p>
                        <p className="mt-1 text-xl font-semibold text-emerald-700">+12.8%</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Today's overview</CardTitle>
                    <CardDescription>Store performance at a glance</CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Sales today", value: "12", detail: "Transactions", icon: ReceiptText },
                      { label: "Money received", value: "GH₵ 24.5k", detail: "Confirmed payments", icon: CreditCard },
                      { label: "Available phones", value: "48", detail: "In inventory", icon: Smartphone },
                      { label: "Needs attention", value: "2", detail: "Pending approvals", icon: ClipboardCheck },
                    ].map((item, index) => (
                      <div key={item.label} className="rounded-xl border bg-muted/40 p-4">
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground">{item.label}</p>
                          <item.icon className={`size-4 ${index === 3 ? "text-primary" : "text-muted-foreground"}`} />
                        </div>
                        <p className="mt-3 text-2xl font-semibold tracking-tight">{item.value}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">{item.detail}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>

              <Card id="inventory">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Inventory watch</CardTitle>
                    <CardDescription className="mt-1">Keep an eye on your available devices</CardDescription>
                  </div>
                  <Button variant="outline" size="sm">View inventory <ArrowUpRight className="ml-2 size-3.5" /></Button>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-3">
                  {stock.map((item) => (
                    <div key={item.name} className="rounded-xl border p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex size-11 items-center justify-center rounded-lg bg-muted">
                          <Smartphone className="size-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{item.name}</p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">{item.detail}</p>
                        </div>
                      </div>
                      <Separator className="my-4" />
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground">Available stock</p>
                          <p className="mt-1 text-xl font-semibold">{item.quantity} <span className="text-xs font-normal text-muted-foreground">units</span></p>
                        </div>
                        <Badge variant={item.status === "Low stock" ? "destructive" : "secondary"}>
                          {item.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
                <Card id="sales">
                  <CardHeader className="gap-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">Recent sales</CardTitle>
                        <CardDescription className="mt-1">Latest transactions from your team</CardDescription>
                      </div>
                      <Button variant="ghost" size="sm">View all <ArrowUpRight className="ml-1 size-3.5" /></Button>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="relative min-w-[180px] flex-1">
                        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search sales..." className="pl-9" />
                      </div>
                      <Tabs value={status} onValueChange={setStatus}>
                        <TabsList>
                          <TabsTrigger value="all">All</TabsTrigger>
                          <TabsTrigger value="completed">Completed</TabsTrigger>
                          <TabsTrigger value="pending">Pending</TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </div>
                  </CardHeader>

                  <CardContent className="px-0 pb-2">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="pl-6">Sale</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Employee</TableHead>
                            <TableHead className="pr-6">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredSales.map((sale) => (
                            <TableRow key={sale.id}>
                              <TableCell className="pl-6">
                                <p className="font-medium">{sale.id}</p>
                                <p className="mt-1 text-[11px] text-muted-foreground">{sale.device}</p>
                              </TableCell>
                              <TableCell>{sale.customer}</TableCell>
                              <TableCell className="font-medium">{money(sale.amount)}</TableCell>
                              <TableCell>{sale.employee}</TableCell>
                              <TableCell className="pr-6">
                                <Badge variant={sale.status === "Completed" ? "secondary" : "outline"}>
                                  {sale.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                          {filteredSales.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                No matching sales found.
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                <Card id="approvals">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">Recent activity</CardTitle>
                      <Badge variant="outline">Latest</Badge>
                    </div>
                    <CardDescription>What's happening in your store</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {activities.map((activity, index) => (
                      <div key={activity.title} className="flex gap-3">
                        <div className={`flex size-9 shrink-0 items-center justify-center rounded-full ${index === 2 ? "bg-amber-50 text-amber-700" : "bg-muted text-primary"}`}>
                          <activity.icon className="size-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{activity.title}</p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">{activity.detail}</p>
                          <p className="mt-1 text-[11px] text-muted-foreground">{activity.time}</p>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>

              <footer className="pb-5 pt-2 text-center text-xs text-muted-foreground">
                Mac Evra · Manager workspace
              </footer>
            </main>
          </SidebarInset>
        </SidebarProvider>
      </div>
    </TooltipProvider>
  );
}
