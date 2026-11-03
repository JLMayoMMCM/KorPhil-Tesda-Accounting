import { collected, collections, deposited, ENTRY_ISSUES, groupBy, tag, undeposited, type Entry, type EntryIssue } from "@/lib/collection"
import { monthLabel, monthsBack, NOT_SET, peso, shortDate } from "@/lib/ledger"
import { fmtCell, manilaTime, readScope, span, type Cell, type Col, type Fmt, type Meta, type Scope, type Table } from "@/lib/reports"

// The collection reports, in the order of the disbursement reports: key figures, analysis by account (UACS), area and
// nature, then period, payor and deposits, then exceptions, with the cash receipts register as the supporting schedule.
// Schedules print through the same report sheet as the vouchers'.
export const COLLECTION_REPORTS = {
  summary: "Full report",
  kpi: "Key performance indicators",
  uacs: "Collections by UACS code",
  area: "Collections by area",
  nature: "Collections by nature of collection",
  monthly: "Collections and deposits by month",
  payor: "Collections by payor",
  deposits: "Deposits",
  review: "Exceptions for review",
  register: "Cash receipts register",
} as const
export type CollectionKind = keyof typeof COLLECTION_REPORTS
type TableKind = Exclude<CollectionKind, "summary">

export const COLLECTION_CLUSTERS: [string, CollectionKind[]][] = [
  ["Overview", ["summary", "kpi"]],
  ["Analysis of collections", ["uacs", "area", "nature"]],
  ["Period, payor and deposits", ["monthly", "payor", "deposits"]],
  ["Compliance", ["review", "register"]],
]
const clusterOf = (k: CollectionKind) => COLLECTION_CLUSTERS.find(([, ks]) => ks.includes(k))![0]
const SUMMARY: TableKind[] = ["kpi", "uacs", "area", "nature", "monthly", "payor", "deposits", "review", "register"]

const NO: Col = { head: "No.", fmt: "int", w: 0.06 }
const COUNT: Col = { head: "Receipts", fmt: "int", w: 0.1 }
const AMOUNT: Col = { head: "Collected (₱)", fmt: "peso", w: 0.18 }
const AVERAGE: Col = { head: "Average (₱)", fmt: "peso", w: 0.16 }
const SHARE: Col = { head: "% of total", fmt: "pct", w: 0.12 }
const DEPOSIT: Col = { head: "Deposited (₱)", fmt: "peso", w: 0.16 }
const TOTAL = "Total"
const NOT_SET_NOTE = `"${NOT_SET}": the column is blank on the receipt, or holds a placeholder such as "(BLANK)", "-" or "N/A".`
const AREA_NOTE = "Deposits carry no area, so a report for one area shows collections only."

const share = (v: number, of: number) => (of ? v / of : null)
const avg = (amt: number, n: number) => (n ? Math.round(amt / n) : null)
const day = (iso: string) => `${shortDate(iso)}, ${iso.slice(0, 4)}`
/** "2026-09" -> "2026-09-30". */
const lastDay = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10)
const inRange = (e: Entry, from: string, to: string) => !from || (e.month >= from && e.month <= to)

/** rows: entries in scope (collections in the area; deposits too when no area is picked). all: every date, same rule. */
type Ctx = { rows: Entry[]; prior: Entry[] | null; all: Entry[]; scope: Scope; month: string; area: string }
type Body = Omit<Table, "kind" | "title" | "no" | "cluster">

/** No. · label · receipts · collected · average · % of total, then a total row. */
function grouped(head: string, lines: [string, number, number][], rows: Entry[]): Body {
  const sum = collected(rows), n = collections(rows).length
  return {
    cols: [NO, { head, fmt: "text", w: 0.38 }, COUNT, AMOUNT, AVERAGE, SHARE],
    rows: lines.map(([k, c, a], i) => [i + 1, k, c, a, avg(a, c), share(a, sum)]),
    foot: ["", TOTAL, n, sum, avg(sum, n), sum ? 1 : null],
    notes: lines.some(([k]) => k === NOT_SET) ? [NOT_SET_NOTE] : [],
  }
}

const breakdown = (head: string, key: (e: Entry) => string) => ({ rows }: Ctx): Body => {
  const lines = groupBy(rows, key).sort((a, b) => Number(a[0] === NOT_SET) - Number(b[0] === NOT_SET))
  return { ...grouped(head, lines, rows), basis: `Collections in scope, grouped by ${head.toLowerCase()}, largest amount first.` }
}

