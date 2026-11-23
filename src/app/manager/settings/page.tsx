"use client"

import { FormEvent, useState } from "react"
import {
  BadgeCheck,
  BellRing,
  Building2,
  CreditCard,
  LockKeyhole,
  Save,
  Settings2,
  UserRound,
} from "lucide-react"

import { DataBadge, DemoNotice, PageHeader } from "@/components/manager/manager-ui"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

type SettingsSection = "store" | "account" | "pos" | "preferences"

const sections: { id: SettingsSection; label: string; description: string; icon: React.ElementType }[] = [
  { id: "store", label: "Store information", description: "Business identity and receipt details", icon: Building2 },
  { id: "account", label: "My account", description: "Manager profile and security", icon: UserRound },
  { id: "pos", label: "POS configuration", description: "Payments, sales and inventory rules", icon: Settings2 },
  { id: "preferences", label: "Business preferences", description: "Locale, notifications and display", icon: BellRing },
]

export default function SettingsPage() {
  const [section, setSection] = useState<SettingsSection>("store")
  const [savedMessage, setSavedMessage] = useState("")
  const [store, setStore] = useState({ name: "Mac Evra", location: "Accra, Greater Accra", phone: "+233 24 000 0000", email: "store@mac-evra.example", receiptFooter: "Thank you for shopping with Mac Evra." })
  const [account, setAccount] = useState({ name: "Alex Morgan", email: "alex@mac-evra.example", phone: "+233 24 555 0101" })
  const [pos, setPos] = useState({ reservationMinutes: "30", discountLimit: "200", requireCustomerPhone: true, allowSplitPayments: true, printReceiptAutomatically: false })
  const [payments, setPayments] = useState(["Cash", "MTN MoMo", "Other Mobile Money", "Bank Transfer", "Card"])
  const [preferences, setPreferences] = useState({ timezone: "Africa/Accra", currency: "GHS", lowStockLevel: "3", dailySummary: true, approvalAlerts: true, inventoryAlerts: true })

  function saveSettings(event: FormEvent) {
    event.preventDefault()
    const label = sections.find((item) => item.id === section)?.label ?? "Settings"
    setSavedMessage(`${label} saved in preview state.`)
  }

  function togglePayment(method: string) {
    setPayments((current) => current.includes(method) ? current.filter((item) => item !== method) : [...current, method])
  }

  return (
    <main className="mx-auto w-full max-w-[1300px] space-y-7 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Workspace configuration"
        title="Settings"
        description="Configure store details, manager account information, POS safeguards and business preferences."
      />

      <DemoNotice>
        Settings are stored only in local component state for this preview. Production configuration must be persisted securely and restricted by manager permissions.
      </DemoNotice>

      {savedMessage ? (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-[#CDE9D7] bg-[#F0FAF3] px-4 py-3 text-sm text-[#267343]">
          <BadgeCheck size={17} /> {savedMessage}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="h-fit rounded-2xl border-[#E8E8ED] bg-white shadow-none">
          <CardContent className="space-y-1 p-2">
            {sections.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSection(item.id)
                  setSavedMessage("")
                }}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition",
                  section === item.id ? "bg-[#F5E8EC] text-[#6E0728]" : "text-[#424245] hover:bg-[#F7F7F8]"
                )}
              >
                <item.icon className="mt-0.5 size-4 shrink-0" />
                <span>
                  <span className="block text-sm font-medium">{item.label}</span>
                  <span className={cn("mt-1 block text-xs leading-5", section === item.id ? "text-[#81556A]" : "text-[#86868B]")}>{item.description}</span>
                </span>
              </button>
            ))}
          </CardContent>
        </Card>

        <form onSubmit={saveSettings}>
          {section === "store" ? (
            <SettingsCard icon={Building2} title="Store information" description="Shown on receipts and customer communications.">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Store name"><Input value={store.name} onChange={(event) => setStore({ ...store, name: event.target.value })} /></Field>
                <Field label="Location"><Input value={store.location} onChange={(event) => setStore({ ...store, location: event.target.value })} /></Field>
                <Field label="Business phone"><Input type="tel" value={store.phone} onChange={(event) => setStore({ ...store, phone: event.target.value })} /></Field>
                <Field label="Receipt email"><Input type="email" value={store.email} onChange={(event) => setStore({ ...store, email: event.target.value })} /></Field>
                <Field label="Receipt footer" wide>
                  <textarea value={store.receiptFooter} onChange={(event) => setStore({ ...store, receiptFooter: event.target.value })} rows={3} className="w-full resize-none rounded-xl border border-input bg-white px-3 py-2.5 text-sm outline-none focus:border-[#6E0728] focus:ring-2 focus:ring-[#6E0728]/15" />
                </Field>
              </div>
            </SettingsCard>
          ) : null}

          {section === "account" ? (
            <SettingsCard icon={UserRound} title="Manager account" description="Your profile details and sign-in security.">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Full name"><Input value={account.name} onChange={(event) => setAccount({ ...account, name: event.target.value })} /></Field>
                <Field label="Work email"><Input type="email" value={account.email} onChange={(event) => setAccount({ ...account, email: event.target.value })} /></Field>
                <Field label="Phone number"><Input type="tel" value={account.phone} onChange={(event) => setAccount({ ...account, phone: event.target.value })} /></Field>
                <Field label="Role"><Input value="Manager" disabled /></Field>
              </div>
              <Separator className="my-6" />
              <div className="flex flex-col justify-between gap-4 rounded-xl border border-[#E8E8ED] bg-[#FAFAFB] p-4 sm:flex-row sm:items-center">
                <div className="flex gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#F5EDF0] text-[#6E0728]"><LockKeyhole size={18} /></span>
                  <div>
                    <p className="text-sm font-medium">Authentication security</p>
                    <p className="mt-1 text-xs leading-5 text-[#86868B]">Password and multi-factor authentication will be managed by the connected identity provider.</p>
                  </div>
                </div>
                <DataBadge tone="amber">Not connected</DataBadge>
              </div>
            </SettingsCard>
          ) : null}

          {section === "pos" ? (
            <SettingsCard icon={Settings2} title="POS configuration" description="Control the rules used during employee-assisted sales.">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Reservation expiry (minutes)"><Input type="number" min="5" value={pos.reservationMinutes} onChange={(event) => setPos({ ...pos, reservationMinutes: event.target.value })} /></Field>
                <Field label="Discount without approval (GH₵)"><Input type="number" min="0" value={pos.discountLimit} onChange={(event) => setPos({ ...pos, discountLimit: event.target.value })} /></Field>
              </div>

              <Separator className="my-6" />
              <div>
                <div className="flex items-center gap-2"><CreditCard size={17} className="text-[#6E0728]" /><h3 className="text-sm font-semibold">Accepted payment methods</h3></div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {["Cash", "MTN MoMo", "Other Mobile Money", "Bank Transfer", "Card"].map((method) => (
                    <label key={method} className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#E8E8ED] px-3 py-3 text-sm">
                      <input type="checkbox" checked={payments.includes(method)} onChange={() => togglePayment(method)} className="size-4 accent-[#6E0728]" />
                      {method}
                    </label>
                  ))}
                </div>
              </div>

              <Separator className="my-6" />
              <div className="space-y-3">
                <LockedRule title="Require confirmed full payment" description="A sale cannot complete and a device cannot be handed over until full payment is independently verified." />
                <ToggleRow checked={pos.requireCustomerPhone} onChange={(checked) => setPos({ ...pos, requireCustomerPhone: checked })} title="Require customer phone number" description="Collect a contact number for receipts and transaction history." />
                <ToggleRow checked={pos.allowSplitPayments} onChange={(checked) => setPos({ ...pos, allowSplitPayments: checked })} title="Allow split payments" description="Employees can record multiple verified payment components." />
                <ToggleRow checked={pos.printReceiptAutomatically} onChange={(checked) => setPos({ ...pos, printReceiptAutomatically: checked })} title="Print receipt automatically" description="Open the print dialog after a completed transaction." />
              </div>
            </SettingsCard>
          ) : null}

          {section === "preferences" ? (
            <SettingsCard icon={BellRing} title="Business preferences" description="Locale, stock thresholds and manager notifications.">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Timezone">
                  <select value={preferences.timezone} onChange={(event) => setPreferences({ ...preferences, timezone: event.target.value })} className="h-8 w-full rounded-lg border border-input bg-white px-2.5 text-sm outline-none focus:border-[#6E0728]">
                    <option value="Africa/Accra">Africa/Accra (GMT)</option>
                  </select>
                </Field>
                <Field label="Currency">
                  <select value={preferences.currency} onChange={(event) => setPreferences({ ...preferences, currency: event.target.value })} className="h-8 w-full rounded-lg border border-input bg-white px-2.5 text-sm outline-none focus:border-[#6E0728]">
                    <option value="GHS">Ghanaian Cedi (GHS)</option>
                  </select>
                </Field>
                <Field label="Low stock alert level"><Input type="number" min="1" value={preferences.lowStockLevel} onChange={(event) => setPreferences({ ...preferences, lowStockLevel: event.target.value })} /></Field>
              </div>
              <Separator className="my-6" />
              <div className="space-y-3">
                <ToggleRow checked={preferences.dailySummary} onChange={(checked) => setPreferences({ ...preferences, dailySummary: checked })} title="Daily sales summary" description="Receive the store summary at the end of each business day." />
                <ToggleRow checked={preferences.approvalAlerts} onChange={(checked) => setPreferences({ ...preferences, approvalAlerts: checked })} title="Approval request alerts" description="Notify managers when a sensitive action needs review." />
                <ToggleRow checked={preferences.inventoryAlerts} onChange={(checked) => setPreferences({ ...preferences, inventoryAlerts: checked })} title="Inventory alerts" description="Notify managers about low stock and reconciliation exceptions." />
              </div>
            </SettingsCard>
          ) : null}

          <div className="mt-4 flex justify-end">
            <Button type="submit" className="h-10 bg-[#6E0728] px-5 text-white hover:bg-[#57051F]"><Save size={16} /> Save changes</Button>
          </div>
        </form>
      </div>
    </main>
  )
}

