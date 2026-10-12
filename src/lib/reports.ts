import { byIssue, group, ISSUES, label, monthLabel, NOT_SET, type Issue, type Voucher } from "@/lib/ledger"

export const REPORTS = {
  summary: "Summary, all reports",
  monthly: "Monthly totals",
  area: "Totals by trade area",
  program: "Totals by diploma / ST / assessment",
  category: "Totals by category",
  payee: "Totals by payee",
  review: "Needs review",
  audit: "Audit extract, all fields",
} as const
export type Kind = keyof typeof REPORTS
/** The reports the summary compiles. The audit extract is every voucher, not a summary, so it stays separate. */
const SUMMARY: Part["kind"][] = ["monthly", "area", "program", "category", "payee", "review"]

const KEYS: Record<Exclude<Kind, "summary" | "audit" | "review">, (r: Voucher) => string> = {
  monthly: (r) => r.month,
  area: (r) => label(r, "trade_area"),
  program: (r) => label(r, "diploma_st_assessment"),
  category: (r) => label(r, "category"),
  payee: (r) => r.payee.trim(),
}

export type Line = { label: string; count: number; amount: number }

/** One report's rows in scope and grouped lines (none for audit). */
export type Part = { kind: Exclude<Kind, "summary">; scoped: Voucher[]; lines: Line[] }

function part(kind: Part["kind"], inScope: Voucher[]): Part {
  const scoped = kind === "review" ? inScope.filter((r) => r.issues.length) : inScope
  let lines: Line[] = []
  if (kind === "review") {
    // A voucher can fail several checks, so these lines can add up to more than the total.
    lines = byIssue(scoped).map(([i, list]) => ({ label: ISSUES[i as Issue], count: list.length, amount: list.reduce((s, r) => s + r.amount, 0) }))
  } else if (kind !== "audit") {
    const grouped = group(scoped, KEYS[kind])
    if (kind === "monthly") grouped.sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    lines = grouped.map(([k, count, amount]) => ({ label: (kind === "monthly" ? (k ? monthLabel(k) : "") : k) || NOT_SET, count, amount }))
  }
  return { kind, scoped, lines }
}

/** The report's choices from the URL, every voucher in scope, and its parts (several for the summary). */
export function buildReport(rows: Voucher[], p: URLSearchParams) {
  const kind: Kind = (p.get("report") ?? "") in REPORTS ? (p.get("report") as Kind) : "summary"
  const month = p.get("month") ?? "", area = p.get("area") ?? ""
  const scoped = rows.filter((r) => (!month || r.month === month) && (!area || label(r, "trade_area") === area))
  const parts = (kind === "summary" ? SUMMARY : [kind]).map((k) => part(k, scoped))
  return { kind, month, area, scoped, parts }
}
