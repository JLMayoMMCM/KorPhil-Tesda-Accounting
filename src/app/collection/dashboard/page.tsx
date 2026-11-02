import { ChartNoAxesColumnIcon, ClipboardListIcon } from "lucide-react"
import type { Metadata } from "next"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Dashboard · Collections" }

// Same soft panels as the voucher dashboard.
const PANEL = "rounded-2xl ring-0 border shadow-xs"

const FIGURES = ["Collected this year", "Collected this month"]
const CARDS = [
  { title: "Collections by month", text: "Monthly totals once the collection sheet is connected.", icon: ChartNoAxesColumnIcon },
  { title: "Recent receipts", text: "The latest official receipts will be listed here.", icon: ClipboardListIcon },
]

/** Placeholder for the collection overview; the layout matches the voucher dashboard so both modules feel alike. */
export default function CollectionDashboard() {
  return (
    <div className="@container/main flex w-full flex-col gap-4">
      <div className="flex items-center gap-2 border-b pb-2">
        <Badge variant="secondary">Coming soon</Badge>
        <span className="text-sm text-muted-foreground">The Collection Sheet module is being built. Figures will appear here.</span>
      </div>
      <dl aria-label="Key figures" className="grid gap-4 @3xl/main:grid-cols-2">
        {FIGURES.map((label) => (
          <div key={label} className={cn(PANEL, "flex flex-col gap-1 bg-card px-5 py-4")}>
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="text-3xl font-semibold tracking-tight text-muted-foreground tabular-nums @5xl/main:text-4xl">₱ —</dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-4 @3xl/main:grid-cols-2">
        {CARDS.map(({ title, text, icon: Icon }) => (
          <Card key={title} className={PANEL}>
            <CardHeader>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{text}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon"><Icon /></EmptyMedia>
                  <EmptyTitle>No data yet</EmptyTitle>
                  <EmptyDescription>{text}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