function SettingsCard({ icon: Icon, title, description, children }: { icon: React.ElementType; title: string; description: string; children: React.ReactNode }) {
  return (
    <Card className="rounded-2xl border-[#E8E8ED] bg-white shadow-none">
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#F5EDF0] text-[#6E0728]"><Icon size={18} /></span>
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-[#86868B]">{description}</p>
          </div>
        </div>
        <Separator className="my-6" />
        {children}
      </CardContent>
    </Card>
  )
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={cn("space-y-2", wide && "sm:col-span-2")}><span className="block text-sm font-medium">{label}</span>{children}</label>
}

function ToggleRow({ checked, onChange, title, description }: { checked: boolean; onChange: (checked: boolean) => void; title: string; description: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-[#E8E8ED] p-4">
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-[#86868B]">{description}</span>
      </span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-5 shrink-0 accent-[#6E0728]" />
    </label>
  )
}

function LockedRule({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-[#D9E9DF] bg-[#F4FAF6] p-4">
      <span className="flex gap-3">
        <LockKeyhole className="mt-0.5 size-4 shrink-0 text-[#267343]" />
        <span>
          <span className="block text-sm font-medium text-[#214E31]">{title}</span>
          <span className="mt-1 block text-xs leading-5 text-[#52705B]">{description}</span>
        </span>
      </span>
      <DataBadge tone="green">Always on</DataBadge>
    </div>
  )
}