function kpis({ rows, prior, all, scope, month, area }: Ctx): Body {
  const stats = (es: Entry[], from = scope.from, to = scope.to) => {
    const cs = collections(es), sum = collected(es), n = cs.length
    const amounts = cs.map((e) => e.collected).sort((a, b) => a - b), mid = n >> 1
    const payors = groupBy(es, (e) => tag(e, "payor"))
    const nMonths = from ? Math.max(0, span(from, to < month ? to : month)) : new Set(es.map((e) => e.month)).size
    const flagged = cs.filter((e) => e.issues.length)
    return [
      ["Total collections", "peso", sum],
      ["Number of receipts", "int", n],
      ["Average per receipt", "peso", avg(sum, n)],
      ["Median receipt", "peso", !n ? null : n % 2 ? amounts[mid] : Math.round((amounts[mid - 1] + amounts[mid]) / 2)],
      ["Largest single receipt", "peso", n ? amounts[n - 1] : null],
      ["Average per month", "peso", avg(sum, nMonths)],
      ["Number of payors", "int", payors.length],
      ["Top 5 payors, share of amount", "pct", share(payors.slice(0, 5).reduce((s, p) => s + p[2], 0), sum)],
      ...(area ? [] : [
        ["Total deposits", "peso", deposited(es)],
        ["Collections less deposits", "peso", sum - deposited(es)],
        ["Undeposited at period end", "peso", undeposited(all, to ? lastDay(to) : undefined)],
      ]),
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
    basis: before ? `Entries in scope, against ${scope.prior!.label.replace(/^For the /, "the ")}.` : "Entries in scope. No prior period is compared for all dates.",
    cols: before
      ? [{ head: "Indicator", fmt: "text", w: 0.4 }, { head: "This period", fmt: "figure", w: 0.21 }, { head: "Prior period", fmt: "figure", w: 0.21 }, { head: "Change", fmt: "figure", w: 0.18 }]
      : [{ head: "Indicator", fmt: "text", w: 0.6 }, { head: "Value", fmt: "figure", w: 0.4 }],
    rows: now.map(([k, fmt, v], i) => before ? [k, show(v, fmt), show(before[i][2], fmt), change(v, before[i][2], fmt)] : [k, show(v, fmt)]),
    notes: [
      "Median: the middle receipt amount. Average per month: total over the months of the period that have begun.",
      ...(area ? [AREA_NOTE] : ["Undeposited at period end: every collection less every deposit up to the last day of the period, whatever its start."]),
      "Exception rate: receipts failing at least one review check (Schedule \"Exceptions for review\"), over all receipts.",
      ...(before ? ["Change: percent change for amounts and counts; pp (percentage points) for shares. Left blank where the prior figure is zero or below."] : []),
    ],
  }
}

/** Every month in the period, oldest first, zero months included; deposits and the undeposited balance at each month end. */
function monthly({ rows, all, scope, area }: Ctx): Body {
  const ms = scope.from
    ? Array.from({ length: span(scope.from, scope.to) }, (_, i) => monthsBack(scope.to, span(scope.from, scope.to) - 1 - i))
    : [...new Set(rows.map((e) => e.month))].sort()
  const cols: Col[] = [{ head: "Month", fmt: "text", w: 0.2 }, { ...COUNT, w: 0.12 }, AMOUNT, ...(area ? [SHARE] : [DEPOSIT, { head: "Undeposited, month end (₱)", fmt: "peso", w: 0.2 } as Col])]
  let balance = area || !ms.length ? 0 : undeposited(all, lastDay(monthsBack(ms[0], 1)))
  const sum = collected(rows)
  const lines = ms.map((m): Cell[] => {
    const es = rows.filter((e) => e.month === m), c = collected(es), d = deposited(es)
    balance += c - d
    return [monthLabel(m), collections(es).length, c, ...(area ? [share(c, sum)] : [d, balance])]
  })
  return {
    basis: `Entries in scope by month of date, oldest first. Months with none are shown as zero.${area ? "" : " The undeposited balance carries forward from before the period."}`,
    cols, rows: lines,
    foot: [TOTAL, collections(rows).length, sum, ...(area ? [sum ? 1 : null] : [deposited(rows), balance])],
    notes: area ? [AREA_NOTE] : ["Undeposited, month end: collections less deposits from the first entry on record through the month's last day."],
  }
}

function depositList({ rows, area }: Ctx): Body {
  const list = rows.filter((e) => e.kind === "deposit").sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : a.sheet_row - b.sheet_row))
  return {
    basis: "Deposits in scope, by date then sheet row.",
    cols: [NO, { head: "Date", fmt: "text", w: 0.18 }, { head: "Row", fmt: "int", w: 0.08 }, { head: "Description", fmt: "text", w: 0.46 }, { ...DEPOSIT, w: 0.22 }],
    rows: list.map((e, i) => [i + 1, day(e.iso), e.sheet_row, [e.payor, e.nature].filter((t) => t.trim()).join(" · ") || "—", e.deposited]),
    foot: ["", TOTAL, null, `${list.length} deposit${list.length === 1 ? "" : "s"}`, deposited(list)],
    notes: [
      ...(area ? [AREA_NOTE] : []),
      "A deposit row left undated in the sheet is placed on the date of the row above it.",
    ],
  }
}

