import { CheckCheckIcon } from "lucide-react"
import type { Metadata } from "next"

import { ReviewQueue, type Pair } from "@/components/review-queue"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { getData } from "@/lib/data"
import { ISSUES, values, type Issue, type Voucher } from "@/lib/ledger"

export const metadata: Metadata = { title: "Workspace" }

export default async function Workspace() {
  const { rows, error, today } = await getData()
  const flagged = rows.filter((r) => r.issues.length)

  // Rows come newest first, so A is the newer voucher of each pair.
  const byDv = new Map<string, Voucher[]>()
  for (const r of flagged) if (r.issues.includes("duplicate_dv")) byDv.set(r.dv_no.trim(), [...(byDv.get(r.dv_no.trim()) ?? []), r])
  const pairs: Pair[] = [...byDv].filter(([, l]) => l.length === 2).map(([dv, [a, b]]) => ({ dv, a, b }))
  // Three or more on one DV # don't fit the A/B compare; they get a plain list like the other checks.
  const crowded = [...byDv.values()].filter((l) => l.length > 2).flat()
  const others: [string, Issue, Voucher[]][] = [
    ...(crowded.length ? [["Duplicate DV # · 3 or more", "duplicate_dv", crowded] as [string, Issue, Voucher[]]] : []),
    ...(Object.keys(ISSUES) as Issue[]).filter((i) => i !== "duplicate_dv")
      .map((i): [string, Issue, Voucher[]] => [ISSUES[i], i, flagged.filter((r) => r.issues.includes(i))]),
  ].filter(([, , l]) => l.length)

  if (!flagged.length) return !error && (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon"><CheckCheckIcon /></EmptyMedia>
        <EmptyTitle>Nothing to review.</EmptyTitle>
        <EmptyDescription>Every voucher has a unique DV #, a DV date, an amount, a check # and a trade area.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )

  return (
    <ReviewQueue
      pairs={pairs}
      others={others}
      areas={values(flagged, "trade_area")}
      dvNos={rows.map((r) => r.dv_no.trim()).filter(Boolean)}
      today={today}
    />
  )
}
