import { Badge } from "@/components/ui/badge"
import { STATE_LABELS, type State } from "@/lib/ledger"

const VARIANT = { overdue: "destructive", pending: "outline", paid: "secondary" } as const

export function StatusBadge({ state, children }: { state: State; children?: React.ReactNode }) {
  return <Badge variant={VARIANT[state]}>{children ?? STATE_LABELS[state]}</Badge>
}
