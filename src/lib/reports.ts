import { byIssue, group, ISSUES, label, monthLabel, NOT_SET, type Issue, type Voucher } from "@/lib/ledger"

export const REPORTS = {
  monthly: "Monthly totals",
  area: "Totals by trade area",
  program: "Totals by diploma / ST / assessment",
  category: "Totals by category",
  payee: "Totals by payee",
  review: "Needs review",
  audit: "Audit extract, all fields",
} as const
export type Kind = keyof typeof REPORTS

const KEYS: Record<Exclude<Kind, "audit" | "review">, (r: Voucher) => string> = {
  monthly: (r) => r.month,
  area: (r) => label(r, "trade_area"),
  program: (r) => label(r, "diploma_st_assessment"),
  category: (r) => label(r, "category"),
  payee: (r) => r.payee.trim(),
}

export type Line = { label: string; count: number; amount: number }

/** The report's choices from the URL, the rows in scope, and its grouped lines (none for audit). */
export function buildReport(rows: Voucher[], p: URLSearchParams) {
  const kind: Kind = (p.get("report") ?? "") in REPORTS ? (p.get("report") as Kind) : "monthly"
  const month = p.get("month") ?? "", area = p.get("area") ?? ""
  let scoped = rows.filter((r) => (!month || r.month === month) && (!area || label(r, "trade_area") === area))
  if (kind === "review") scoped = scoped.filter((r) => r.issues.length)

  let lines: Line[] = []
  if (kind === "review") {
    // A voucher can fail several checks, so these lines can add up to more than the total.
    lines = byIssue(scoped).map(([i, list]) => ({ label: ISSUES[i as Issue], count: list.length, amount: list.reduce((s, r) => s + r.amount, 0) }))
  } else if (kind !== "audit") {
    const grouped = group(scoped, KEYS[kind])
    if (kind === "monthly") grouped.sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    lines = grouped.map(([k, count, amount]) => ({ label: (kind === "monthly" ? (k ? monthLabel(k) : "") : k) || NOT_SET, count, amount }))
  }
  return { kind, month, area, scoped, lines }
}
