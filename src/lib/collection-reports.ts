import { COLLECTION_LABELS, collected, ENTRY_ISSUES, groupBy, tag, type CollectionField, type Entry, type EntryIssue } from "@/lib/collection"
import { monthLabel, monthsBack, NOT_SET, peso, shortDate } from "@/lib/ledger"
import { fmtCell, manilaTime, readScope, span, type Cell, type Col, type Fmt, type Meta, type Scope, type Table } from "@/lib/reports"
import type { Column } from "@/lib/sheet-config"

// The collection reports, in the order of the disbursement reports: key figures, analysis by account (UACS), area and
// nature, then period and payor, then exceptions, with the cash receipts register as the supporting schedule.
// Schedules print through the same report sheet as the vouchers'.
export const COLLECTION_REPORTS = {
  summary: "Full report",
  kpi: "Key performance indicators",
  uacs: "Collections by UACS code",
  area: "Collections by area",
  nature: "Collections by nature of collection",
  monthly: "Collections by month",
  payor: "Collections by payor",
  review: "Exceptions for review",
  register: "Cash receipts register",
} as const
export type CollectionKind = keyof typeof COLLECTION_REPORTS
type TableKind = Exclude<CollectionKind, "summary">

export const COLLECTION_CLUSTERS: [string, CollectionKind[]][] = [
  ["Overview", ["summary", "kpi"]],
  ["Analysis of collections", ["uacs", "area", "nature"]],
  ["Period and payor", ["monthly", "payor"]],
  ["Compliance", ["review", "register"]],
]
const clusterOf = (k: CollectionKind) => COLLECTION_CLUSTERS.find(([, ks]) => ks.includes(k))![0]
const SUMMARY: TableKind[] = ["kpi", "uacs", "area", "nature", "monthly", "payor", "review", "register"]

const NO: Col = { head: "No.", fmt: "int", w: 0.06 }
const COUNT: Col = { head: "Receipts", fmt: "int", w: 0.1 }
const AMOUNT: Col = { head: "Collected (₱)", fmt: "peso", w: 0.18 }
const AVERAGE: Col = { head: "Average (₱)", fmt: "peso", w: 0.16 }
const SHARE: Col = { head: "% of total", fmt: "pct", w: 0.12 }
const TOTAL = "Total"

const share = (v: number, of: number) => (of ? v / of : null)
const avg = (amt: number, n: number) => (n ? Math.round(amt / n) : null)
const day = (iso: string) => `${shortDate(iso)}, ${iso.slice(0, 4)}`
const inRange = (e: Entry, from: string, to: string) => !from || (e.month >= from && e.month <= to)

/** rows: receipts in scope (in the area, when one is picked). columns: the tab's columns in sheet order. */
type Ctx = { rows: Entry[]; prior: Entry[] | null; scope: Scope; month: string; columns: Column<CollectionField>[] }
type Body = Omit<Table, "kind" | "title" | "no" | "cluster">

/** No. · label · receipts · collected · average · % of total, then a total row. */
function grouped(head: string, lines: [string, number, number][], rows: Entry[]): Body {
  const sum = collected(rows), n = rows.length
  return {
    cols: [NO, { head, fmt: "text", w: 0.38 }, COUNT, AMOUNT, AVERAGE, SHARE],
    rows: lines.map(([k, c, a], i) => [i + 1, k, c, a, avg(a, c), share(a, sum)]),
    foot: ["", TOTAL, n, sum, avg(sum, n), sum ? 1 : null],
  }
}

const breakdown = (head: string, key: (e: Entry) => string) => ({ rows }: Ctx): Body => {
  const lines = groupBy(rows, key).sort((a, b) => Number(a[0] === NOT_SET) - Number(b[0] === NOT_SET))
  return grouped(head, lines, rows)
}

