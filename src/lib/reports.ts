import { byIssue, FIELD_LABELS, FIELDS, group, isVerified, ISSUES, label, longMonth, median, monthLabel, months, monthsBack, NOT_SET, peso, total, type Field, type Issue, type Voucher } from "@/lib/ledger"
import type { Column } from "@/lib/sheet-config"

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
// R5: every other dropdown column in the sheet gets its own breakdown, keyed by its column key ("x:" + header).
export type Kind = keyof typeof REPORTS | `x:${string}`
type TableKind = Exclude<Kind, "summary">
export const titleOf = (k: Kind) => (k.startsWith("x:") ? `Disbursements by ${k.slice(2)}` : REPORTS[k as keyof typeof REPORTS])
// The column each fixed breakdown needs; without it the report is left out.
const NEEDS: Partial<Record<Kind, Field>> = { category: "category", area: "trade_area", program: "diploma_st_assessment", payee: "payee" }

/** Reports grouped as the sidebar and the full report's contents list them. */
export const CLUSTERS: [string, Kind[]][] = [
  ["Overview", ["summary", "kpi"]],
  ["Analysis of disbursements", ["category", "area", "program"]],
  ["Period and payee", ["monthly", "payee"]],
  ["Compliance", ["review", "audit"]],
]
export const clusterOf = (k: Kind) => (k.startsWith("x:") ? CLUSTERS[1][0] : CLUSTERS.find(([, ks]) => ks.includes(k))![0])
/** The full report compiles every table, the voucher register last as its supporting schedule. */
const SUMMARY: TableKind[] = ["kpi", "category", "area", "program", "monthly", "payee", "review", "audit"]

/** Dropdown columns with no role: each one's report kind. */
const extraKinds = (columns: Column[]) =>
  columns.filter((c) => !c.field && c.type === "dropdown" && c.visibility !== "hidden").map((c) => c.key as `x:${string}`)
/** CLUSTERS for this sheet: fixed breakdowns whose column exists, then the extra dropdown columns after them. */
export function clustersFor(columns: Column[]): [string, Kind[]][] {
  const has = (k: Kind) => !NEEDS[k] || columns.some((c) => c.field === NEEDS[k])
  return CLUSTERS.map(([name, ks], i) => [name, [...ks.filter(has), ...(i === 1 ? extraKinds(columns) : [])]])
}

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
/**
 * One schedule. no and cluster: its number and group in the report (none for the basis of preparation). basis: what it
 * was computed on, printed under the title. notes: definitions and caveats, printed under the table.
 * lines: when set, each row prints on two lines, these column indexes on each (w is then a share of its line).
 */
export type Table = { kind: TableKind | "basis"; no?: number; cluster?: string; title: string; basis?: string; cols: Col[]; rows: Cell[][]; foot?: Cell[]; notes: string[]; lines?: [number[], number[]] }

/** 8902100 -> "89,021.00" (peso columns say ₱ in the heading), 0.123 -> "12.3%", null -> "—". */
export function fmtCell(v: Cell, fmt: Fmt): string {
  if (v === null) return "—"
  if (typeof v === "string") return v
  if (fmt === "peso") return peso(v).replace("₱", "")
  if (fmt === "pct") return `${(v * 100).toFixed(1)}%`
  return v.toLocaleString("en-US")
}

// The columns every schedule shares, so they read the same everywhere. AMOUNT is also how
// reconciliation finds a schedule's total.
const NO: Col = { head: "No.", fmt: "int", w: 0.06 }
const COUNT: Col = { head: "Vouchers", fmt: "int", w: 0.1 }
const AMOUNT: Col = { head: "Amount (₱)", fmt: "peso", w: 0.18 }
const AVERAGE: Col = { head: "Average (₱)", fmt: "peso", w: 0.16 }
const SHARE: Col = { head: "% of total", fmt: "pct", w: 0.12 }
const TOTAL = "Total"
const NOT_SET_NOTE = `"${NOT_SET}": the column is blank on the voucher.`

const share = (v: number, of: number) => (of ? v / of : null)
const avg = (amt: number, n: number) => (n ? Math.round(amt / n) : null)

/** What every builder gets: the vouchers in scope, the prior period's (null for all dates), and the sheet. */
type Ctx = { rows: Voucher[]; prior: Voucher[] | null; scope: Scope; month: string; has: (f: Field) => boolean; columns: Column[] }
type Body = Omit<Table, "kind" | "title" | "no" | "cluster">

