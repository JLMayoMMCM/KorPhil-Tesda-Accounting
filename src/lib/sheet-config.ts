// What the app knows about the sheet's layout, and how it finds that layout by reading the tab.
// Pure functions, no runtime imports (node --test runs them); sheets.ts applies them to a pull.
import type { Field } from "./ledger"

export type Cell = string | number | boolean

// The layout before R5, by position, and the fallback whenever detection isn't confident.
// Columns B and G are unlabelled spacers. Rows 3-4 hold a label row and the totals row.
export const FIXED = {
  headerRow: 2,
  firstRow: 5,
  columns: [
    "dv_date", null, "dv_no", "payee", "particulars", "gross_amount", null,
    "check_number", "trade_area", "diploma_st_assessment", "category", "status",
  ] as (Field | null)[],
}

// Optional overrides; empty means auto-detect.
const envRow = (v: string | undefined) => (Number(v) > 0 ? Math.floor(Number(v)) : null)
export const OVERRIDES = {
  headerRow: envRow(process.env.SHEET_HEADER_ROW),
  firstRow: envRow(process.env.SHEET_FIRST_ROW),
}

// Header text accepted for each field (compared after normalize()).
export const HEADERS: Record<Field, string[]> = {
  dv_date: ["DV date", "Date", "DV Dt", "Date of DV"],
  dv_no: ["DV #", "DV No", "DV Number", "Voucher No", "Disbursement Voucher No"],
  payee: ["Payee", "Name of Payee", "Payee Name"],
  particulars: ["Particulars", "Description", "Purpose"],
  gross_amount: ["Gross amount", "Gross", "Amount", "Gross Amt", "Total Amount"],
  check_number: ["Check #", "Check No", "Cheque No", "Check Number"],
  trade_area: ["Trade area", "Trade"],
  diploma_st_assessment: ["Diploma / ST / Assessment", "Diploma/ST/Assessment", "Diploma ST Assessment", "Diploma / ST", "Diploma"],
  category: ["Category"],
  status: ["Status", "Review status", "Remarks / Status"],
}
export const REQUIRED: Field[] = ["dv_no", "dv_date", "gross_amount"]
const SEARCH_ROWS = 20

