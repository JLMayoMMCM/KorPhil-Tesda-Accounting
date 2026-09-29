// Derived voucher facts: parsed amounts/dates, urgency buckets, group totals. Pure functions, no imports.
// Money is integer centavos; dates are ISO "YYYY-MM-DD" strings (compare and sort as text).

export const FIELD_LABELS = {
  dv_date: "DV date",
  due_date: "Due date",
  dv_no: "DV #",
  payee: "Payee",
  particulars: "Particulars",
  gross_amount: "Gross amount",
  trade_area: "Trade area",
  diploma_st_assessment: "Diploma / ST / Assessment",
  category: "Category",
  status: "Status",
} as const
export type Field = keyof typeof FIELD_LABELS
export const FIELDS = Object.keys(FIELD_LABELS) as Field[]

// Urgency buckets, most urgent first. "week" means due tomorrow through six days out.
export const BUCKETS = {
  late30: "30+ days late",
  late: "1–30 days late",
  today: "Due today",
  week: "Due this week",
  later: "Not yet due",
  paid: "Paid",
} as const
export type Bucket = keyof typeof BUCKETS

export const TABS = {
  all: "All",
  unpaid: "Unpaid",
  overdue: "Overdue",
  week: "Due this week",
  paid: "Paid",
} as const
export type Tab = keyof typeof TABS

export const STATUSES = ["PENDING", "OVERDUE", "PAID"] as const
export const STATE_LABELS = { overdue: "Overdue", pending: "Pending", paid: "Paid" } as const
export type State = keyof typeof STATE_LABELS
export const NOT_SET = "Not set"

export type RawVoucher = Record<Field, string> & { sheet_row: number }
export type Voucher = RawVoucher & {
  amount: number // centavos
  dv: string | null
  due: string | null
  days_late: number
  state: State
  bucket: Bucket
  month: string // "YYYY-MM" of the DV date, "" if none
}

const pad = (n: number) => String(n).padStart(2, "0")
const DAY = 86_400_000
const utc = (iso: string) => Date.parse(iso + "T00:00:00Z")
export const addDays = (iso: string, n: number) => new Date(utc(iso) + n * DAY).toISOString().slice(0, 10)

/** "9/3/2026" (the sheet's format) -> "2026-09-03", or null. */
export function parseDate(value: string | undefined | null): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((value ?? "").trim())
  if (!m) return null
  const [mo, d, y] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(Date.UTC(y, mo - 1, d))
  if (date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null // 2/30 etc.
  return `${y}-${pad(mo)}-${pad(d)}`
}

/** "2026-09-03" -> the sheet's own "9/3/2026". */
export function sheetDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number)
  return `${m}/${d}/${y}`
}

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
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

/** "2026-09" -> "Sep 2026"; "" -> "All months". */
export function monthLabel(month: string): string {
  if (!month) return "All months"
  const [y, m] = month.split("-").map(Number)
  return `${MONTHS[m - 1]} ${y}`
}
export const longMonth = (iso: string) => LONG_MONTHS[Number(iso.slice(5, 7)) - 1]
/** "2026-09-29" -> "Sep 29". */
export const shortDate = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`
/** "2026-09-29" -> "Tue, Sep 29". */
export const dayDate = (iso: string) => `${WEEKDAYS[new Date(utc(iso)).getUTCDay()]}, ${shortDate(iso)}`

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

export function enrich(rows: RawVoucher[], today: string): Voucher[] {
  const out = rows.map((raw): Voucher => {
    const amount = parseAmount(raw.gross_amount) ?? 0
    const dv = parseDate(raw.dv_date)
    const due = parseDate(raw.due_date)
    const status = raw.status.trim().toUpperCase()
    const paid = status === "PAID"
    const days_late = due && !paid ? Math.max(Math.round((utc(today) - utc(due)) / DAY), 0) : 0
    let state: State
    let bucket: Bucket
    if (paid) {
      state = "paid"
      bucket = "paid"
    } else if (days_late || status === "OVERDUE") {
      state = "overdue"
      bucket = days_late > 30 ? "late30" : "late"
    } else {
      state = "pending"
      bucket = due === today ? "today" : due && due <= addDays(today, 6) ? "week" : "later"
    }
    return { ...raw, amount, dv, due, days_late, state, bucket, month: dv ? dv.slice(0, 7) : "" }
  })
  return out.sort((a, b) => cmp(a.due ?? "9999-99-99", b.due ?? "9999-99-99") || cmp(a.dv_no, b.dv_no))
}

export function inTab(r: Voucher, tab: string): boolean {
  switch (tab) {
    case "unpaid": return r.state !== "paid"
    case "overdue": return r.state === "overdue"
    case "week": return r.bucket === "today" || r.bucket === "week"
    case "paid": return r.state === "paid"
    default: return true
  }
}

export const total = (rows: Iterable<Voucher>) => {
  let sum = 0
  for (const r of rows) sum += r.amount
  return sum
}

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

/** Distinct labels for a field, "Not set" last. */
export function values(rows: Voucher[], field: Field): string[] {
  const all = new Set(rows.map((r) => label(r, field)))
  const found = [...all].filter((v) => v !== NOT_SET).sort(cmp)
  return all.has(NOT_SET) ? [...found, NOT_SET] : found
}

export const months = (rows: Voucher[]) =>
  [...new Set(rows.map((r) => r.month).filter(Boolean))].sort().reverse()

/** Rows matching the voucher-list query params (tab, area, month, bucket, q, sel). */
export function filterRows(rows: Voucher[], params: URLSearchParams): Voucher[] {
  const tab = params.get("tab") ?? "all"
  const q = (params.get("q") ?? "").trim().toLowerCase()
  const only = new Set(params.getAll("sel"))
  const area = params.get("area")
  const month = params.get("month")
  const bucket = params.get("bucket")
  return rows.filter((r) =>
    inTab(r, tab) &&
    (!area || label(r, "trade_area") === area) &&
    (!month || r.month === month) &&
    (!bucket || r.bucket === bucket || (bucket === "week" && r.bucket === "today")) &&
    (!q || `${r.dv_no} ${r.payee} ${r.particulars}`.toLowerCase().includes(q)) &&
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
