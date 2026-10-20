import { byIssue, group, isVerified, ISSUES, label, longMonth, median, monthLabel, months, monthsBack, NOT_SET, peso, total, type Issue, type Voucher } from "@/lib/ledger"

// Order follows the usual layout of a financial report: key figures first, then the analysis of
// disbursements by nature (category) and by segment (trade area, program), then period and
// counterparty analysis, then exceptions, with the voucher register as the supporting schedule.
export const REPORTS = {
  summary: "Full report",
  kpi: "Key performance indicators",
  category: "Disbursements by category",
  area: "Disbursements by trade area",
  program: "Disbursements by diploma / ST / assessment",
  monthly: "Disbursements by month",
  payee: "Disbursements by payee",
  review: "Exceptions for review",
  audit: "Voucher register (audit extract)",
} as const
export type Kind = keyof typeof REPORTS
type TableKind = Exclude<Kind, "summary">

/** Reports grouped as the sidebar and the full report's contents list them. */
export const CLUSTERS: [string, Kind[]][] = [
  ["Overview", ["summary", "kpi"]],
  ["Analysis of disbursements", ["category", "area", "program"]],
  ["Period and payee", ["monthly", "payee"]],
  ["Compliance", ["review", "audit"]],
]
export const clusterOf = (k: Kind) => CLUSTERS.find(([, ks]) => ks.includes(k))![0]
/** The full report compiles every table except the register, which is every voucher and stays separate. */
const SUMMARY: TableKind[] = ["kpi", "category", "area", "program", "monthly", "payee", "review"]

export const PERIODS = { all: "All dates", month: "Month", quarter: "Quarter", year: "Year", range: "Range of months" } as const
export type Period = keyof typeof PERIODS

/** The period in scope: inclusive "YYYY-MM" bounds ("" for all dates), its heading, and the period before it. */
export type Scope = { by: Period; from: string; to: string; label: string; prior: { from: string; to: string; label: string } | null }

/** "2026-09" -> "September 30, 2026" (last day of the month). */
const monthEnd = (m: string) => {
  const [y, mo] = m.split("-").map(Number)
  return `${longMonth(m)} ${new Date(Date.UTC(y, mo, 0)).getUTCDate()}, ${y}`
}
const span = (from: string, to: string) => {
  const [fy, fm] = from.split("-").map(Number), [ty, tm] = to.split("-").map(Number)
  return (ty - fy) * 12 + tm - fm + 1
}
/** IFRS-style period heading: "For the quarter ended September 30, 2026". */
const heading = (from: string, to: string) => {
  const n = span(from, to)
  if (n === 1) return `For the month ended ${monthEnd(to)}`
  if (n === 3 && Number(from.slice(5)) % 3 === 1) return `For the quarter ended ${monthEnd(to)}`
  if (n === 12 && from.endsWith("-01")) return `For the year ended ${monthEnd(to)}`
  return `For the period ${longMonth(from)} 1${from.slice(0, 4) === to.slice(0, 4) ? "" : `, ${from.slice(0, 4)}`} to ${monthEnd(to)}`
}

/** Reads ?period= with ?month=, ?year= + ?q=, or ?from= + ?to=. A bare ?month= (old links) means that month. */
export function readScope(p: URLSearchParams, newest: string): Scope {
  const raw = p.get("period") ?? ""
  const by: Period = raw in PERIODS ? (raw as Period) : p.get("month") ? "month" : "all"
  const month = p.get("month") || newest
  const year = p.get("year") || month.slice(0, 4)
  let from = "", to = ""
  if (by === "month") from = to = month
  else if (by === "quarter") {
    const q = Number(p.get("q")) || Math.ceil(Number(month.slice(5)) / 3)
    from = `${year}-${String(q * 3 - 2).padStart(2, "0")}`
    to = `${year}-${String(q * 3).padStart(2, "0")}`
  } else if (by === "year") [from, to] = [`${year}-01`, `${year}-12`]
  else if (by === "range") {
    ;[from, to] = [p.get("from") || `${newest.slice(0, 4)}-01`, p.get("to") || newest].sort()
  }
  if (by === "all") return { by, from, to, label: "All dates on record", prior: null }
  const n = span(from, to), pf = monthsBack(from, n), pt = monthsBack(to, n)
  return { by, from, to, label: heading(from, to), prior: { from: pf, to: pt, label: heading(pf, pt) } }
}

export const inRange = (r: Voucher, from: string, to: string) => !from || (r.month >= from && r.month <= to)