function kpis({ rows, prior, scope, month }: Ctx): Body {
  const stats = (es: Entry[], from = scope.from, to = scope.to) => {
    const sum = collected(es), n = es.length
    const amounts = es.map((e) => e.collected).sort((a, b) => a - b), mid = n >> 1
    const payors = groupBy(es, (e) => tag(e, "payor"))
    const nMonths = from ? Math.max(0, span(from, to < month ? to : month)) : new Set(es.map((e) => e.month)).size
    const flagged = es.filter((e) => e.issues.length)
    return [
      ["Total collections", "peso", sum],
      ["Number of receipts", "int", n],
      ["Average per receipt", "peso", avg(sum, n)],
      ["Median receipt", "peso", !n ? null : n % 2 ? amounts[mid] : Math.round((amounts[mid - 1] + amounts[mid]) / 2)],
      ["Largest single receipt", "peso", n ? amounts[n - 1] : null],
      ["Average per month", "peso", avg(sum, nMonths)],
      ["Number of payors", "int", payors.length],
      ["Top 5 payors, share of amount", "pct", share(payors.slice(0, 5).reduce((s, p) => s + p[2], 0), sum)],
      ["Exception rate (receipts for review)", "pct", share(flagged.length, n)],
      ["Amount under exception", "peso", collected(flagged)],
    ] as [string, Fmt, number | null][]
  }
  const now = stats(rows), before = prior && stats(prior, scope.prior!.from, scope.prior!.to)
  const change = (a: number | null, b: number | null, fmt: Fmt) => {
    if (a === null || b === null) return null
    if (fmt === "pct") return `${a >= b ? "+" : "−"}${(Math.abs(a - b) * 100).toFixed(1)} pp`
    return b > 0 && a >= 0 ? `${a >= b ? "+" : "−"}${(Math.abs(a / b - 1) * 100).toFixed(1)}%` : null
  }
  const show = (v: number | null, fmt: Fmt) => (fmt === "peso" && v !== null ? peso(v) : fmtCell(v, fmt))
  return {
    cols: before
      ? [{ head: "Indicator", fmt: "text", w: 0.4 }, { head: "This period", fmt: "figure", w: 0.21 }, { head: "Prior period", fmt: "figure", w: 0.21 }, { head: "Change", fmt: "figure", w: 0.18 }]
      : [{ head: "Indicator", fmt: "text", w: 0.6 }, { head: "Value", fmt: "figure", w: 0.4 }],
    rows: now.map(([k, fmt, v], i) => before ? [k, show(v, fmt), show(before[i][2], fmt), change(v, before[i][2], fmt)] : [k, show(v, fmt)]),
  }
}

/** Every month in the period, oldest first, zero months included, with its share of the total. */
function monthly({ rows, scope }: Ctx): Body {
  const ms = scope.from
    ? Array.from({ length: span(scope.from, scope.to) }, (_, i) => monthsBack(scope.to, span(scope.from, scope.to) - 1 - i))
    : [...new Set(rows.map((e) => e.month))].sort()
  const cols: Col[] = [{ head: "Month", fmt: "text", w: 0.3 }, { ...COUNT, w: 0.16 }, { ...AMOUNT, w: 0.3 }, { ...SHARE, w: 0.24 }]
  const sum = collected(rows)
  const lines = ms.map((m): Cell[] => {
    const es = rows.filter((e) => e.month === m), c = collected(es)
    return [monthLabel(m), es.length, c, share(c, sum)]
  })
  return {
    cols, rows: lines,
    foot: [TOTAL, rows.length, sum, sum ? 1 : null],
  }
}

function review({ rows }: Ctx): Body {
  const flagged = rows.filter((e) => e.issues.length), n = rows.length
  const by = (Object.keys(ENTRY_ISSUES) as EntryIssue[]).map((i): [EntryIssue, Entry[]] => [i, flagged.filter((e) => e.issues.includes(i))]).filter(([, l]) => l.length)
  return {
    cols: [NO, { head: "Check", fmt: "text", w: 0.38 }, { ...COUNT, w: 0.12 }, { ...AMOUNT, w: 0.22 }, { head: "% of receipts", fmt: "pct", w: 0.22 }],
    rows: by.map(([i, list], k) => [k + 1, ENTRY_ISSUES[i], list.length, collected(list), share(list.length, n)]),
    foot: ["", "Receipts with at least one exception", flagged.length, collected(flagged), share(flagged.length, n)],
  }
}

// Register zones by role: identifiers on the left, payor and nature in the middle, account and area as tags, the amount
// on the right. Extra columns print as named values.
const LEFT: CollectionField[] = ["date", "or_no"], MAIN: CollectionField[] = ["payor", "nature"], TAGS: CollectionField[] = ["uacs", "area"]

/**
 * Every entry in scope by date, traceable to its sheet row, with every column the tab shows (labels are the sheet's
 * own headers), in zones: row, date, OR #; payor and nature; UACS and area; extras by name; amount and review.
 */
function register({ rows, columns }: Ctx): Body {
  const list = [...rows].sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : a.sheet_row - b.sheet_row))
  // Without a model (no columns passed), the known fields in their usual order.
  const shown = columns.length ? columns.filter((c) => c.visibility !== "hidden")
    : (Object.keys(COLLECTION_LABELS) as CollectionField[]).map((f) => ({ key: f, field: f, label: COLLECTION_LABELS[f] }))
  const cols: Col[] = [
    { head: "Row", fmt: "int", w: 0 },
    ...shown.map((c): Col => (c.field === "collection" ? { ...AMOUNT, w: 0 } : { head: c.label, fmt: "text", w: 0 })),
    { head: "Review", fmt: "text", w: 0 },
  ]
  const review = cols.length - 1
  const of = (fs: CollectionField[]) => fs.flatMap((f) => shown.flatMap((c, i) => (c.field === f ? [i + 1] : [])))
  const zones = {
    left: [0, ...of(LEFT)], main: of(MAIN), tags: of(TAGS), right: [...of(["collection"]), review],
    named: shown.flatMap((c, i) => (c.field ? [] : [i + 1])),
  }
  const value = (e: Entry, c: { key: string; field: CollectionField | null }): Cell =>
    c.field === "collection" ? e.collected : c.field === "date" ? day(e.iso) : c.field ? e[c.field] : e.extra[c.key] ?? ""
  // Total row: the label and count where payor and nature print, the sum under the amount.
  const foot: Cell[] = ["", ...shown.map((c) => (c.field === "collection" ? collected(list) : "")), ""]
  const free = zones.main.length ? zones.main : zones.left.slice(1)
  ;[TOTAL, `${list.length} receipts`].forEach((v, k) => { if (free[k] !== undefined) foot[free[k]] = v })
  return {
    cols, zones, foot,
    rows: list.map((e) => [e.sheet_row, ...shown.map((c) => value(e, c)), e.issues.map((i) => ENTRY_ISSUES[i]).join(", ") || "OK"]),
  }
}

