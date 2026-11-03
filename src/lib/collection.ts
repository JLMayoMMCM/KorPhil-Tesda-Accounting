// The Collection tab read through its spec: one entry per receipt or deposit, parsed and checked. Pure, like ledger.ts.
// Money is integer centavos; dates are ISO "YYYY-MM-DD". A row is a collection (OR issued) or a deposit (cash to the bank).
import { blank, NOT_SET, parseAmount, parseDate, serialDate } from "./ledger.ts"
import { COLLECTION, COLLECTION_HEADERS, detectLayout, OVERRIDES, type Cell, type CollectionField, type Layout } from "./sheet-config.ts"

export const COLLECTION_LABELS: Record<CollectionField, string> = {
  date: "Date", or_no: "OR #", payor: "Payor", uacs: "UACS code", area: "Area", nature: "Nature of collection",
  collection: "Collection", deposit: "Deposit",
}

// Checks on collections only; a deposit carries no OR, payor or classification.
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
  kind: "collection" | "deposit"
  collected: number // centavos
  deposited: number // centavos
  issues: EntryIssue[]
}

export type Skipped = { row: number; reason: string; preview: string }
export type CollectionRead = { layout: Layout<CollectionField> | null; error: string | null; entries: Entry[]; skipped: Skipped[] }

const asDate = (v: Cell | undefined) => (typeof v === "number" && v > 0 ? parseDate(serialDate(v)) : parseDate(String(v ?? "")))
const asAmount = (v: Cell | undefined) => (typeof v === "number" ? Math.round(v * 100) : parseAmount(String(v ?? "")))

/**
 * Every row under the header with a date and an amount in Collection or Deposit is an entry. Totals (amounts, no date,
 * nothing dated above) and rows with text but no amount are skipped and listed, so nothing drops out unseen. Newest first.
 */
export function readCollections(values: Cell[][], overrides = OVERRIDES): CollectionRead {
  const [layout, error] = detectLayout(values, overrides, {}, COLLECTION)
  if (!layout) return { layout, error, entries: [], skipped: [] }
  const cols = Object.entries(layout.columns) as [CollectionField, number][]
  const entries: Entry[] = [], skipped: Skipped[] = []
  let above: string | null = null // the date of the last dated row, read or not
  values.forEach((raw, i) => {
    const row = i + 1
    if (row < layout.firstRow) return
    const at = (f: CollectionField) => (layout.columns[f] === undefined ? "" : raw[layout.columns[f]!])
    const text = Object.fromEntries((Object.keys(COLLECTION_HEADERS) as CollectionField[]).map((f) => [f, String(at(f) ?? "").trim()])) as Record<CollectionField, string>
    if (cols.every(([f]) => !text[f])) return
    const iso = asDate(at("date")), collected = asAmount(at("collection")), deposited = asAmount(at("deposit"))
    const before = above
    if (iso) above = iso
    const preview = cols.map(([f]) => text[f]).filter(Boolean).slice(0, 4).join(" · ").slice(0, 80)
    if (collected === null || deposited === null) return skipped.push({ row, reason: "Amount written as text", preview })
    if (!collected && !deposited) return skipped.push({ row, reason: iso ? "No amount" : "Text only", preview })
    // ponytail: an undated deposit (the sheet writes "DEPOSIT" or the month in Payor) takes the date of the row above,
    // as deposits are entered in date order; give deposits a date in the sheet if that ever misplaces one.
    const day = iso ?? (!collected && !text.date ? before : null)
    if (!day) return skipped.push({ row, reason: text.date ? "Unreadable date" : "Totals or subtotal", preview })
    entries.push({ ...text, sheet_row: row, iso: day, month: day.slice(0, 7), kind: collected ? "collection" : "deposit", collected, deposited, issues: [] })
  })
  check(entries)
  entries.sort((a, b) => (a.iso < b.iso ? 1 : a.iso > b.iso ? -1 : b.sheet_row - a.sheet_row))
  return { layout, error: null, entries, skipped }
}

function check(entries: Entry[]) {
  const seen = new Map<string, number>()
  for (const e of entries) if (e.kind === "collection" && !blank(e.or_no)) seen.set(e.or_no, (seen.get(e.or_no) ?? 0) + 1)
  for (const e of entries) {
    if (e.kind !== "collection") continue
    const hits: [EntryIssue, boolean][] = [
      ["no_or", blank(e.or_no)],
      ["duplicate_or", (seen.get(e.or_no) ?? 0) > 1],
      ["no_uacs", blank(e.uacs)],
      ["no_area", blank(e.area)],
    ]
    e.issues = hits.filter(([, hit]) => hit).map(([i]) => i)
  }
}

export const collections = (es: Entry[]) => es.filter((e) => e.kind === "collection")
export const collected = (es: Iterable<Entry>) => { let s = 0; for (const e of es) s += e.collected; return s }
export const deposited = (es: Iterable<Entry>) => { let s = 0; for (const e of es) s += e.deposited; return s }
export const tag = (e: Entry, f: CollectionField) => (blank(e[f]) ? NOT_SET : e[f].trim())

/** [label, receipts, collected] over the collections, largest amount first. */
export function groupBy(es: Entry[], key: (e: Entry) => string): [string, number, number][] {
  const out = new Map<string, [number, number]>()
  for (const e of collections(es)) {
    const [n, amt] = out.get(key(e)) ?? [0, 0]
    out.set(key(e), [n + 1, amt + e.collected])
  }
  return [...out].map(([k, [n, a]]): [string, number, number] => [k, n, a]).sort((a, b) => b[2] - a[2])
}

export const entryMonths = (es: Entry[]) => [...new Set(es.map((e) => e.month))].sort().reverse()

/** Distinct labels of a column over the collections, "Not set" last. */
export function tags(es: Entry[], f: CollectionField): string[] {
  const all = new Set(collections(es).map((e) => tag(e, f)))
  const found = [...all].filter((v) => v !== NOT_SET).sort()
  return all.has(NOT_SET) ? [...found, NOT_SET] : found
}

/** Collections less deposits up to and including a date: cash on hand not yet in the bank. */
export const undeposited = (es: Entry[], through = "9999-12-31") => {
  const upTo = es.filter((e) => e.iso <= through)
  return collected(upTo) - deposited(upTo)
}

/** "4020203000 - Examination Fee" -> "Examination Fee"; text without a code stays as it is. */
export const account = (uacs: string) => uacs.replace(/^\s*\d{6,}\s*[-–]\s*/, "").trim() || uacs

/** Entries matching the collections-list params: kind, month, year, area, uacs, issue (also "any"), q. */
export function filterEntries(es: Entry[], p: URLSearchParams): Entry[] {
  const kind = p.get("kind"), month = p.get("month"), year = p.get("year"), area = p.get("area"), uacs = p.get("uacs"), issue = p.get("issue")
  const q = (p.get("q") ?? "").trim().toLowerCase()
  return es.filter((e) =>
    (!kind || e.kind === kind) &&
    (!month || e.month === month) &&
    (!year || e.month.startsWith(year + "-")) &&
    (!area || (e.kind === "collection" && tag(e, "area") === area)) &&
    (!uacs || (e.kind === "collection" && tag(e, "uacs") === uacs)) &&
    (!issue || (issue === "any" ? e.issues.length > 0 : e.issues.includes(issue as EntryIssue))) &&
    (!q || `${e.or_no} ${e.payor} ${e.nature} ${e.uacs}`.toLowerCase().includes(q)),
  )
}
