// The Collection tab read through its book: one entry per receipt, parsed and checked. Pure, like ledger.ts.
// Money is integer centavos; dates are ISO "YYYY-MM-DD". Deposit and Undeposited columns are not read; deposit lines (no amount, no OR #) drop out.
import { amountQuery, blank, NOT_SET, parseAmount, parseDate, serialDate } from "./ledger.ts"
import { readSheet, type Book, type Cell, type List, type RowClass, type Saved, type SheetModel } from "./sheet-config.ts"

// The Collection tab: headers in row 1, the ledger from A, then Deposit and Undeposited Collection (not read) and
// hand-made monthly summary tables right beside them. The ledger ends at its last known column ("known" bound).
export const COLLECTION_HEADERS = {
  date: ["Date", "Collection date", "Date of collection"],
  or_no: ["Reference No./OR No.", "OR No", "OR #", "Reference No", "Official Receipt No"],
  payor: ["Payor", "Payer", "Name of Payor"],
  uacs: ["UACS CODE", "UACS", "Account code"],
  area: ["Area", "Collection area", "Trade area"],
  nature: ["Nature of Collection", "Nature", "Particulars"],
  collection: ["Collection", "Collections", "Amount collected"],
}
export type CollectionField = keyof typeof COLLECTION_HEADERS

export const COLLECTION_LABELS: Record<CollectionField, string> = {
  date: "Date", or_no: "OR #", payor: "Payor", uacs: "UACS code", area: "Area", nature: "Nature of collection",
  collection: "Collection",
}

const asDate = (v: Cell | undefined) => (typeof v === "number" && v > 0 ? parseDate(serialDate(v)) : parseDate(String(v ?? "")))
const asAmount = (v: Cell | undefined) => (typeof v === "number" ? Math.round(v * 100) : parseAmount(String(v ?? "")))

/**
 * A row with a date and an amount in Collection is a receipt. Rows with nothing in Collection and no OR # (deposit
 * lines) drop out quietly. Totals, and receipts with an OR # but no amount, are skipped and listed, so no receipt drops
 * out unseen. Only the ledger's own columns are looked at.
 */
function classify(raw: Cell[], columns: Partial<Record<CollectionField, number>>): RowClass {
  const at = (f: CollectionField) => (columns[f] === undefined ? "" : raw[columns[f]!])
  if ((Object.values(columns) as number[]).every((j) => !String(raw[j] ?? "").trim())) return { kind: "skip", reason: "Blank" }
  const iso = asDate(at("date")), amount = asAmount(at("collection")), orNo = String(at("or_no") ?? "").trim()
  if (amount === 0 && !orNo) return { kind: "skip", reason: "Blank" } // a deposit line, or a note: not a receipt
  if (amount === null) return { kind: "skip", reason: "Amount written as text" }
  if (!amount) return { kind: "skip", reason: iso ? "No amount" : "Text only" }
  if (!iso) return { kind: "skip", reason: String(at("date") ?? "").trim() ? "Unreadable date" : "Totals or subtotal" }
  return { kind: "voucher", reason: "" }
}

export const COLLECTION: Book<CollectionField> = {
  name: "korphil.collection",
  headers: COLLECTION_HEADERS,
  required: ["date", "collection"],
  bound: "known",
  overrides: { headerRow: null, firstRow: null },
  types: { date: "date", or_no: "text", payor: "text", uacs: "dropdown", area: "dropdown", nature: "text", collection: "money" },
  lists: [],
  rolesHeader: ["COLLECTION ROLES"],
  raw: ["or_no", "payor", "uacs", "area", "nature"], // every text field: typed text is never read as a formula
  classify,
}

// Checks on every receipt.
export const ENTRY_ISSUES = {
  no_or: "No OR #",
  duplicate_or: "Duplicate OR #",
  no_uacs: "No UACS code",
  no_area: "No area",
} as const
export type EntryIssue = keyof typeof ENTRY_ISSUES

export type Entry = Record<CollectionField, string> & {
  sheet_row: number
  iso: string // the date, "YYYY-MM-DD"
  month: string // "YYYY-MM"
  collected: number // centavos
  issues: EntryIssue[]
  extra: Record<string, string> // columns beyond the known fields, by column key ("x:" + header)
}

export type Skipped = { row: number; reason: string; preview: string }
export type CollectionRead = { model: SheetModel<CollectionField>; error: string | null; entries: Entry[]; skipped: Skipped[] }