function review({ rows }: Ctx): Body {
  const cs = collections(rows), flagged = cs.filter((e) => e.issues.length), n = cs.length
  const by = (Object.keys(ENTRY_ISSUES) as EntryIssue[]).map((i): [EntryIssue, Entry[]] => [i, flagged.filter((e) => e.issues.includes(i))]).filter(([, l]) => l.length)
  return {
    basis: "Receipts in scope that fail one or more review checks, by check.",
    cols: [NO, { head: "Check", fmt: "text", w: 0.38 }, { ...COUNT, w: 0.12 }, { ...AMOUNT, w: 0.22 }, { head: "% of receipts", fmt: "pct", w: 0.22 }],
    rows: by.map(([i, list], k) => [k + 1, ENTRY_ISSUES[i], list.length, collected(list), share(list.length, n)]),
    foot: ["", "Receipts with at least one exception", flagged.length, collected(flagged), share(flagged.length, n)],
    notes: [
      "A receipt can fail more than one check, so the lines can add up to more than the total.",
      "Checks: OR # blank, or the same OR # on more than one receipt; UACS code blank; area blank. Deposits are not checked.",
    ],
  }
}

/** Every entry in scope by date, traceable to its sheet row, in three zones: row, date, OR #; payor and nature; amounts and review. */
function register({ rows }: Ctx): Body {
  const list = [...rows].sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : a.sheet_row - b.sheet_row))
  const cols: Col[] = [
    { head: "Row", fmt: "int", w: 0 }, { head: "Date", fmt: "text", w: 0 }, { head: "OR #", fmt: "text", w: 0 },
    { head: "Payor", fmt: "text", w: 0 }, { head: "Nature of collection", fmt: "text", w: 0 },
    { head: "UACS code", fmt: "text", w: 0 }, { head: "Area", fmt: "text", w: 0 },
    { ...AMOUNT, w: 0 }, { ...DEPOSIT, w: 0 }, { head: "Review", fmt: "text", w: 0 },
  ]
  return {
    basis: "Every receipt and deposit in scope, by date then sheet row, one block per entry.",
    cols, zones: { left: [0, 1, 2], main: [3, 4], tags: [5, 6], named: [], right: [7, 8, 9] },
    rows: list.map((e) => [
      e.sheet_row, day(e.iso), e.or_no, e.payor, e.nature, e.uacs, e.area,
      e.kind === "collection" ? e.collected : null, e.kind === "deposit" ? e.deposited : null,
      e.kind === "deposit" ? "Deposit" : e.issues.map((i) => ENTRY_ISSUES[i]).join(", ") || "OK",
    ]),
    foot: ["", "", "", TOTAL, `${list.length} entries`, "", "", collected(list), deposited(list), ""],
    notes: ["Row: the entry's row number in the sheet, to trace each line to its source. Text is as recorded in the sheet."],
  }
}

const BUILDERS: Record<TableKind, (c: Ctx) => Body> = {
  kpi: kpis,
  uacs: breakdown("UACS code", (e) => tag(e, "uacs")),
  area: breakdown("Area", (e) => tag(e, "area")),
  nature: breakdown("Nature of collection", (e) => tag(e, "nature")),
  monthly,
  payor: breakdown("Payor", (e) => tag(e, "payor")),
  deposits: depositList,
  review,
  register,
}