/** No. · label · vouchers · amount · average · % of total, then a total row. */
function grouped(head: string, lines: [string, number, number][], rows: Voucher[], extra?: Col): Body {
  const sum = total(rows), n = rows.length
  return {
    cols: [NO, { head, fmt: "text", w: extra ? 0.24 : 0.38 }, COUNT, AMOUNT, AVERAGE, SHARE, ...(extra ? [extra] : [])],
    rows: lines.map(([k, c, a], i) => [i + 1, k, c, a, avg(a, c), share(a, sum)]),
    foot: ["", TOTAL, n, sum, avg(sum, n), sum ? 1 : null],
    notes: lines.some(([k]) => k === NOT_SET) ? [NOT_SET_NOTE] : [],
  }
}

/** A breakdown by one column: largest first; "Not set" last, as unclassified lines go at the foot of a schedule. */
const breakdown = (head: string, key: (r: Voucher) => string) => ({ rows }: Ctx): Body => {
  const lines = group(rows, key).sort((a, b) => Number(a[0] === NOT_SET) - Number(b[0] === NOT_SET))
  return { ...grouped(head, lines, rows), basis: `Vouchers in scope, grouped by ${head.toLowerCase()}, largest amount first.` }
}

/** Indicator · this period · prior period · change. Without a prior period, just the value. */
function kpis({ rows, prior, scope, month, has }: Ctx): Body {
  const stats = (rs: Voucher[], from = scope.from, to = scope.to) => {
    const sum = total(rs), n = rs.length
    const payees = group(rs, (r) => r.payee.trim() || NOT_SET)
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
      ...(has("check_number") ? [["Vouchers with check #", "pct", share(rs.filter((r) => r.check_number.trim()).length, n)]] : []),
      ...(has("status") ? [["Vouchers verified", "pct", share(rs.filter(isVerified).length, n)]] : []),
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
  // Rows mix units, so cells come preformatted and pesos keep their sign.
  const show = (v: number | null, fmt: Fmt) => (fmt === "peso" && v !== null ? peso(v) : fmtCell(v, fmt))
  return {
    basis: before ? `Vouchers in scope, against ${scope.prior!.label.replace(/^For the /, "the ")}.` : "Vouchers in scope. No prior period is compared for all dates.",
    cols: before
      ? [{ head: "Indicator", fmt: "text", w: 0.4 }, { head: "This period", fmt: "figure", w: 0.21 }, { head: "Prior period", fmt: "figure", w: 0.21 }, { head: "Change", fmt: "figure", w: 0.18 }]
      : [{ head: "Indicator", fmt: "text", w: 0.6 }, { head: "Value", fmt: "figure", w: 0.4 }],
    rows: now.map(([k, fmt, v], i) => before ? [k, show(v, fmt), show(before[i][2], fmt), change(v, before[i][2], fmt)] : [k, show(v, fmt)]),
    notes: [
      "Median: the middle voucher amount. Average per month: total over the months of the period that have begun.",
      "Exception rate: vouchers failing at least one review check (Schedule \"Exceptions for review\"), over all vouchers.",
      ...(before ? ["Change: percent change for amounts and counts; pp (percentage points) for shares."] : []),
    ],
  }
}

/** Every month in the period, oldest first, zero months included; undated vouchers last; with a running total. */
function monthly({ rows, scope }: Ctx): Body {
  const ms = scope.from ? Array.from({ length: span(scope.from, scope.to) }, (_, i) => monthsBack(scope.to, span(scope.from, scope.to) - 1 - i)) : months(rows).reverse()
  const lines = ms.map((m): [string, number, number] => { const rs = rows.filter((r) => r.month === m); return [monthLabel(m), rs.length, total(rs)] })
  const undated = rows.filter((r) => !r.month)
  if (undated.length) lines.push(["Undated", undated.length, total(undated)])
  const t = grouped("Month", lines, rows, { head: "Cumulative (₱)", fmt: "peso", w: 0.14 })
  let run = 0
  t.rows.forEach((r) => r.push((run += r[3] as number)))
  t.foot!.push(run)
  return {
    ...t, basis: "Vouchers in scope by month of DV date, oldest first. Months with no vouchers are shown as zero.",
    notes: undated.length ? ["Undated: the DV date is blank or unreadable."] : [],
  }
}

function review({ rows }: Ctx): Body {
  const flagged = rows.filter((r) => r.issues.length), n = rows.length
  return {
    basis: "Vouchers in scope that fail one or more review checks, by check.",
    cols: [NO, { head: "Check", fmt: "text", w: 0.38 }, { ...COUNT, w: 0.12 }, { ...AMOUNT, w: 0.22 }, { head: "% of vouchers", fmt: "pct", w: 0.22 }],
    rows: byIssue(flagged).map(([i, list], k) => [k + 1, ISSUES[i as Issue], list.length, total(list), share(list.length, n)]),
    foot: ["", "Vouchers with at least one exception", flagged.length, total(flagged), share(flagged.length, n)],
    notes: [
      "A voucher can fail more than one check, so the lines can add up to more than the total.",
      "Checks: DV # blank, or the same DV # on more than one row of the sheet; DV date blank or unreadable; amount blank, zero or unreadable; check # blank; trade area blank.",
      "A voucher marked Verified is flagged only for a duplicate DV #; its other blanks were signed off.",
    ],
  }
}

// Register, line 1: what identifies and pays the voucher; line 2: everything else the sheet shows.
const TOP: Partial<Record<Field, number>> = { dv_date: 0.11, dv_no: 0.16, payee: 0.29, check_number: 0.12, gross_amount: 0.14 }
const ROW_W = 0.06

/**
 * Every voucher in scope, in date order, traceable to its sheet row: every column the sheet shows (sheet order, for the
 * CSV), printed on two lines per voucher: Row, DV date, DV #, payee, check #, amount, review; then the rest, indented.
 */
function audit({ rows, columns }: Ctx): Body {
  const list = [...rows].sort((a, b) => (a.dv ?? "9") < (b.dv ?? "9") ? -1 : (a.dv ?? "9") > (b.dv ?? "9") ? 1 : a.sheet_row - b.sheet_row)
  // Without a column model (no pull yet), the role fields stand in for the sheet's columns.
  const shown = columns.length
    ? columns.filter((c) => c.visibility !== "hidden").map((c) => ({ key: c.key, field: c.field, label: c.label }))
    : FIELDS.filter((f) => f !== "status").map((f) => ({ key: f, field: f, label: FIELD_LABELS[f] }))
  const top = (c: (typeof shown)[number]) => c.field !== null && c.field in TOP
  // Line 2 shares what the indent leaves: particulars four parts, every other column one.
  const weight = (f: Field | null) => (f === "particulars" ? 4 : 1)
  const rest = shown.filter((c) => !top(c)).reduce((s, c) => s + weight(c.field), 0)
  const cols: Col[] = [
    { head: "Row", fmt: "int", w: ROW_W },
    ...shown.map((c): Col => c.field === "gross_amount" ? { ...AMOUNT, w: TOP.gross_amount! }
      : { head: c.label, fmt: "text", w: top(c) ? TOP[c.field!]! : ((1 - ROW_W) * weight(c.field)) / rest }),
    { head: "Review", fmt: "text", w: 0.12 },
  ]
  const at = (i: number) => (i === 0 || i === cols.length - 1 ? true : top(shown[i - 1]))
  // Amount sits at the right of line 1, before Review, as amounts do on a register.
  const amt = cols.findIndex((c) => c.head === AMOUNT.head), first = cols.map((_, i) => i).filter(at)
  const lines: [number[], number[]] = [[...first.filter((i) => i !== amt && i !== cols.length - 1), ...(amt >= 0 ? [amt] : []), cols.length - 1], cols.map((_, i) => i).filter((i) => !at(i))]
  // Total row: the label and count in the first two text columns of line 1, the sum under the amount.
  const foot: Cell[] = ["", ...shown.map((c) => (c.field === "gross_amount" ? total(rows) : "")), ""]
  const free = lines[0].filter((i) => i > 0 && foot[i] === "").slice(0, 2)
  ;[TOTAL, `${rows.length} vouchers`].forEach((v, k) => { if (free[k] !== undefined) foot[free[k]] = v })
  return {
    basis: "Every voucher in scope, by DV date then sheet row; undated vouchers last. All columns shown in the sheet, two lines per voucher.",
    cols, lines, foot,
    rows: list.map((r) => [r.sheet_row, ...shown.map((c) => c.field === "gross_amount" ? r.amount : c.field ? r[c.field] : r.extra?.[c.key] ?? ""), r.issues.map((i) => ISSUES[i]).join(", ") || "OK"]),
    notes: [`Row: the voucher's row number in the sheet, to trace each line to its source. Text is as recorded in the sheet; ${AMOUNT.head} is the gross amount as read.`],
  }
}

const BUILDERS: Record<Exclude<TableKind, `x:${string}`>, (c: Ctx) => Body> = {
  kpi: kpis,
  category: breakdown("Category", (r) => label(r, "category")),
  area: breakdown("Trade area", (r) => label(r, "trade_area")),
  program: breakdown("Diploma / ST / Assessment", (r) => label(r, "diploma_st_assessment")),
  monthly,
  payee: breakdown("Payee", (r) => r.payee.trim() || NOT_SET),
  review,
  audit,
}
const build = (kind: TableKind, c: Ctx): Body =>
  kind.startsWith("x:") ? breakdown(kind.slice(2), (r) => r.extra?.[kind]?.trim() || NOT_SET)(c) : BUILDERS[kind as keyof typeof BUILDERS](c)

/** Who and what the report was drawn from, for the basis of preparation. */
export type Meta = { source: string; pulled: Date | null; generated: Date; by: string }
export const manilaTime = (d: Date) =>
  d.toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" })

/** The last schedule of every report: where the figures come from, what was left out, and whether the totals agree. */
function basisOf(all: Voucher[], scoped: Voucher[], scope: Scope, area: string, tables: Table[], meta: Meta): Table {
  const amt = (rs: Voucher[]) => `${rs.length.toLocaleString("en-US")} voucher${rs.length === 1 ? "" : "s"}, ${peso(total(rs))}`
  const inArea = all.filter((r) => !area || label(r, "trade_area") === area)
  const undated = scope.from ? inArea.filter((r) => !r.month) : []
  const outside = scope.from ? inArea.filter((r) => r.month && !inRange(r, scope.from, scope.to)) : []
  const zero = scoped.filter((r) => !r.amount)
  // Each schedule with an Amount total should equal the vouchers in scope; the exceptions schedule totals a subset.
  const sum = total(scoped)
  const tied = tables.filter((t) => t.kind !== "review" && t.foot && t.cols.some((c) => c.head === AMOUNT.head))
  const off = tied.filter((t) => t.foot![t.cols.findIndex((c) => c.head === AMOUNT.head)] !== sum)
  const lines: [string, string][] = [
    ["Source", `${meta.source || "Google Sheet"}: the gross amount and fields of each voucher, as recorded in the sheet`],
    ["Data as of", meta.pulled ? manilaTime(meta.pulled) : "Not recorded"],
    ["Period", scope.label],
    ["Trade area", area || "All trade areas"],
    ["Vouchers on record", amt(all)],
    ...(area ? [["Other trade areas", amt(all.filter((r) => label(r, "trade_area") !== area))] as [string, string]] : []),
    ...(outside.length ? [["Dated outside the period", amt(outside)] as [string, string]] : []),
    ...(undated.length ? [["Undated, not in any period", amt(undated)] as [string, string]] : []),
    ["Vouchers in scope", amt(scoped)],
    ...(zero.length ? [["Blank or unreadable amount", `${zero.length} in scope, counted as ₱0.00`] as [string, string]] : []),
    ...(tied.length ? [["Reconciliation", off.length
      ? `Does not agree: ${off.map((t) => `Schedule ${t.no}`).join(", ")} differ from the vouchers in scope (${peso(sum)})`
      : `${tied.length === 1 ? `Schedule ${tied[0].no} totals` : `Schedules ${tied.map((t) => t.no).join(", ")} each total`} ${peso(sum)}, agreeing with the vouchers in scope`] as [string, string]] : []),
    ["Rounding", "Averages are rounded to the centavo and percentages to one decimal place, so shares may not add to exactly 100%"],
    ["Generated", `${manilaTime(meta.generated)} by ${meta.by}`],
  ]
  return {
    kind: "basis", title: "Basis of preparation",
    cols: [{ head: "Item", fmt: "text", w: 0.28 }, { head: "Detail", fmt: "text", w: 0.72 }],
    rows: lines, notes: [],
  }
}

/** The report's choices from the URL, every voucher in scope, and its schedules (several for the full report), then the basis. */
export function buildReport(rows: Voucher[], p: URLSearchParams, today: string, columns: Column[], meta: Meta) {
  const kinds = clustersFor(columns).flatMap(([, ks]) => ks)
  const kind: Kind = kinds.includes(p.get("report") as Kind) ? (p.get("report") as Kind) : "summary"
  const has = (f: Field) => columns.some((c) => c.field === f)
  // Generated sections sit after the three fixed breakdowns, so the full report for the current sheet is unchanged.
  const fixed = SUMMARY.filter((k) => kinds.includes(k))
  const at = Math.max(0, ...(["category", "area", "program"] as const).map((k) => fixed.indexOf(k))) + 1
  const summary = [...fixed.slice(0, at), ...extraKinds(columns), ...fixed.slice(at)]
  const scope = readScope(p, months(rows)[0] ?? today.slice(0, 7))
  const area = p.get("area") ?? ""
  const inArea = rows.filter((r) => !area || label(r, "trade_area") === area)
  const scoped = inArea.filter((r) => inRange(r, scope.from, scope.to))
  const prior = scope.prior && inArea.filter((r) => inRange(r, scope.prior!.from, scope.prior!.to))
  const ctx: Ctx = { rows: scoped, prior, scope, month: today.slice(0, 7), has, columns }
  // With no vouchers in scope only the basis prints, so the reader still sees what was left out and why.
  const schedules = (!scoped.length ? [] : kind === "summary" ? summary : [kind as TableKind])
    .map((k, i): Table => ({ kind: k, no: i + 1, cluster: clusterOf(k), title: titleOf(k), ...build(k, ctx) }))
  const tables = [...schedules, basisOf(rows, scoped, scope, area, schedules, meta)]
  return { kind, scope, area, scoped, tables }
}