/** "DV No." / "DV #" / "dv number" -> "dv no". */
export function normalize(text: Cell | undefined): string {
  return String(text ?? "").toLowerCase()
    .replaceAll("#", " no ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bnumber\b/g, "no")
    .replace(/\s+/g, " ")
    .trim()
}

const ALIASES = new Map(Object.entries(HEADERS).flatMap(([f, names]) => names.map((n) => [normalize(n), f as Field])))
const fieldOf = (text: string) => ALIASES.get(normalize(text)) ?? null

/** 0 -> "A", 25 -> "Z", 26 -> "AA". */
export function colLetter(index: number): string {
  let s = ""
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

export type Layout = {
  headerRow: number // 1-indexed
  firstRow: number
  columns: Partial<Record<Field, number>> // field -> 0-indexed column
  headers: Partial<Record<Field, string>> // the sheet's own header text
  extras: { col: number; text: string }[] // labelled columns the app doesn't know
  missing: Field[] // optional fields with no column
  duplicates: Field[] // fields matched by more than one column (the first is used)
}

/** Match one row as a header row, joining a cell with the one above when it doesn't match alone. */
function readHeader(values: Cell[][], i: number) {
  const row = values[i] ?? [], above = values[i - 1] ?? []
  const columns: Partial<Record<Field, number>> = {}, headers: Partial<Record<Field, string>> = {}
  const duplicates: Field[] = []
  for (let j = 0; j < row.length; j++) {
    const text = String(row[j] ?? "").trim()
    if (!text) continue
    const joined = `${String(above[j] ?? "").trim()} ${text}`.trim()
    const label = fieldOf(text) || i === 0 ? text : joined
    const field = fieldOf(label)
    if (!field) continue
    if (field in columns) duplicates.push(field)
    else {
      columns[field] = j
      headers[field] = label
    }
  }
  return { columns, headers, duplicates }
}

/** Column roles set by hand in Settings, by 0-indexed column: a field, or "none" for a plain extra column. */
export type Roles = Record<number, Field | "none">

/**
 * Find the header row in the top rows: the one matching the most known headers, with every required field.
 * Roles set in Settings override what the header text says. Returns the layout, or an error saying what was missing.
 */
export function detectLayout(values: Cell[][], overrides: typeof OVERRIDES = OVERRIDES, roles: Roles = {}): [Layout | null, string | null] {
  const candidates = overrides.headerRow ? [overrides.headerRow - 1] : [...Array(Math.min(SEARCH_ROWS, values.length)).keys()]
  let best: (ReturnType<typeof readHeader> & { i: number }) | null = null
  for (const i of candidates) {
    const h = readHeader(values, i)
    if (!best || Object.keys(h.columns).length > Object.keys(best.columns).length) best = { ...h, i }
  }
  if (!best) return [null, "The sheet is empty."]
  const { i, columns, headers, duplicates } = best
  const row = values[i] ?? []
  for (const [c, role] of Object.entries(roles)) {
    const j = Number(c)
    for (const f of Object.keys(columns) as Field[]) {
      if (columns[f] !== j && f !== role) continue
      delete columns[f]
      delete headers[f]
    }
    if (role === "none") continue
    columns[role] = j
    headers[role] = String(row[j] ?? "").trim() || HEADERS[role][0]
  }
  if (!Object.keys(columns).length) return [null, `No header row found in the top ${SEARCH_ROWS} rows.`]
  const lacking = REQUIRED.filter((f) => !(f in columns))
  if (lacking.length) return [null, `Header row ${i + 1} has no column for ${lacking.map((f) => HEADERS[f][0]).join(", ")}.`]
  const used = new Set(Object.values(columns))
  const extras = row.flatMap((v, j) => (!used.has(j) && String(v ?? "").trim() ? [{ col: j, text: String(v).trim() }] : []))
  const missing = (Object.keys(HEADERS) as Field[]).filter((f) => !(f in columns))
  return [{ columns, headers, extras, duplicates, headerRow: i + 1, firstRow: overrides.firstRow ?? i + 2, missing }, null]
}

/** The FIXED layout in the same shape, for comparison and fallback. */
export function fixedLayout(): Layout {
  const columns: Layout["columns"] = {}
  FIXED.columns.forEach((f, j) => { if (f) columns[f] = j })
  const missing = (Object.keys(HEADERS) as Field[]).filter((f) => !(f in columns))
  return { headerRow: FIXED.headerRow, firstRow: FIXED.firstRow, columns, headers: {}, extras: [], missing, duplicates: [] }
}

/** Fields whose column differs between two layouts. */
export const layoutDiff = (a: Layout, b: Layout) =>
  (Object.keys(HEADERS) as Field[]).filter((f) => a.columns[f] !== b.columns[f])

export type RowClass = { kind: "voucher" | "skip" | "unsure"; reason: string }

const DATE_TEXT = /^\d{1,2}[/-]\d{1,2}[/-](\d{4}|\d{2})$/
const NUMBER_TEXT = /^[₱\s]*[+-]?(\d{1,3}(,\d{3})+|\d+)?(\.\d+)?$/
const SAMPLE = /\b(sample|example|instructions?|e\.g)\b/i
const PLACEHOLDER_DV = /yyyy|^06-\d{4}-\d{2}-0{5}$/i
const DV = /^06-\d{4}-(0[1-9]|1[0-2])-\d{5}$/

/** Is this row a voucher? Sparse real vouchers stay vouchers; anything doubtful is "unsure", for a person to confirm. */
export function classifyRow(row: Cell[], columns: Layout["columns"]): RowClass {
  const at = (f: Field) => (columns[f] === undefined ? "" : row[columns[f]!] ?? "")
  const text = (f: Field) => String(at(f)).trim()
  const filled = row.filter((v) => String(v).trim() !== "").length
  if (!filled) return { kind: "skip", reason: "Blank" }
  if (PLACEHOLDER_DV.test(text("dv_no"))) return { kind: "skip", reason: "Placeholder DV #" }
  if (row.some((v) => typeof v === "string" && SAMPLE.test(v))) return { kind: "skip", reason: "Sample or instruction text" }

  const amount = at("gross_amount")
  const hasAmount = typeof amount === "number" || (String(amount).trim() !== "" && NUMBER_TEXT.test(String(amount).trim()))
  const date = at("dv_date")
  const hasDate = (typeof date === "number" && date > 0) || DATE_TEXT.test(String(date).trim())
  const hasPayee = text("payee") !== ""
  if (hasAmount && !hasDate && !hasPayee && !text("particulars") && !text("dv_no")) return { kind: "skip", reason: "Totals or subtotal" }
  // Any DV # counts as a signal too, so a real voucher with most data missing stays a voucher (the review queue flags it).
  if (DV.test(text("dv_no")) || [hasDate, hasAmount, hasPayee, text("dv_no") !== ""].filter(Boolean).length >= 2) return { kind: "voucher", reason: "" }
  if (String(amount).trim() && !hasAmount) return { kind: "skip", reason: "Amount written as text" }
  if (filled <= 2) return { kind: "skip", reason: "Text in only one or two cells" }
  return { kind: "unsure", reason: "Not enough voucher data to tell" }
}

// ---- Columns as inputs (R5 Phase 3) ----

export const INPUT_TYPES = { dropdown: "Dropdown", date: "Date", money: "Money", long: "Long text", text: "Text" } as const
export type InputType = keyof typeof INPUT_TYPES
export const VISIBILITY = { shown: "Shown", readonly: "Read-only", hidden: "Hidden" } as const
export type Visibility = keyof typeof VISIBILITY
// Exceptions to inference. The three dropdown fields stay dropdowns even when the Selection List can't be read.
const TYPE_OVERRIDES: Partial<Record<Field, InputType>> = {
  dv_no: "text", dv_date: "date", gross_amount: "money", check_number: "text", payee: "text", particulars: "long",
  status: "dropdown", trade_area: "dropdown", diploma_st_assessment: "dropdown", category: "dropdown",
}
// Before R5 the Selection List was read by position: A, B, C. That order is the fallback when no list header matches.
const LIST_ORDER: Field[] = ["trade_area", "diploma_st_assessment", "category"]

/** Input type from a column's header and existing values. Dates arrive as serial numbers, so a "date" header decides those. */
export function inferType(header: string, values: Cell[], hasList: boolean): InputType {
  if (hasList) return "dropdown"
  const filled = values.filter((v) => String(v).trim() !== "")
  const most = (test: (v: Cell) => boolean) => filled.length > 0 && filled.filter(test).length * 2 > filled.length
  if (/\bdate\b/.test(normalize(header)) || most((v) => typeof v === "string" && DATE_TEXT.test(v.trim()))) return "date"
  if (most((v) => typeof v === "number")) return "money"
  if (most((v) => String(v).length > 60)) return "long"
  return "text"
}

/** One sheet column as the app uses it. key is the field for a role column, else "x:" + its header text. */
export type Column = { key: string; field: Field | null; label: string; col: number; type: InputType; options: string[]; visibility: Visibility }
export type List = { header: string; values: string[] }

// ---- Settings saved in the spreadsheet as developer metadata (R5 Phase 5) ----

export const META = { layout: "korphil.layout", header: "korphil.header", ignore: "korphil.ignore", column: "korphil.column" } as const
export type ColumnSetting = { role?: Field | "none"; type?: InputType; visibility?: Visibility }
export type Saved = { headerRow: number | null; ignored: number[]; columns: Record<number, ColumnSetting>; by: string; at: string }
export type Metadata = {
  metadataKey: string
  metadataValue?: string
  location?: { dimensionRange?: { sheetId?: number; dimension?: string; startIndex?: number } }
}

/** Settings from the metadata Google returns (null when none were saved). Row and column tags give their current position. */
export function savedFrom(found: Metadata[], sheetId: number): Saved | null {
  const top = found.find((m) => m.metadataKey === META.layout)
  if (!top) return null
  const saved: Saved = { headerRow: null, ignored: [], columns: {}, by: "", at: "" }
  try {
    const { by, at } = JSON.parse(top.metadataValue ?? "{}")
    Object.assign(saved, { by: String(by ?? ""), at: String(at ?? "") })
  } catch { /* who/when is only shown on Settings */ }
  for (const m of found) {
    const at = m.location?.dimensionRange
    if (!at || (at.sheetId ?? 0) !== sheetId || at.startIndex === undefined) continue
    if (m.metadataKey === META.header) saved.headerRow = at.startIndex + 1
    else if (m.metadataKey === META.ignore) saved.ignored.push(at.startIndex + 1)
    else if (m.metadataKey === META.column) {
      try {
        saved.columns[at.startIndex] = JSON.parse(m.metadataValue ?? "{}")
      } catch { /* an unreadable tag is skipped, not fatal */ }
    }
  }
  return saved
}

// ---- The whole tab, read through a layout ----

export type SheetModel = {
  source: "saved" | "detected" | "fixed"
  error: string | null // why saved settings or detection weren't used
  layout: Layout
  columns: Column[] // in sheet order
  vouchers: number[] // 1-indexed rows read as vouchers
  skipped: (RowClass & { row: number; preview: string })[] // non-blank rows that aren't clean vouchers (unsure ones are still read)
  nextRow: number // first row after the last voucher that is empty in every mapped column
  headerSig: string // the header row as read, compared before every write
}

/**
 * Read the tab: saved settings first, then detection, then the FIXED layout (always, when fixed is set).
 * Detected rows go through classifyRow; unsure rows are kept, so nothing is dropped silently.
 */
export function readSheet(values: Cell[][], { saved = null as Saved | null, lists = [] as List[], fixed = false } = {}): SheetModel {
  let found: Layout | null = null, error: string | null = null
  if (!fixed) {
    const roles: Roles = Object.fromEntries(Object.entries(saved?.columns ?? {}).filter(([, s]) => s.role).map(([c, s]) => [c, s.role!]))
    ;[found, error] = detectLayout(values, { headerRow: saved?.headerRow ?? OVERRIDES.headerRow, firstRow: OVERRIDES.firstRow }, roles)
  }
  const source: SheetModel["source"] = !found ? "fixed" : saved ? "saved" : "detected"
  const layout = found ?? fixedLayout()
  const ignored = new Set(source === "saved" ? saved!.ignored : [])
  const vouchers: number[] = [], skipped: SheetModel["skipped"] = []
  values.forEach((raw, i) => {
    const row = i + 1
    if (row < layout.firstRow) return
    if (source === "fixed") {
      if (raw.some((v) => v !== "")) vouchers.push(row) // the pre-R5 rule: every non-blank row from row 5
      return
    }
    const c: RowClass = ignored.has(row) ? { kind: "skip", reason: "Ignored in Settings" } : classifyRow(raw, layout.columns)
    if (c.kind !== "skip") vouchers.push(row)
    if (c.kind !== "voucher" && c.reason !== "Blank")
      skipped.push({ ...c, row, preview: raw.map((v) => String(v).trim()).filter(Boolean).slice(0, 4).join(" · ").slice(0, 80) })
  })

  const mapped = [...Object.values(layout.columns), ...layout.extras.map((x) => x.col)]
  let nextRow = (vouchers.at(-1) ?? layout.firstRow - 1) + 1
  while (mapped.some((j) => String(values[nextRow - 1]?.[j] ?? "").trim() !== "")) nextRow++

  // Columns: roles and extras in sheet order, each with its input type and dropdown choices.
  const sample = (j: number) => vouchers.slice(-500).map((r) => values[r - 1]?.[j] ?? "")
  const listOf = (label: string, field: Field | null) =>
    lists.find((l) => normalize(l.header) === normalize(label) || (field !== null && fieldOf(l.header) === field))
  const cols = [
    ...(Object.entries(layout.columns) as [Field, number][]).map(([f, col]) => ({ key: f as string, field: f as Field | null, label: layout.headers[f] || HEADERS[f][0], col })),
    ...layout.extras.map((x) => ({ key: `x:${x.text}`, field: null, label: x.text, col: x.col })),
  ].sort((a, b) => a.col - b.col)
  const byHeader = cols.some((c) => listOf(c.label, c.field))
  const keys = new Set<string>()
  const columns = cols.map((c): Column => {
    if (keys.has(c.key)) c.key += ` (${colLetter(c.col)})` // two extra columns with the same header
    keys.add(c.key)
    const list = listOf(c.label, c.field) ?? (!byHeader && c.field && LIST_ORDER.includes(c.field) ? lists[LIST_ORDER.indexOf(c.field)] : undefined)
    const set: ColumnSetting = source === "saved" ? saved!.columns[c.col] ?? {} : {}
    const type = set.type ?? (c.field && TYPE_OVERRIDES[c.field]) ?? inferType(c.label, sample(c.col), !!list)
    const options = list?.values ?? (type === "dropdown" ? [...new Set(sample(c.col).map((v) => String(v).trim()).filter(Boolean))].sort() : [])
    return { ...c, type, options, visibility: set.visibility ?? "shown" }
  })
  return { source, error, layout, columns, vouchers, skipped, nextRow, headerSig: JSON.stringify(values[layout.headerRow - 1] ?? []) }
}
