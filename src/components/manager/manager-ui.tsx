import type { ElementType, ReactNode } from "react"
import { CircleAlert } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#86868B]">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-[#1D1D1F] sm:text-[34px]">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6E6E73]">{description}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

export function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  tone = "burgundy",
}: {
  label: string
  value: string
  note: string
  icon: ElementType
  tone?: "burgundy" | "green" | "amber" | "blue"
}) {
  const tones = {
    burgundy: "bg-[#F5EDF0] text-[#6E0728]",
    green: "bg-[#EEF8F1] text-[#267343]",
    amber: "bg-[#FFF7E8] text-[#98701A]",
    blue: "bg-[#F0F3FC] text-[#4D5CA8]",
  }

  return (
    <Card className="rounded-2xl border-[#E8E8ED] bg-white shadow-none">
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <p className="text-sm text-[#6E6E73]">{label}</p>
          <p className="mt-2 truncate text-2xl font-semibold tracking-[-0.03em] text-[#1D1D1F]">{value}</p>
          <p className="mt-1 text-xs leading-5 text-[#A1A1A6]">{note}</p>
        </div>
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", tones[tone])}>
          <Icon size={19} aria-hidden="true" />
        </span>
      </CardContent>
    </Card>
  )
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center px-6 py-12 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-[#F5EDF0] text-[#6E0728]">
        <CircleAlert size={19} />
      </span>
      <p className="mt-4 text-sm font-semibold text-[#1D1D1F]">{title}</p>
      <p className="mt-1 max-w-sm text-sm leading-6 text-[#86868B]">{description}</p>
    </div>
  )
}

export function DataBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode
  tone?: "green" | "amber" | "red" | "blue" | "neutral" | "burgundy"
}) {
  const tones = {
    green: "border-[#CDE9D7] bg-[#F0FAF3] text-[#267343]",
    amber: "border-[#F2E2BD] bg-[#FFF9EB] text-[#8A6517]",
    red: "border-[#F0CECC] bg-[#FFF3F2] text-[#A13B34]",
    blue: "border-[#D8DDF5] bg-[#F3F5FF] text-[#4D5CA8]",
    neutral: "border-[#E5E5EA] bg-[#F7F7F8] text-[#68686D]",
    burgundy: "border-[#E6D1D9] bg-[#FAF3F6] text-[#6E0728]",
  }

  return (
    <Badge variant="outline" className={cn("font-medium", tones[tone])}>
      {children}
    </Badge>
  )
}

export function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string
  value: ReactNode
  mono?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-sm text-[#86868B]">{label}</span>
      <span className={cn("max-w-[65%] break-words text-right text-sm font-medium text-[#1D1D1F]", mono && "font-mono text-xs")}>
        {value}
      </span>
    </div>
  )
}
