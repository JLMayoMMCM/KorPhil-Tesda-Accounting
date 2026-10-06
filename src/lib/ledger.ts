// Derived voucher facts: parsed amounts/dates, review checks, group totals. Pure functions, no imports.
// Money is integer centavos; dates are ISO "YYYY-MM-DD" strings (compare and sort as text).

// The EXP tab's columns, in sheet order (see sheets.ts).
export const FIELD_LABELS = {
  dv_date: "DV date",
  dv_no: "DV #",
  payee: "Payee",
  particulars: "Particulars",
  gross_amount: "Gross amount",
  check_number: "Check #",
  trade_area: "Trade area",
  diploma_st_assessment: "Diploma / ST / Assessment",
  category: "Category",
  status: "Status",
} as const
export type Field = keyof typeof FIELD_LABELS
export const FIELDS = Object.keys(FIELD_LABELS) as Field[]

// Column L: anything but "Verified" (blank included) counts as for review.
export const VERIFIED = "Verified"
export const FOR_REVIEW = "For Review"
export const isVerified = (r: RawVoucher) => r.status.trim().toLowerCase() === VERIFIED.toLowerCase()

// Review checks: gaps an auditor would ask about, in the order the Workspace lists them.
export const ISSUES = {
  no_dv: "No DV #",
  duplicate_dv: "Duplicate DV #",
  no_date: "No DV date",
  no_amount: "No amount",
  no_check: "No check #",
  no_area: "No trade area",
} as const
export type Issue = keyof typeof ISSUES

export const TABS = {
  all: "All",
  review: "Needs review",
  pending: "For review",
  verified: "Verified",
} as const
export type Tab = keyof typeof TABS

export const NOT_SET = "Not set"

export type RawVoucher = Record<Field, string> & { sheet_row: number }
export type Voucher = RawVoucher & {
  amount: number // centavos
  dv: string | null
  issues: Issue[]
  month: string // "YYYY-MM" of the DV date, "" if none
}

const pad = (n: number) => String(n).padStart(2, "0")

/** "9/3/2026" or the EXP tab's "09-03-26" -> "2026-09-03", or null. */
export function parseDate(value: string | undefined | null): string | null {
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})$/.exec((value ?? "").trim())
  if (!m) return null
  const [mo, d, y] = [Number(m[1]), Number(m[2]), Number(m[3].length === 2 ? "20" + m[3] : m[3])]
  const date = new Date(Date.UTC(y, mo - 1, d))
  if (date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null // 2/30 etc.
  return `${y}-${pad(mo)}-${pad(d)}`
}

/** "2026-09-03" -> "9/3/2026", which the sheet reads as a date. */
export function sheetDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number)
  return `${m}/${d}/${y}`
}

/** Sheets date serial (days since 1899-12-30) -> "9/3/2026". */
export const serialDate = (serial: number) =>
  sheetDate(new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000).toISOString().slice(0, 10))

/** "₱ 89,021.00" -> 8902100 centavos; "" -> 0; not a number -> null. */
export function parseAmount(value: string | undefined | null): number | null {
  const s = (value ?? "").replaceAll(",", "").replaceAll("₱", "").trim() || "0"
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return null
  return Math.round(Number(s) * 100)
}

