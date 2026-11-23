import { BadgeCheck, Mail, ShieldCheck, Users } from "lucide-react"

import { DataBadge, EmptyState, MetricCard, PageHeader } from "@/components/manager/manager-ui"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissions } from "@/lib/auth/server"
import { createClient } from "@/lib/supabase/server"
import { inviteStaffFormAction, updateStaffAction } from "./actions"

type Staff = {
  id: string; status: string; joined_at: string | null
  profiles: { display_name: string; work_email: string | null; phone: string | null }
  roles: { code: string; name: string }
}
type Invitation = {
  id: string; email: string; status: string; expires_at: string
  roles: { name: string }
}
const roles = [
  { code: "employee", name: "Employee" },
  { code: "manager", name: "Manager" },
  { code: "administrator", name: "Administrator" },
]
const dateLabel = (value: string) => new Intl.DateTimeFormat("en-GH", { dateStyle: "medium" }).format(new Date(value))
function Status({ value }: { value: string }) {
  const tone = value === "active" || value === "accepted" ? "green" : value === "pending" ? "amber" : "neutral"
  return <DataBadge tone={tone}>{value[0].toUpperCase() + value.slice(1)}</DataBadge>
}

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const { membership } = await requirePermissions(["manage_employee_access"], { nextPath: "/manager/employees" })
  const supabase = await createClient()
  const [{ data: staffRows, error: staffError }, { data: inviteRows, error: inviteError }] = await Promise.all([
    supabase.from("store_memberships")
      .select("id,status,joined_at,profiles!inner(display_name,work_email,phone),roles!inner(code,name)")
      .eq("store_id", membership.storeId).order("created_at", { ascending: false }),
    supabase.from("staff_invitations")
      .select("id,email,status,expires_at,roles!inner(name)")
      .eq("store_id", membership.storeId).order("created_at", { ascending: false }),
  ])
  if (staffError || inviteError) throw new Error("Staff records could not be loaded.")
  const staff = (staffRows ?? []) as unknown as Staff[]
  const invites = (inviteRows ?? []) as unknown as Invitation[]
  const activeCount = staff.filter((item) => item.status === "active").length
  const pendingCount = invites.filter((item) => item.status === "pending" && new Date(item.expires_at) > new Date()).length
  const params = await searchParams

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-7 p-4 sm:p-6 lg:p-8">
      <PageHeader eyebrow="Team management" title="Employees" description="Manage staff accounts, store roles and invitations. Access changes are recorded in the audit history." action={<Button render={<a href="#invite-staff" />} className="h-10 bg-[#6E0728] px-4 text-white hover:bg-[#57051F]">Invite employee</Button>} />
      {params.notice === "invitation-sent" ? <p role="status" className="rounded-xl border border-[#CDE9D7] bg-[#F0FAF3] px-4 py-3 text-sm text-[#267343]">Invitation email requested successfully.</p> : null}
      {params.notice === "staff-updated" ? <p role="status" className="rounded-xl border border-[#CDE9D7] bg-[#F0FAF3] px-4 py-3 text-sm text-[#267343]">Staff access updated and recorded.</p> : null}
      {params.error ? <p role="alert" className="rounded-xl border border-[#E8C9D2] bg-[#FCF4F6] px-4 py-3 text-sm text-[#6E0728]">{params.error === "invite-failed" ? "Invitation could not be sent. Check the email configuration and permissions." : "The requested staff change could not be completed."}</p> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Employee metrics">
        <MetricCard label="Active staff" value={String(activeCount)} note="Active store memberships" icon={Users} tone="green" />
        <MetricCard label="Pending invitations" value={String(pendingCount)} note="Awaiting secure email acceptance" icon={Mail} tone="amber" />
        <MetricCard label="Staff roles" value="3" note="Employee, Manager, Administrator" icon={ShieldCheck} />
      </section>

      <Card id="invite-staff" className="scroll-mt-6 rounded-2xl border-[#E2D2D8] bg-white shadow-none">
        <CardContent className="p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-[#F5EDF0] text-[#6E0728]"><Mail size={18} /></span>
            <div><h2 className="text-lg font-semibold">Invite a team member</h2><p className="mt-1 text-sm text-[#86868B]">Invitations expire after 72 hours. Elevated roles require administrator access.</p></div>
          </div>
          <form action={inviteStaffFormAction} className="mt-5 grid gap-4 md:grid-cols-[1fr_240px_auto] md:items-end">
            <label className="space-y-2"><span className="block text-sm font-medium">Work email</span><input name="email" type="email" required maxLength={320} autoComplete="email" placeholder="name@example.com" className="h-10 w-full rounded-lg border border-input bg-white px-3 text-sm outline-none focus:border-[#6E0728]" /></label>
            <label className="space-y-2"><span className="block text-sm font-medium">Role</span><select name="roleCode" defaultValue="employee" className="h-10 w-full rounded-lg border border-input bg-white px-3 text-sm outline-none focus:border-[#6E0728]">{roles.map((role) => <option key={role.code} value={role.code}>{role.name}</option>)}</select></label>
            <Button type="submit" className="h-10 bg-[#6E0728] text-white hover:bg-[#57051F]">Send invitation</Button>
          </form>
        </CardContent>
      </Card>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="min-w-0 rounded-2xl border-[#E8E8ED] bg-white shadow-none">
          <CardContent className="p-0">
            <div className="border-b border-[#E8E8ED] p-5"><h2 className="font-semibold">Team directory</h2><p className="mt-1 text-sm text-[#86868B]">{staff.length} staff memberships · {membership.storeName}</p></div>
            {staff.length ? <div className="divide-y divide-[#F0F0F2]">
              {staff.map((person) => <div key={person.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(180px,1fr)_150px_100px] sm:items-center sm:px-5">
                <div className="min-w-0"><p className="truncate text-sm font-medium">{person.profiles.display_name}</p><p className="mt-1 truncate text-xs text-[#86868B]">{person.profiles.work_email ?? "No work email"}</p>{person.profiles.phone ? <p className="mt-1 text-xs text-[#86868B]">{person.profiles.phone}</p> : null}</div>
                <div className="flex items-center gap-2 text-sm text-[#424245]"><BadgeCheck size={15} className="text-[#6E0728]" />{person.roles.name}</div>
                <Status value={person.status} />
                <form action={updateStaffAction} className="flex flex-wrap items-end gap-2 rounded-xl bg-[#FAFAFB] p-3 sm:col-span-3">
                  <input type="hidden" name="membershipId" value={person.id} />
                  <label className="min-w-[145px] flex-1 space-y-1"><span className="block text-[11px] font-medium text-[#68686D]">Role</span><select name="roleCode" defaultValue={person.roles.code} className="h-9 w-full rounded-lg border border-input bg-white px-2 text-xs">{roles.map((role) => <option key={role.code} value={role.code}>{role.name}</option>)}</select></label>
                  <label className="min-w-[135px] flex-1 space-y-1"><span className="block text-[11px] font-medium text-[#68686D]">Account status</span><select name="status" defaultValue={person.status} className="h-9 w-full rounded-lg border border-input bg-white px-2 text-xs"><option value="active">Active</option><option value="suspended">Suspended</option><option value="inactive">Inactive</option></select></label>
                  <Button type="submit" variant="outline" size="sm" className="h-9">Save access</Button>
                </form>
                <p className="text-xs text-[#86868B] sm:col-span-3">Joined: {person.joined_at ? dateLabel(person.joined_at) : "Not joined"}</p>
              </div>)}
            </div> : <EmptyState title="No staff memberships yet" description="Send an invitation to add the first team member." />}
          </CardContent>
        </Card>

        <Card className="h-fit rounded-2xl border-[#E8E8ED] bg-white shadow-none"><CardContent className="p-5">
          <h2 className="font-semibold">Recent invitations</h2><p className="mt-1 text-sm text-[#86868B]">Live invitation status from the store database.</p>
          <div className="mt-4 space-y-3">{invites.length ? invites.slice(0, 12).map((invite) => <div key={invite.id} className="rounded-xl border border-[#ECECEF] p-3"><p className="break-all text-sm font-medium">{invite.email}</p><p className="mt-1 text-xs text-[#86868B]">{invite.roles.name} · Expires {dateLabel(invite.expires_at)}</p><div className="mt-2"><Status value={invite.status} /></div></div>) : <p className="text-sm text-[#86868B]">No invitations yet.</p>}</div>
        </CardContent></Card>
      </section>
    </main>
  )
}
