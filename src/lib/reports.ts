import { BUCKETS, group, label, monthLabel, NOT_SET, STATE_LABELS, type Bucket, type State, type Voucher } from "@/lib/ledger"

export const REPORTS = {
  summary: "Disbursement summary",
  aging: "Unpaid and overdue aging",
  area: "Totals by trade area",
  category: "Totals by category",
  monthly: "Monthly totals",
  audit: "Audit extract, all fields",
} as const
export type Kind = keyof typeof REPORTS

const KEYS: Record<Exclude<Kind, "audit">, (r: Voucher) => string> = {
  summary: (r) => r.state,
  aging: (r) => r.bucket,
  area: (r) => label(r, "trade_area"),
  category: (r) => label(r, "category"),
  monthly: (r) => r.month,
}

export type Line = { label: string; count: number; amount: number; state: State | "" }

/** The report's choices from the URL, the rows in scope, and its grouped lines (none for audit). */
export function buildReport(rows: Voucher[], p: URLSearchParams) {
  const kind: Kind = (p.get("report") ?? "") in REPORTS ? (p.get("report") as Kind) : "summary"
  const month = p.get("month") ?? "", area = p.get("area") ?? "", state = p.get("status") ?? ""
  let scoped = rows.filter((r) =>
    (!month || r.month === month) && (!area || label(r, "trade_area") === area) && (!state || r.state === state))
  if (kind === "aging") scoped = scoped.filter((r) => r.state !== "paid")

  const lines: Line[] = []
  if (kind !== "audit") {
    const grouped = group(scoped, KEYS[kind])
    if (kind === "summary") grouped.sort((a, b) => Object.keys(STATE_LABELS).indexOf(a[0]) - Object.keys(STATE_LABELS).indexOf(b[0]))
    else if (kind === "aging") grouped.sort((a, b) => Object.keys(BUCKETS).indexOf(a[0]) - Object.keys(BUCKETS).indexOf(b[0]))
    else if (kind === "monthly") grouped.sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    for (const [k, count, amount] of grouped) {
      const text = kind === "summary" ? STATE_LABELS[k as State]
        : kind === "aging" ? BUCKETS[k as Bucket]
        : kind === "monthly" ? (k ? monthLabel(k) : "")
        : k
      lines.push({ label: text || NOT_SET, count, amount, state: kind === "summary" ? (k as State) : "" })
    }
  }
  return { kind, month, area, state, scoped, lines }
}