/** 8902100 -> "₱89,021.00"; negatives as "−₱…". */
export function peso(centavos: number): string {
  const text = (Math.abs(centavos) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${centavos < 0 ? "−" : ""}₱${text}`
}

/** Today's date in Manila, where the office is (servers run in UTC). */
export function todayManila(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" })
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

/** "2026-09" -> "Sep 2026"; "" -> "All months". */
export function monthLabel(month: string): string {
  if (!month) return "All months"
  const [y, m] = month.split("-").map(Number)
  return `${MONTHS[m - 1]} ${y}`
}
export const longMonth = (iso: string) => LONG_MONTHS[Number(iso.slice(5, 7)) - 1]
/** "2026-09-29" -> "Sep 29". */
export const shortDate = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`
/** "2026-09-05" -> "September 05, 2026". */
export const longDate = (iso: string) => `${longMonth(iso)} ${iso.slice(8, 10)}, ${iso.slice(0, 4)}`

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** Parse each row and run the review checks. Newest DV date first; undated rows last. */
export function enrich(rows: RawVoucher[]): Voucher[] {
  const seen = new Map<string, number>()
  for (const r of rows) if (r.dv_no.trim()) seen.set(r.dv_no.trim(), (seen.get(r.dv_no.trim()) ?? 0) + 1)
  const out = rows.map((raw): Voucher => {
    const parsed = parseAmount(raw.gross_amount)
    const dv = parseDate(raw.dv_date)
    const checks: [Issue, boolean][] = [
      ["no_dv", !raw.dv_no.trim()],
      ["duplicate_dv", (seen.get(raw.dv_no.trim()) ?? 0) > 1],
      ["no_date", !dv],
      ["no_amount", !parsed],
      ["no_check", !raw.check_number.trim()],
      ["no_area", !raw.trade_area.trim()],
    ]
    // A verified row has had its blanks signed off; only a duplicate DV # still flags it.
    const verified = isVerified(raw)
    const issues = checks.filter(([issue, hit]) => hit && (!verified || issue === "duplicate_dv")).map(([issue]) => issue)
    return { ...raw, amount: parsed ?? 0, dv, issues, month: dv ? dv.slice(0, 7) : "" }
  })
  return out.sort((a, b) => cmp(b.dv ?? "", a.dv ?? "") || b.sheet_row - a.sheet_row)
}

export function inTab(r: Voucher, tab: string): boolean {
  if (tab === "review") return r.issues.length > 0
  if (tab === "pending") return !isVerified(r)
  if (tab === "verified") return isVerified(r)
  return true
}

export const total = (rows: Iterable<Voucher>) => {
  let sum = 0
  for (const r of rows) sum += r.amount
  return sum
}

/** Middle amount (mean of the two middle ones for an even count); 0 for none. */
export function median(rows: Voucher[]): number {
  const a = rows.map((r) => r.amount).sort((x, y) => x - y), mid = a.length >> 1
  return !a.length ? 0 : a.length % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2)
}

/** "2026-09" shifted back n months -> "2026-06". */
export const monthsBack = (m: string, n: number) => {
  const [y, mo] = m.split("-").map(Number)
  return new Date(Date.UTC(y, mo - 1 - n, 1)).toISOString().slice(0, 7)
}

/** Rows dated January through month "MM" of a year: the year-to-date window both years compare on. */
export const yearThrough = (rows: Voucher[], year: number, mm: string) =>
  rows.filter((r) => r.month >= `${year}-01` && r.month <= `${year}-${mm}`)

export const label = (r: Voucher, field: Field) => r[field].trim() || NOT_SET

/** [label, count, amount] for key(row), largest amount first. */
export function group(rows: Voucher[], key: (r: Voucher) => string): [string, number, number][] {
  const out = new Map<string, [number, number]>()
  for (const r of rows) {
    const [n, amt] = out.get(key(r)) ?? [0, 0]
    out.set(key(r), [n + 1, amt + r.amount])
  }
  return [...out].map(([k, [n, a]]): [string, number, number] => [k, n, a]).sort((a, b) => b[2] - a[2])
}

/** [issue, rows] for every check that flags at least one row, in ISSUES order. A row can sit under several. */
export function byIssue(rows: Voucher[]): [Issue, Voucher[]][] {
  return (Object.keys(ISSUES) as Issue[])
    .map((i): [Issue, Voucher[]] => [i, rows.filter((r) => r.issues.includes(i))])
    .filter(([, list]) => list.length)
}

/** Distinct labels for a field, "Not set" last. */
export function values(rows: Voucher[], field: Field): string[] {
  const all = new Set(rows.map((r) => label(r, field)))
  const found = [...all].filter((v) => v !== NOT_SET).sort(cmp)
  return all.has(NOT_SET) ? [...found, NOT_SET] : found
}

export const months = (rows: Voucher[]) =>
  [...new Set(rows.map((r) => r.month).filter(Boolean))].sort().reverse()

/** Rows matching the voucher-list query params (tab, area, month, year, issue — also "none" / "any" — q, sel). */
export function filterRows(rows: Voucher[], params: URLSearchParams): Voucher[] {
  const tab = params.get("tab") ?? "all"
  const q = (params.get("q") ?? "").trim().toLowerCase()
  const only = new Set(params.getAll("sel"))
  const area = params.get("area")
  const month = params.get("month")
  const year = params.get("year")
  const issue = params.get("issue")
  return rows.filter((r) =>
    inTab(r, tab) &&
    (!area || label(r, "trade_area") === area) &&
    (!month || r.month === month) &&
    (!year || r.month.startsWith(year + "-")) &&
    (!issue || (issue === "none" ? !r.issues.length : issue === "any" ? r.issues.length > 0 : r.issues.includes(issue as Issue))) &&
    (!q || `${r.dv_no} ${r.payee} ${r.particulars} ${r.check_number}`.toLowerCase().includes(q)) &&
    (!only.size || only.has(String(r.sheet_row))),
  )
}

/** Copy of params with changes applied (null/"" removes a key), as "?a=b" (or "?" when empty). */
export function qs(params: URLSearchParams, changes: Record<string, string | null | undefined> = {}): string {
  const q = new URLSearchParams(params)
  for (const [key, value] of Object.entries(changes)) {
    q.delete(key)
    if (value) q.set(key, value)
  }
  const s = q.toString()
  return s ? `?${s}` : "?"
}

/** Next's searchParams object -> URLSearchParams. */
export function toParams(sp: Record<string, string | string[] | undefined>): URLSearchParams {
  const q = new URLSearchParams()
  for (const [key, value] of Object.entries(sp)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) q.append(key, v)
  }
  return q
}
