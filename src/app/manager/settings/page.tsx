import Link from "next/link"
import { Building2, Info, LockKeyhole, ShieldCheck, UserRound, Wallet } from "lucide-react"

import { DataBadge, DetailRow, PageHeader } from "@/components/manager/manager-ui"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { requirePermissions } from "@/lib/auth/server"
import { createClient } from "@/lib/supabase/server"

const permissionLabels: Record<string, string> = {
  access_employee_workspace: "Employee workspace",
  create_sales: "Create sales",
  reserve_inventory: "Reserve inventory",
  process_trade_ins: "Process trade-ins",
  view_own_performance: "View own performance",
  access_manager_workspace: "Manager workspace",
  manage_inventory: "Manage inventory",
  manage_employee_access: "Manage employee access",
  review_approvals: "Review approvals",
  approve_discounts: "Approve discounts",
  approve_trade_ins: "Approve trade-ins",
  approve_refunds: "Approve refunds",
  approve_cancellations: "Approve cancellations",
  approve_inventory_adjustments: "Approve inventory adjustments",
  view_reports: "View reports",
  manage_store_settings: "Manage store settings",
  view_audit_events: "View audit events",
  manage_roles: "Manage roles",
}

/**
 * Read-only settings.
 *
 * The database has no store-configuration write path for the application role
 * (store rows are select-only for authenticated users, and the supported
 * payment methods are fixed by the payment functions). Editable fields and a
 * "saved" confirmation were therefore removed: they never persisted anything.
 */
export default async function SettingsPage() {
  const { access, membership } = await requirePermissions(
    ["access_manager_workspace", "manage_store_settings"],
    { nextPath: "/manager/settings" }
  )

  const supabase = await createClient()
  const { data: store, error } = await supabase
    .from("stores")
    .select("name,code,timezone,currency,status")
    .eq("id", membership.storeId)
    .maybeSingle()

  if (error) throw new Error("Store settings could not be loaded.")

  const permissions = [...membership.permissions].sort((left, right) =>
    (permissionLabels[left] ?? left).localeCompare(permissionLabels[right] ?? right, "en-GH")
  )

  return (
    <main className="mx-auto w-full max-w-[1300px] space-y-7 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Workspace configuration"
        title="Settings"
        description="The store identity and your manager account, read live from the database."
      />

      <div className="flex gap-3 rounded-xl border border-[#E8E8ED] bg-[#FAFAFB] px-4 py-3 text-xs leading-5 text-[#68686D]">
        <Info className="mt-0.5 size-4 shrink-0 text-[#6E0728]" aria-hidden="true" />
        <p>
          These settings are read-only in this release. Changing them requires a database function with its own audit
          trail, which does not exist yet, so no field here pretends to save.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="rounded-2xl border-[#E8E8ED] bg-white shadow-none">
          <CardContent className="p-5 sm:p-6">
            <SectionHeading
              icon={Building2}
              title="Store"
              description="Identity stored with this store's record. Shown to every signed-in employee."
            />
            <Separator className="my-5" />
            <div className="space-y-4">
              <DetailRow label="Name" value={store?.name ?? membership.storeName} />
              <DetailRow label="Store code" value={store?.code ?? "—"} mono />
              <DetailRow label="Store ID" value={membership.storeId} mono />
              <DetailRow label="Timezone" value={store?.timezone ?? "Africa/Accra"} />
              <DetailRow label="Currency" value={store?.currency ?? "GHS"} />
              <DetailRow
                label="Status"
                value={<DataBadge tone={store?.status === "active" ? "green" : "neutral"}>{store?.status ?? "unknown"}</DataBadge>}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-[#E8E8ED] bg-white shadow-none">
          <CardContent className="p-5 sm:p-6">
            <SectionHeading
              icon={UserRound}
              title="Manager account"
              description="Your signed-in profile and store membership."
            />
            <Separator className="my-5" />
            <div className="space-y-4">
              <DetailRow label="Display name" value={access.displayName ?? "—"} />
              <DetailRow label="Sign-in email" value={access.email ?? "—"} />
              <DetailRow label="Role" value={membership.roleName} />
              <DetailRow label="Membership" value={membership.id} mono />
            </div>
            <div className="mt-5 flex gap-3 rounded-xl border border-[#E8E8ED] bg-[#FAFAFB] p-4 text-xs leading-5 text-[#68686D]">
              <LockKeyhole className="mt-0.5 size-4 shrink-0 text-[#6E0728]" aria-hidden="true" />
              <p>
                Password and session security are handled by Supabase Auth. Change your password through the invitation
                email or ask an administrator to re-issue access.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="rounded-2xl border-[#E8E8ED] bg-white shadow-none">
          <CardContent className="p-5 sm:p-6">
            <SectionHeading
              icon={ShieldCheck}
              title="Your permissions"
              description="Granted through your store role, enforced on the server for every page."
            />
            <Separator className="my-5" />
            {permissions.length ? (
              <ul className="flex flex-wrap gap-2">
                {permissions.map((permission) => (
                  <li key={permission}>
                    <DataBadge tone="burgundy">{permissionLabels[permission] ?? permission}</DataBadge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[#86868B]">No permissions are granted to this membership.</p>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-[#E8E8ED] bg-white shadow-none">
          <CardContent className="p-5 sm:p-6">
            <SectionHeading
              icon={Wallet}
              title="Payment and POS rules"
              description="Fixed behaviour enforced by the database, not by this screen."
            />
            <Separator className="my-5" />
            <div className="space-y-3 text-sm">
              <Rule title="Supported payment methods" detail="Mobile Money, Cash and Bank Transfer. No card or split tender." />
              <Rule title="Full payment only" detail="A payment must equal the sale total exactly before a sale can complete." />
              <Rule title="Acquisition cost is hidden" detail="Device cost is never granted to the application role, so no employee sees it." />
              <Rule title="Store isolation" detail="Every sale, device and membership read is scoped to your store by row-level security." />
            </div>
            <p className="mt-5 text-xs leading-5 text-[#A1A1A6]">
              Need a change to these rules? They live in reviewed database functions. See the{" "}
              <Link href="/manager/sales" className="font-semibold text-[#6E0728]">
                sales register
              </Link>{" "}
              for what is recorded today.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

function SectionHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType
  title: string
  description: string
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#F5EDF0] text-[#6E0728]">
        <Icon size={18} aria-hidden="true" />
      </span>
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-[#86868B]">{description}</p>
      </div>
    </div>
  )
}

function Rule({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-xl border border-[#E8E8ED] p-4">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-xs leading-5 text-[#86868B]">{detail}</p>
    </div>
  )
}
