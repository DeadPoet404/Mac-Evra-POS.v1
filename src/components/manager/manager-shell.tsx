"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Apple,
  Bell,
  ChartNoAxesCombined,
  ClipboardCheck,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  ReceiptText,
  Settings,
  Smartphone,
  Users,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"

const navigation = [
  { label: "Overview", icon: LayoutDashboard, href: "/manager" },
  { label: "Sales", icon: ReceiptText, href: "/manager/sales" },
  { label: "Inventory", icon: Smartphone, href: "/manager/inventory" },
  { label: "Employees", icon: Users, href: "/manager/employees" },
  { label: "Approvals", icon: ClipboardCheck, href: "/manager/approvals", count: 4 },
  { label: "Reports", icon: ChartNoAxesCombined, href: "/manager/reports" },
]

function isActiveRoute(pathname: string, href: string) {
  if (href === "/manager") return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

function pageName(pathname: string) {
  const route = navigation.find((item) => isActiveRoute(pathname, item.href))
  if (route) return route.label
  if (pathname.startsWith("/manager/settings")) return "Settings"
  return "Manager"
}

export function ManagerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const currentPage = pageName(pathname)

  return (
    <div className="manager-theme min-h-screen bg-[#F7F7F8] text-[#1D1D1F]">
      <SidebarProvider>
        <Sidebar collapsible="icon" className="border-r border-[#E8E8ED] bg-white">
          <SidebarHeader className="px-3 py-5">
            <Link
              href="/manager"
              className="flex items-center gap-3 rounded-xl px-2 py-1 outline-none focus-visible:ring-2 focus-visible:ring-[#6E0728]/30"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#6E0728] text-white">
                <Apple size={18} aria-hidden="true" />
              </span>
              <span className="min-w-0 group-data-[collapsible=icon]:hidden">
                <span className="block truncate text-[14px] font-semibold tracking-[0.12em]">MAC EVRA</span>
                <span className="block text-[11px] text-[#86868B]">Manager workspace</span>
              </span>
            </Link>
          </SidebarHeader>

          <SidebarContent className="px-2">
            <SidebarGroup>
              <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#A1A1A6]">
                Store management
              </SidebarGroupLabel>
              <SidebarMenu>
                {navigation.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      render={<Link href={item.href} />}
                      isActive={isActiveRoute(pathname, item.href)}
                      tooltip={item.label}
                      className="h-10 rounded-lg px-3"
                    >
                      <item.icon size={18} aria-hidden="true" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                    {item.count ? (
                      <SidebarMenuBadge className="bg-[#F5E8EC] text-[#6E0728] group-data-[collapsible=icon]:hidden">
                        {item.count}
                      </SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>

            <SidebarGroup className="mt-auto">
              <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#A1A1A6]">
                Workspace
              </SidebarGroupLabel>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link href="/manager/settings" />}
                    isActive={pathname.startsWith("/manager/settings")}
                    tooltip="Settings"
                    className="h-10 rounded-lg px-3"
                  >
                    <Settings size={18} aria-hidden="true" />
                    <span>Settings</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Help & support" className="h-10 rounded-lg px-3">
                    <LifeBuoy size={18} aria-hidden="true" />
                    <span>Help & support</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="px-2 pb-4">
            <Separator className="mb-3" />
            <DropdownMenu>
              <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-xl p-2 text-left outline-none hover:bg-[#F7F7F8] focus-visible:ring-2 focus-visible:ring-[#6E0728]/30">
                <Avatar className="size-9 shrink-0">
                  <AvatarFallback className="bg-[#F1E8EC] text-xs font-semibold text-[#6E0728]">AM</AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                  <span className="block truncate text-sm font-medium">Alex Morgan</span>
                  <span className="block truncate text-xs text-[#86868B]">Manager</span>
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" className="w-56">
                <DropdownMenuLabel>Alex Morgan</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem render={<Link href="/manager/settings" />}>
                  <Settings /> Account settings
                </DropdownMenuItem>
                <DropdownMenuItem render={<Link href="/" />}>
                  <LogOut /> Sign out of preview
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="min-w-0 bg-[#F7F7F8]">
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#E8E8ED] bg-white/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <SidebarTrigger className="shrink-0" />
              <Separator orientation="vertical" className="h-5" />
              <div className="min-w-0">
                <p className="truncate text-xs text-[#86868B]">Mac Evra · Accra store</p>
                <p className="truncate text-sm font-medium text-[#1D1D1F]">{currentPage}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="hidden border-[#E0D1D6] bg-[#FBF7F8] text-[#6E0728] sm:inline-flex">
                Preview data
              </Badge>
              <Button variant="outline" size="icon" aria-label="Notifications" className="relative bg-white">
                <Bell size={17} />
                <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-[#6E0728]" />
              </Button>
              <Avatar className="hidden size-8 sm:flex">
                <AvatarFallback className="bg-[#F1E8EC] text-xs font-semibold text-[#6E0728]">AM</AvatarFallback>
              </Avatar>
            </div>
          </header>
          {children}
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}
