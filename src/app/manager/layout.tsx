import { ManagerShell } from "@/components/manager/manager-shell"

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  return <ManagerShell>{children}</ManagerShell>
}
