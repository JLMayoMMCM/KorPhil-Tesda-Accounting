import { Badge } from "@/components/ui/badge"
import { ISSUES, type Issue } from "@/lib/ledger"

/** A voucher's review flags, or a quiet "OK" when it has none. */
export function IssueBadges({ issues }: { issues: Issue[] }) {
  if (!issues.length) return <span className="text-muted-foreground">OK</span>
  return (
    <span className="flex flex-wrap gap-1">
      {issues.map((i) => <Badge key={i} variant="outline" className="border-destructive/40 text-destructive">{ISSUES[i]}</Badge>)}
    </span>
  )
}