/** How a column prints: text, count, pesos (centavos), percent (a fraction), or a preformatted figure. */
export type Fmt = "text" | "int" | "peso" | "pct" | "figure"
/** w: share of the table's width; the page also uses it to guess how many lines a cell wraps to. */
export type Col = { head: string; fmt: Fmt; w: number }
export type Cell = string | number | null
export type Table = { kind: TableKind; title: string; cols: Col[]; rows: Cell[][]; foot?: Cell[]; note?: string }

const LABELS: Record<"category" | "area" | "program" | "payee", [string, (r: Voucher) => string]> = {
  category: ["Category", (r) => label(r, "category")],
  area: ["Trade area", (r) => label(r, "trade_area")],
  program: ["Diploma / ST / Assessment", (r) => label(r, "diploma_st_assessment")],
  payee: ["Payee", (r) => r.payee.trim() || NOT_SET],
}

const share = (v: number, of: number) => (of ? v / of : null)
const avg = (amt: number, n: number) => (n ? Math.round(amt / n) : null)

/** No. · label · vouchers · amount · average · % of total, then a total row. */
function grouped(kind: TableKind, head: string, lines: [string, number, number][], rows: Voucher[], extra?: Col): Table {
  const sum = total(rows), n = rows.length
  return {
    kind, title: REPORTS[kind],
    cols: [{ head: "No.", fmt: "int", w: 0.06 }, { head, fmt: "text", w: extra ? 0.24 : 0.38 }, { head: "Vouchers", fmt: "int", w: 0.1 },
      { head: "Amount", fmt: "peso", w: 0.18 }, { head: "Average", fmt: "peso", w: 0.16 }, { head: "% of total", fmt: "pct", w: 0.12 },
      ...(extra ? [extra] : [])],
    rows: lines.map(([k, c, a], i) => [i + 1, k, c, a, avg(a, c), share(a, sum)]),
    foot: ["", "Total", n, sum, avg(sum, n), sum ? 1 : null],
  }
}

/** Indicator · this period · prior period · change. Without a prior period, just the value. */
function kpis(rows: Voucher[], prior: Voucher[] | null, scope: Scope, month: string): Table {
  const stats = (rs: Voucher[], from = scope.from, to = scope.to) => {
    const sum = total(rs), n = rs.length
    const payees = group(rs, LABELS.payee[1])
    // Months elapsed, so a year still in progress isn't averaged over months yet to come.
    const nMonths = from ? Math.max(0, span(from, to < month ? to : month)) : new Set(rs.map((r) => r.month).filter(Boolean)).size
    const flagged = rs.filter((r) => r.issues.length)
    return [
      ["Total disbursements", "peso", sum],
      ["Number of vouchers", "int", n],
      ["Average per voucher", "peso", avg(sum, n)],
      ["Median voucher", "peso", n ? median(rs) : null],
      ["Largest single voucher", "peso", n ? Math.max(...rs.map((r) => r.amount)) : null],
      ["Average per month", "peso", avg(sum, nMonths)],
      ["Number of payees", "int", payees.length],
      ["Top 5 payees, share of amount", "pct", share(payees.slice(0, 5).reduce((s, p) => s + p[2], 0), sum)],
      ["Vouchers with check #", "pct", share(rs.filter((r) => r.check_number.trim()).length, n)],
      ["Vouchers verified", "pct", share(rs.filter(isVerified).length, n)],
      ["Exception rate (vouchers for review)", "pct", share(flagged.length, n)],
      ["Amount under exception", "peso", total(flagged)],
    ] as [string, Fmt, number | null][]
  }
  const now = stats(rows), before = prior && stats(prior, scope.prior!.from, scope.prior!.to)
  const change = (a: number | null, b: number | null, fmt: Fmt) => {
    if (a === null || b === null) return null
    if (fmt === "pct") return `${a >= b ? "+" : "−"}${(Math.abs(a - b) * 100).toFixed(1)} pp`
    return b ? `${a >= b ? "+" : "−"}${(Math.abs(a / b - 1) * 100).toFixed(1)}%` : null
  }
  // Each row has its own format, so cells come preformatted.
  return {
    kind: "kpi", title: REPORTS.kpi,
    cols: before
      ? [{ head: "Indicator", fmt: "text", w: 0.4 }, { head: "This period", fmt: "figure", w: 0.21 }, { head: "Prior period", fmt: "figure", w: 0.21 }, { head: "Change", fmt: "figure", w: 0.18 }]
      : [{ head: "Indicator", fmt: "text", w: 0.6 }, { head: "Value", fmt: "figure", w: 0.4 }],
    rows: now.map(([k, fmt, v], i) => before
      ? [k, fmtCell(v, fmt), fmtCell(before[i][2], fmt), change(v, before[i][2], fmt)]
      : [k, fmtCell(v, fmt)]),
    note: before ? `Prior period: ${scope.prior!.label.replace(/^For the /, "the ")}. pp = percentage points.` : undefined,
  }
}