/** Entries from a model read through COLLECTION, checked, newest first. */
export function entriesFrom(values: Cell[][], model: SheetModel<CollectionField>): CollectionRead {
  const { columns } = model.layout
  const entries = model.rows.map((row): Entry => {
    const raw = values[row - 1] ?? []
    const text = Object.fromEntries((Object.keys(COLLECTION_HEADERS) as CollectionField[])
      .map((f) => [f, columns[f] === undefined ? "" : String(raw[columns[f]!] ?? "").trim()])) as Record<CollectionField, string>
    const iso = asDate(raw[columns.date!])!
    const extra = Object.fromEntries(model.columns.filter((c) => !c.field).map((c) => [c.key, String(raw[c.col] ?? "").trim()]))
    return { ...text, sheet_row: row, iso, month: iso.slice(0, 7), collected: asAmount(raw[columns.collection!])!, issues: [], extra }
  })
  check(entries)
  entries.sort((a, b) => (a.iso < b.iso ? 1 : a.iso > b.iso ? -1 : b.sheet_row - a.sheet_row))
  return { model, error: model.error, entries, skipped: model.skipped.map(({ row, reason, preview }) => ({ row, reason, preview })) }
}

/** The tab's cells straight to entries (tests, and any caller without a cached model). */
export const readCollections = (values: Cell[][], opts: { saved?: Saved<CollectionField> | null; lists?: List[] } = {}) =>
  entriesFrom(values, readSheet(values, { book: COLLECTION, ...opts }))

function check(entries: Entry[]) {
  const seen = new Map<string, number>()
  for (const e of entries) if (!blank(e.or_no)) seen.set(e.or_no, (seen.get(e.or_no) ?? 0) + 1)
  for (const e of entries) {
    const hits: [EntryIssue, boolean][] = [
      ["no_or", blank(e.or_no)],
      ["duplicate_or", (seen.get(e.or_no) ?? 0) > 1],
      ["no_uacs", blank(e.uacs)],
      ["no_area", blank(e.area)],
    ]
    e.issues = hits.filter(([, hit]) => hit).map(([i]) => i)
  }
}

export const collected = (es: Iterable<Entry>) => { let s = 0; for (const e of es) s += e.collected; return s }
export const tag = (e: Entry, f: CollectionField) => (blank(e[f]) ? NOT_SET : e[f].trim())

/** [label, receipts, collected], largest amount first. */
export function groupBy(es: Entry[], key: (e: Entry) => string): [string, number, number][] {
  const out = new Map<string, [number, number]>()
  for (const e of es) {
    const [n, amt] = out.get(key(e)) ?? [0, 0]
    out.set(key(e), [n + 1, amt + e.collected])
  }
  return [...out].map(([k, [n, a]]): [string, number, number] => [k, n, a]).sort((a, b) => b[2] - a[2])
}

export const entryMonths = (es: Entry[]) => [...new Set(es.map((e) => e.month))].sort().reverse()

/** Distinct labels of a column, "Not set" last. */
export function tags(es: Entry[], f: CollectionField): string[] {
  const all = new Set(es.map((e) => tag(e, f)))
  const found = [...all].filter((v) => v !== NOT_SET).sort()
  return all.has(NOT_SET) ? [...found, NOT_SET] : found
}

/** "4020203000 - Examination Fee" -> "Examination Fee"; text without a code stays as it is. */
export const account = (uacs: string) => uacs.replace(/^\s*\d{6,}\s*[-–]\s*/, "").trim() || uacs

/** Entries matching the collections-list params: month, year, area, uacs, issue (also "any"), q. */
export function filterEntries(es: Entry[], p: URLSearchParams): Entry[] {
  const month = p.get("month"), year = p.get("year"), area = p.get("area"), uacs = p.get("uacs"), issue = p.get("issue")
  const q = (p.get("q") ?? "").trim().toLowerCase()
  const amount = amountQuery(q) // an amount in the search box also matches by amount
  return es.filter((e) =>
    (!month || e.month === month) &&
    (!year || e.month.startsWith(year + "-")) &&
    (!area || tag(e, "area") === area) &&
    (!uacs || tag(e, "uacs") === uacs) &&
    (!issue || (issue === "any" ? e.issues.length > 0 : e.issues.includes(issue as EntryIssue))) &&
    (!q || `${e.or_no} ${e.payor} ${e.nature} ${e.uacs}`.toLowerCase().includes(q) || !!amount?.(e.collected)),
  )
}
