"use client"

import { FormEvent, useMemo, useState } from "react"
import {
  Activity,
  BadgeCheck,
  Mail,
  Percent,
  Phone,
  Plus,
  Search,
  ShoppingBag,
  UserCheck,
  X,
} from "lucide-react"

import {
  DataBadge,
  DemoNotice,
  DetailRow,
  EmptyState,
  MetricCard,
  PageHeader,
} from "@/components/manager/manager-ui"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  employees as seededEmployees,
  money,
  type Employee,
  type EmployeeRole,
  type EmployeeStatus,
} from "@/lib/manager-data"

const allPermissions = [
  "Complete sales",
  "Reserve devices",
  "Manage inventory",
  "Add inventory",
  "Manage employees",
  "Review approvals",
  "Request discounts",
  "Request cancellations",
  "Process trade-ins",
  "View reports",
  "Edit settings",
  "View own performance",
]

const roleDefaults: Record<EmployeeRole, string[]> = {
  Manager: ["Complete sales", "Manage inventory", "Manage employees", "Review approvals", "View reports", "Edit settings"],
  "Senior Sales Associate": ["Complete sales", "Reserve devices", "Request discounts", "Process trade-ins", "View own performance"],
  "Sales Associate": ["Complete sales", "Reserve devices", "Request discounts", "Request cancellations", "View own performance"],
  "Inventory Specialist": ["Add inventory", "Reserve devices", "Manage inventory"],
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>(seededEmployees)
  const [selectedId, setSelectedId] = useState(seededEmployees[0].id)
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState("All")
  const [showInvite, setShowInvite] = useState(false)
  const [invite, setInvite] = useState({ name: "", email: "", role: "Sales Associate" as EmployeeRole })
  const [notice, setNotice] = useState("")

  const selected = employees.find((employee) => employee.id === selectedId) ?? null
  const activeEmployees = employees.filter((employee) => employee.status === "Active").length
  const teamRevenue = employees.reduce((total, employee) => total + employee.revenue, 0)
  const topPerformer = [...employees].sort((a, b) => b.revenue - a.revenue)[0]
  const averageConversion = Math.round(employees.reduce((total, employee) => total + employee.conversion, 0) / employees.length)

  const filteredEmployees = useMemo(() => {
    const query = search.toLowerCase().trim()
    return employees.filter((employee) => {
      const matchesSearch = !query || [employee.name, employee.email, employee.role].join(" ").toLowerCase().includes(query)
      const matchesRole = roleFilter === "All" || employee.role === roleFilter
      return matchesSearch && matchesRole
    })
  }, [employees, roleFilter, search])

  function inviteEmployee(event: FormEvent) {
    event.preventDefault()
    if (!invite.name.trim() || !invite.email.trim()) return
    const initials = invite.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("")
    const id = `${invite.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`
    const employee: Employee = {
      id,
      name: invite.name.trim(),
      initials,
      email: invite.email.trim(),
      phone: "Not added",
      role: invite.role,
      status: "Inactive",
      joined: "Invitation pending",
      lastActive: "Never",
      permissions: roleDefaults[invite.role],
      sales: 0,
      revenue: 0,
      conversion: 0,
      averageSale: 0,
      activity: [{ action: "Invitation created", detail: `Role assigned: ${invite.role}`, time: "Just now" }],
    }
    setEmployees((current) => [employee, ...current])
    setSelectedId(id)
    setInvite({ name: "", email: "", role: "Sales Associate" })
    setShowInvite(false)
    setNotice("Invitation staged in this preview. No email was sent.")
  }

  function updateEmployee(updates: Partial<Employee>) {
    if (!selected) return
    setEmployees((current) => current.map((employee) => (employee.id === selected.id ? { ...employee, ...updates } : employee)))
    setNotice("Employee profile updated in local preview state.")
  }

  function updateRole(role: EmployeeRole) {
    updateEmployee({ role, permissions: roleDefaults[role] })
  }

  function togglePermission(permission: string) {
    if (!selected) return
    const permissions = selected.permissions.includes(permission)
      ? selected.permissions.filter((item) => item !== permission)
      : [...selected.permissions, permission]
    updateEmployee({ permissions })
  }

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-7 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Team management"
        title="Employees"
        description="Manage staff profiles, role-based permissions, sales performance and recent employee activity."
        action={
          <Button
            onClick={() => {
              setShowInvite((open) => !open)
              setNotice("")
            }}
            className="h-10 bg-[#6E0728] px-4 text-white hover:bg-[#57051F]"
          >
            {showInvite ? <X size={16} /> : <Plus size={16} />}
            {showInvite ? "Close" : "Invite employee"}
          </Button>
        }
      />

      <DemoNotice>
        Employee accounts, role changes and invitations are simulated locally. Production access must be enforced server-side with authenticated users and audited role assignments.
      </DemoNotice>

      {notice ? (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-[#CDE9D7] bg-[#F0FAF3] px-4 py-3 text-sm text-[#267343]">
          <BadgeCheck size={17} /> {notice}
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Employee metrics">
        <MetricCard label="Active now" value={`${activeEmployees} / ${employees.length}`} note="Available team members" icon={UserCheck} tone="green" />
        <MetricCard label="Team revenue" value={money(teamRevenue)} note="Current sample reporting period" icon={ShoppingBag} />
        <MetricCard label="Top performer" value={topPerformer.name.split(" ")[0]} note={money(topPerformer.revenue)} icon={BadgeCheck} tone="blue" />
        <MetricCard label="Avg. conversion" value={`${averageConversion}%`} note="Across the retail team" icon={Percent} tone="amber" />
      </section>

      {showInvite ? (
        <Card className="rounded-2xl border-[#E2D2D8] bg-white shadow-none">
          <CardContent className="p-5 sm:p-6">
            <div>
              <h2 className="text-lg font-semibold">Invite a team member</h2>
              <p className="mt-1 text-sm text-[#86868B]">Assign a role now; permissions can be reviewed before activation.</p>
            </div>
            <form onSubmit={inviteEmployee} className="mt-5 grid gap-4 md:grid-cols-[1fr_1fr_240px_auto] md:items-end">
              <label className="space-y-2">
                <span className="block text-sm font-medium">Full name</span>
                <Input value={invite.name} onChange={(event) => setInvite({ ...invite, name: event.target.value })} placeholder="Employee name" />
              </label>
              <label className="space-y-2">
                <span className="block text-sm font-medium">Work email</span>
                <Input type="email" value={invite.email} onChange={(event) => setInvite({ ...invite, email: event.target.value })} placeholder="name@mac-evra.example" />
              </label>
              <label className="space-y-2">
                <span className="block text-sm font-medium">Role</span>
                <select value={invite.role} onChange={(event) => setInvite({ ...invite, role: event.target.value as EmployeeRole })} className="h-8 w-full rounded-lg border border-input bg-white px-2.5 text-sm outline-none focus:border-[#6E0728]">
                  {Object.keys(roleDefaults).map((role) => <option key={role}>{role}</option>)}
                </select>
              </label>
              <Button type="submit" disabled={!invite.name.trim() || !invite.email.trim()} className="bg-[#6E0728] text-white hover:bg-[#57051F]">Create invite</Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <section className={`grid gap-5 ${selected ? "xl:grid-cols-[minmax(0,1fr)_430px]" : "grid-cols-1"}`}>
        <Card className="min-w-0 rounded-2xl border-[#E8E8ED] bg-white shadow-none">
          <CardContent className="p-0">
            <div className="flex flex-col justify-between gap-4 border-b border-[#E8E8ED] p-5 lg:flex-row lg:items-center">
              <div>
                <h2 className="font-semibold">Team directory</h2>
                <p className="mt-1 text-sm text-[#86868B]">{filteredEmployees.length} people shown</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#A1A1A6]" />
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employees" className="w-full pl-9 sm:w-60" />
                </div>
                <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="h-8 rounded-lg border border-input bg-white px-2.5 text-sm outline-none focus:border-[#6E0728]" aria-label="Filter employee role">
                  <option value="All">All roles</option>
                  {Object.keys(roleDefaults).map((role) => <option key={role}>{role}</option>)}
                </select>
              </div>
            </div>

            {filteredEmployees.length ? (
              <div className="divide-y divide-[#F0F0F2]">
                {filteredEmployees.map((employee) => (
                  <button
                    type="button"
                    key={employee.id}
                    onClick={() => {
                      setSelectedId(employee.id)
                      setNotice("")
                    }}
                    className={`grid w-full gap-4 p-4 text-left transition hover:bg-[#FCF9FA] sm:grid-cols-[minmax(220px,1.2fr)_minmax(190px,1fr)_100px_120px] sm:items-center sm:px-5 ${selectedId === employee.id ? "bg-[#FAF3F6]" : "bg-white"}`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <Avatar className="size-10 shrink-0"><AvatarFallback className="bg-[#F1E8EC] text-xs font-semibold text-[#6E0728]">{employee.initials}</AvatarFallback></Avatar>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{employee.name}</span>
                        <span className="mt-1 block truncate text-xs text-[#86868B]">{employee.email}</span>
                      </span>
                    </span>
                    <span className="text-sm text-[#424245]">{employee.role}</span>
                    <span><EmployeeStatusBadge status={employee.status} /></span>
                    <span className="sm:text-right">
                      <span className="block text-sm font-medium">{money(employee.revenue)}</span>
                      <span className="mt-1 block text-xs text-[#86868B]">{employee.sales} sales</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState title="No employees found" description="Try changing the search term or selected role." />
            )}
          </CardContent>
        </Card>

        {selected ? (
          <Card className="h-fit rounded-2xl border-[#E8E8ED] bg-white shadow-none">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="size-12 shrink-0"><AvatarFallback className="bg-[#F1E8EC] font-semibold text-[#6E0728]">{selected.initials}</AvatarFallback></Avatar>
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold">{selected.name}</h2>
                    <p className="mt-1 truncate text-sm text-[#86868B]">{selected.role}</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setSelectedId("")} aria-label="Close profile"><X size={17} /></Button>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-[#F7F7F8] p-3">
                  <p className="text-xs text-[#86868B]">Sales</p>
                  <p className="mt-1 text-lg font-semibold">{selected.sales}</p>
                </div>
                <div className="rounded-xl bg-[#F7F7F8] p-3">
                  <p className="text-xs text-[#86868B]">Revenue</p>
                  <p className="mt-1 text-lg font-semibold">{money(selected.revenue)}</p>
                </div>
                <div className="rounded-xl bg-[#F7F7F8] p-3">
                  <p className="text-xs text-[#86868B]">Conversion</p>
                  <p className="mt-1 text-lg font-semibold">{selected.conversion}%</p>
                </div>
                <div className="rounded-xl bg-[#F7F7F8] p-3">
                  <p className="text-xs text-[#86868B]">Average sale</p>
                  <p className="mt-1 text-lg font-semibold">{money(selected.averageSale)}</p>
                </div>
              </div>

              <Separator className="my-5" />
              <div className="space-y-4">
                <DetailRow label="Email" value={<span className="inline-flex items-center gap-1"><Mail size={13} /> {selected.email}</span>} />
                <DetailRow label="Phone" value={<span className="inline-flex items-center gap-1"><Phone size={13} /> {selected.phone}</span>} />
                <DetailRow label="Joined" value={selected.joined} />
                <DetailRow label="Last active" value={selected.lastActive} />
              </div>

              <Separator className="my-5" />
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-2">
                  <span className="block text-xs font-medium text-[#68686D]">Role</span>
                  <select value={selected.role} onChange={(event) => updateRole(event.target.value as EmployeeRole)} className="h-8 w-full rounded-lg border border-input bg-white px-2 text-xs outline-none focus:border-[#6E0728]">
                    {Object.keys(roleDefaults).map((role) => <option key={role}>{role}</option>)}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="block text-xs font-medium text-[#68686D]">Account status</span>
                  <select value={selected.status} onChange={(event) => updateEmployee({ status: event.target.value as EmployeeStatus })} className="h-8 w-full rounded-lg border border-input bg-white px-2 text-xs outline-none focus:border-[#6E0728]">
                    <option>Active</option>
                    <option>Away</option>
                    <option>Inactive</option>
                  </select>
                </label>
              </div>

              <div className="mt-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Permissions</p>
                  <span className="text-xs text-[#86868B]">{selected.permissions.length} enabled</span>
                </div>
                <div className="mt-3 grid max-h-52 gap-2 overflow-y-auto pr-1">
                  {allPermissions.map((permission) => (
                    <label key={permission} className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#ECECEF] px-3 py-2.5 text-xs text-[#424245]">
                      <input type="checkbox" checked={selected.permissions.includes(permission)} onChange={() => togglePermission(permission)} className="size-4 accent-[#6E0728]" />
                      {permission}
                    </label>
                  ))}
                </div>
              </div>

              <Separator className="my-5" />
              <div>
                <div className="flex items-center gap-2">
                  <Activity size={16} className="text-[#6E0728]" />
                  <p className="text-sm font-semibold">Recent activity</p>
                </div>
                <div className="mt-3 space-y-4">
                  {selected.activity.map((item) => (
                    <div key={`${item.action}-${item.time}`} className="border-l-2 border-[#E5D5DB] pl-3">
                      <p className="text-xs font-medium">{item.action}</p>
                      <p className="mt-1 text-xs leading-5 text-[#86868B]">{item.detail}</p>
                      <p className="mt-1 text-[11px] text-[#A1A1A6]">{item.time}</p>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </section>
    </main>
  )
}

function EmployeeStatusBadge({ status }: { status: EmployeeStatus }) {
  return <DataBadge tone={status === "Active" ? "green" : status === "Away" ? "amber" : "neutral"}>{status}</DataBadge>
}