/** 8902100 -> "₱89,021.00", 0.123 -> "12.3%", null -> "—". */
export function fmtCell(v: Cell, fmt: Fmt): string {
  if (v === null) return "—"
  if (typeof v === "string") return v
  if (fmt === "peso") return peso(v)
  if (fmt === "pct") return `${(v * 100).toFixed(1)}%`
  return v.toLocaleString("en-US")
}

function table(kind: TableKind, rows: Voucher[], prior: Voucher[] | null, scope: Scope, month: string): Table {
  if (kind === "kpi") return kpis(rows, prior, scope, month)
  if (kind === "monthly") {
    // Every month in the period, oldest first, zero months included; undated vouchers last.
    const ms = scope.from ? Array.from({ length: span(scope.from, scope.to) }, (_, i) => monthsBack(scope.to, span(scope.from, scope.to) - 1 - i)) : months(rows).reverse()
    const lines = ms.map((m): [string, number, number] => { const rs = rows.filter((r) => r.month === m); return [monthLabel(m), rs.length, total(rs)] })
    const undated = rows.filter((r) => !r.month)
    if (undated.length) lines.push(["Undated", undated.length, total(undated)])
    const t = grouped(kind, "Month", lines, rows, { head: "Cumulative", fmt: "peso", w: 0.14 })
    let run = 0
    t.rows.forEach((r) => r.push((run += r[3] as number)))
    t.foot!.push(run)
    return t
  }
  if (kind === "review") {
    const flagged = rows.filter((r) => r.issues.length), n = rows.length
    return {
      kind, title: REPORTS.review,
      cols: [{ head: "No.", fmt: "int", w: 0.06 }, { head: "Check", fmt: "text", w: 0.38 }, { head: "Vouchers", fmt: "int", w: 0.12 },
        { head: "Amount", fmt: "peso", w: 0.22 }, { head: "% of vouchers", fmt: "pct", w: 0.22 }],
      rows: byIssue(flagged).map(([i, list], k) => [k + 1, ISSUES[i as Issue], list.length, total(list), share(list.length, n)]),
      foot: ["", "Vouchers with at least one exception", flagged.length, total(flagged), share(flagged.length, n)],
      note: "A voucher can fail more than one check, so the lines can add up to more than the total.",
    }
  }
  if (kind === "audit") {
    // A register reads in date order; undated vouchers last.
    const list = [...rows].sort((a, b) => (a.dv ?? "9") < (b.dv ?? "9") ? -1 : (a.dv ?? "9") > (b.dv ?? "9") ? 1 : a.sheet_row - b.sheet_row)
    return {
      kind, title: REPORTS.audit,
      cols: [{ head: "DV date", fmt: "text", w: 0.1 }, { head: "DV #", fmt: "text", w: 0.1 }, { head: "Payee", fmt: "text", w: 0.16 },
        { head: "Particulars", fmt: "text", w: 0.22 }, { head: "Area", fmt: "text", w: 0.08 }, { head: "Check #", fmt: "text", w: 0.09 },
        { head: "Review", fmt: "text", w: 0.11 }, { head: "Amount", fmt: "peso", w: 0.14 }],
      rows: list.map((r) => [r.dv_date, r.dv_no, r.payee, r.particulars, r.trade_area, r.check_number, r.issues.map((i) => ISSUES[i]).join(", ") || "OK", r.amount]),
      foot: [`Total · ${rows.length} vouchers`, "", "", "", "", "", "", total(rows)],
    }
  }
  const [head, key] = LABELS[kind]
  // Largest first; "Not set" last, as unclassified lines go at the foot of a schedule.
  const lines = group(rows, key).sort((a, b) => Number(a[0] === NOT_SET) - Number(b[0] === NOT_SET))
  return grouped(kind, head, lines, rows)
}

/** The report's choices from the URL, every voucher in scope, and its tables (several for the full report). */
export function buildReport(rows: Voucher[], p: URLSearchParams, today: string) {
  const kind: Kind = (p.get("report") ?? "") in REPORTS ? (p.get("report") as Kind) : "summary"
  const scope = readScope(p, months(rows)[0] ?? today.slice(0, 7))
  const area = p.get("area") ?? ""
  const inArea = rows.filter((r) => !area || label(r, "trade_area") === area)
  const scoped = inArea.filter((r) => inRange(r, scope.from, scope.to))
  const prior = scope.prior && inArea.filter((r) => inRange(r, scope.prior!.from, scope.prior!.to))
  const tables = (kind === "summary" ? SUMMARY : [kind]).map((k) => table(k, scoped, prior, scope, today.slice(0, 7)))
  return { kind, scope, area, scoped, tables }
}
