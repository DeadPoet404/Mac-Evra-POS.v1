import { requirePermissions } from "@/lib/auth/server"

export default async function TradeInLayout({ children }: { children: React.ReactNode }) {
  await requirePermissions(["access_employee_workspace", "process_trade_ins"], { nextPath: "/trade-in" })
  return children
}