const BUILDERS: Record<TableKind, (c: Ctx) => Body> = {
  kpi: kpis,
  uacs: breakdown("UACS code", (e) => tag(e, "uacs")),
  area: breakdown("Area", (e) => tag(e, "area")),
  nature: breakdown("Nature of collection", (e) => tag(e, "nature")),
  monthly,
  payor: breakdown("Payor", (e) => tag(e, "payor")),
  review,
  register,
}

/** Where the figures come from, what was left out, and whether the totals agree. */
function basisOf(entries: Entry[], scoped: Entry[], scope: Scope, area: string, tables: Table[], meta: Meta, skipped: number): Table {
  const amt = (es: Entry[]) => `${es.length.toLocaleString("en-US")} receipt${es.length === 1 ? "" : "s"}, ${peso(collected(es))}`
  const inArea = entries.filter((e) => !area || tag(e, "area") === area)
  const outside = scope.from ? inArea.filter((e) => !inRange(e, scope.from, scope.to)) : []
  const sum = collected(scoped)
  const tied = tables.filter((t) => t.kind !== "review" && t.foot && t.cols.some((c) => c.head === AMOUNT.head))
  const off = tied.filter((t) => t.foot![t.cols.findIndex((c) => c.head === AMOUNT.head)] !== sum)
  const lines: [string, string][] = [
    ["Source", `${meta.source || "Google Sheet"}: each receipt as recorded in the Collection tab; deposits are not counted`],
    ["Data as of", meta.pulled ? manilaTime(meta.pulled) : "Not recorded"],
    ["Period", scope.label],
    ["Area", area || "All areas"],
    ["Receipts on record", amt(entries)],
    ...(outside.length ? [["Dated outside the period", amt(outside)] as [string, string]] : []),
    ["Receipts in scope", amt(scoped)],
    ...(skipped ? [["Rows not read", `${skipped} row${skipped === 1 ? "" : "s"} with no date or no amount (totals, cancelled receipts); listed on Settings`] as [string, string]] : []),
    ...(tied.length ? [["Reconciliation", off.length
      ? `Does not agree: ${off.map((t) => `Schedule ${t.no}`).join(", ")} differ from the collections in scope (${peso(sum)})`
      : `${tied.length === 1 ? `Schedule ${tied[0].no} totals` : `Schedules ${tied.map((t) => t.no).join(", ")} each total`} ${peso(sum)}, agreeing with the collections in scope`] as [string, string]] : []),
    ["Rounding", "Averages are rounded to the centavo and percentages to one decimal place, so shares may not add to exactly 100%"],
    ["Generated", `${manilaTime(meta.generated)} by ${meta.by}`],
  ]
  return { kind: "basis", title: "Basis of preparation", cols: [{ head: "Item", fmt: "text", w: 0.28 }, { head: "Detail", fmt: "text", w: 0.72 }], rows: lines }
}

export const collectionTitle = (k: CollectionKind) => COLLECTION_REPORTS[k]

/** The report's choices from the URL (report, period, area), the entries in scope, and its schedules, then the basis. */
export function buildCollectionReport(entries: Entry[], p: URLSearchParams, today: string, meta: Meta, skipped = 0, columns: Column<CollectionField>[] = []) {
  const kind: CollectionKind = (p.get("report") ?? "") in COLLECTION_REPORTS ? (p.get("report") as CollectionKind) : "summary"
  const newest = entries[0]?.month ?? today.slice(0, 7)
  const scope = readScope(p, newest)
  const area = p.get("area") ?? ""
  const all = entries.filter((e) => !area || tag(e, "area") === area)
  const scoped = all.filter((e) => inRange(e, scope.from, scope.to))
  const prior = scope.prior && all.filter((e) => inRange(e, scope.prior!.from, scope.prior!.to))
  const ctx: Ctx = { rows: scoped, prior, scope, month: today.slice(0, 7), columns }
  const schedules = (!scoped.length ? [] : kind === "summary" ? SUMMARY : [kind as TableKind])
    .map((k, i): Table => ({ kind: k, no: i + 1, cluster: clusterOf(k), title: COLLECTION_REPORTS[k], ...BUILDERS[k](ctx) }))
  return { kind, scope, area, scoped, tables: [...schedules, basisOf(entries, scoped, scope, area, schedules, meta, skipped)] }
}