/** Where the figures come from, what was left out, and whether the totals agree. */
function basisOf(entries: Entry[], scoped: Entry[], scope: Scope, area: string, tables: Table[], meta: Meta, skipped: number): Table {
  const amt = (es: Entry[]) => {
    const cs = collections(es), ds = es.length - cs.length
    return `${cs.length.toLocaleString("en-US")} receipt${cs.length === 1 ? "" : "s"}, ${peso(collected(es))}` +
      (ds ? `; ${ds.toLocaleString("en-US")} deposit${ds === 1 ? "" : "s"}, ${peso(deposited(es))}` : "")
  }
  const inArea = entries.filter((e) => !area || (e.kind === "collection" && tag(e, "area") === area))
  const outside = scope.from ? inArea.filter((e) => !inRange(e, scope.from, scope.to)) : []
  const sum = collected(scoped)
  const tied = tables.filter((t) => t.kind !== "review" && t.foot && t.cols.some((c) => c.head === AMOUNT.head))
  const off = tied.filter((t) => t.foot![t.cols.findIndex((c) => c.head === AMOUNT.head)] !== sum)
  const lines: [string, string][] = [
    ["Source", `${meta.source || "Google Sheet"}: each receipt and deposit as recorded in the Collection tab`],
    ["Data as of", meta.pulled ? manilaTime(meta.pulled) : "Not recorded"],
    ["Period", scope.label],
    ["Area", area ? `${area}. ${AREA_NOTE}` : "All areas"],
    ["Entries on record", amt(entries)],
    ...(outside.length ? [["Dated outside the period", amt(outside)] as [string, string]] : []),
    ["Entries in scope", amt(scoped)],
    ...(skipped ? [["Rows not read", `${skipped} row${skipped === 1 ? "" : "s"} with no date or no amount (totals, cancelled receipts); listed on Settings`] as [string, string]] : []),
    ...(tied.length ? [["Reconciliation", off.length
      ? `Does not agree: ${off.map((t) => `Schedule ${t.no}`).join(", ")} differ from the collections in scope (${peso(sum)})`
      : `${tied.length === 1 ? `Schedule ${tied[0].no} totals` : `Schedules ${tied.map((t) => t.no).join(", ")} each total`} ${peso(sum)}, agreeing with the collections in scope`] as [string, string]] : []),
    ["Rounding", "Averages are rounded to the centavo and percentages to one decimal place, so shares may not add to exactly 100%"],
    ["Generated", `${manilaTime(meta.generated)} by ${meta.by}`],
  ]
  return { kind: "basis", title: "Basis of preparation", cols: [{ head: "Item", fmt: "text", w: 0.28 }, { head: "Detail", fmt: "text", w: 0.72 }], rows: lines, notes: [] }
}

export const collectionTitle = (k: CollectionKind) => COLLECTION_REPORTS[k]

/** The report's choices from the URL (report, period, area), the entries in scope, and its schedules, then the basis. */
export function buildCollectionReport(entries: Entry[], p: URLSearchParams, today: string, meta: Meta, skipped = 0) {
  const kind: CollectionKind = (p.get("report") ?? "") in COLLECTION_REPORTS ? (p.get("report") as CollectionKind) : "summary"
  const newest = entries[0]?.month ?? today.slice(0, 7)
  const scope = readScope(p, newest)
  const area = p.get("area") ?? ""
  const all = entries.filter((e) => !area || (e.kind === "collection" && tag(e, "area") === area))
  const scoped = all.filter((e) => inRange(e, scope.from, scope.to))
  const prior = scope.prior && all.filter((e) => inRange(e, scope.prior!.from, scope.prior!.to))
  const ctx: Ctx = { rows: scoped, prior, all, scope, month: today.slice(0, 7), area }
  const schedules = (!scoped.length ? [] : kind === "summary" ? SUMMARY : [kind as TableKind])
    .map((k, i): Table => ({ kind: k, no: i + 1, cluster: clusterOf(k), title: COLLECTION_REPORTS[k], ...BUILDERS[k](ctx) }))
  return { kind, scope, area, scoped, tables: [...schedules, basisOf(entries, scoped, scope, area, schedules, meta, skipped)] }
}
