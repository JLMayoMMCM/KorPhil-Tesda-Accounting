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

// ---- When to pull ----

export const CACHE_SECONDS = 60
export const RETRY_SECONDS = 15

/**
 * What a read does about the cache. ts: last good pull, 0 for none or after a write. tried: last attempt, kept from
 * repeating within RETRY_SECONDS, so an outage doesn't stall every click on Google's timeout.
 * wait: the caller needs this pull's data. background: serve what's cached now and pull behind it.
 */
export function pullPlan({ ts, tried, running }: { ts: number; tried: number; running: boolean }, force: boolean, now: number): "wait" | "background" | "none" {
  const due = now - tried > RETRY_SECONDS * 1000
  if (force || (!ts && (due || running))) return "wait"
  return ts && due && !running && now - ts > CACHE_SECONDS * 1000 ? "background" : "none"
}

// ---- One book per ledger tab, so each module reads (and writes) its own tab through the same engine ----

/**
 * A ledger tab as the engine sees it. Nothing outside a module's book names that module's fields.
 * headers: header text accepted per field. required: fields it can't do without.
 * bound: how far right the ledger runs. "row" is the whole header row; "known" stops at the last column with a role
 * (a field found in the header, or one set in Settings), so side tables to the right are never read.
 */
export type Book<F extends string> = {
  name: string // cache key, and the metadata key prefix for its saved settings
  headers: Record<F, string[]>
  required: F[]
  bound: "row" | "known"
  overrides: { headerRow: number | null; firstRow: number | null }
  types: Partial<Record<F, InputType>> // exceptions to inferType
  lists: F[] // Selection List columns by position, when no list header matches
  rolesHeader: string[] // the Selection List column that names this book's roles (e.g. "DVROLES")
  raw: F[] // codes and names written RAW, so Google never converts them
  classify: (row: Cell[], columns: Partial<Record<F, number>>) => RowClass
  starts?: (row: Cell[], columns: Partial<Record<F, number>>) => boolean // the first ledger row; absent: the row after the header
  fixed?: () => Layout<F> // fallback when detection fails; absent: no layout, and an error
}

/** "DV No." / "DV #" / "dv number" -> "dv no". */
export function normalize(text: Cell | undefined): string {
  return String(text ?? "").toLowerCase()
    .replaceAll("#", " no ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bnumber\b/g, "no")
    .replace(/\s+/g, " ")
    .trim()
}

const aliases = <F extends string>(book: Pick<Book<F>, "headers">) =>
  new Map(Object.entries<string[]>(book.headers).flatMap(([f, names]) => names.map((n): [string, F] => [normalize(n), f as F])))

/** 0 -> "A", 25 -> "Z", 26 -> "AA". */
export function colLetter(index: number): string {
  let s = ""
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

export type Layout<F extends string = Field> = {
  headerRow: number // 1-indexed
  firstRow: number
  columns: Partial<Record<F, number>> // field -> 0-indexed column
  headers: Partial<Record<F, string>> // the sheet's own header text
  extras: { col: number; text: string; custom?: true }[] // labelled columns the app doesn't know; custom: holds a custom role, text is its name
  missing: F[] // optional fields with no column
  duplicates: F[] // fields matched by more than one column (the first is used)
}

/** Match one row as a header row, joining a cell with the one above when it doesn't match alone. */
function readHeader<F extends string>(values: Cell[][], i: number, find: (text: string) => F | null) {
  const row = values[i] ?? [], above = values[i - 1] ?? []
  const columns: Partial<Record<F, number>> = {}, headers: Partial<Record<F, string>> = {}
  const duplicates: F[] = []
  for (let j = 0; j < row.length; j++) {
    const text = String(row[j] ?? "").trim()
    if (!text) continue
    const joined = `${String(above[j] ?? "").trim()} ${text}`.trim()
    const label = find(text) || i === 0 ? text : joined
    const field = find(label)
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
export type Roles<F extends string = Field> = Record<number, F | "none" | Custom>
/** A custom role: a name in the Selection List's roles table that isn't a field the app knows ("x:Deposit"). */
export type Custom = `x:${string}`

/**
 * Find the header row in the top rows: the one matching the most known headers, with every required field.
 * Roles set in Settings override what the header text says. Returns the layout, or an error saying what was missing.
 */
export function detectLayout<F extends string = Field>(
  values: Cell[][], overrides: Book<F>["overrides"] = OVERRIDES, roles: Roles<F> = {}, spec = DISBURSEMENT as unknown as Pick<Book<F>, "headers" | "required" | "bound">,
  extend: number[] = [], // columns set to show in Settings: a "known" ledger runs at least this far
  custom: string[] = [], // custom role names, found by header text when Settings hasn't placed them
): [Layout<F> | null, string | null] {
  const map = aliases(spec)
  const find = (text: string) => map.get(normalize(text)) ?? null
  const candidates = overrides.headerRow ? [overrides.headerRow - 1] : [...Array(Math.min(SEARCH_ROWS, values.length)).keys()]
  let best: (ReturnType<typeof readHeader<F>> & { i: number }) | null = null
  for (const i of candidates) {
    const h = readHeader(values, i, find)
    if (!best || Object.keys(h.columns).length > Object.keys(best.columns).length) best = { ...h, i }
  }
  if (!best) return [null, "The sheet is empty."]
  const { i, columns, headers, duplicates } = best
  const whole = values[i] ?? []
  for (const [c, role] of Object.entries(roles) as [string, F | "none" | Custom][]) {
    const j = Number(c)
    for (const f of Object.keys(columns) as F[]) {
      if (columns[f] !== j && f !== role) continue
      delete columns[f]
      delete headers[f]
    }
    if (role === "none" || role.startsWith("x:")) continue
    columns[role as F] = j
    headers[role as F] = String(whole[j] ?? "").trim() || spec.headers[role as F][0]
  }
  if (!Object.keys(columns).length) return [null, `No header row found in the top ${SEARCH_ROWS} rows.`]
  const lacking = spec.required.filter((f) => !(f in columns))
  if (lacking.length) return [null, `Header row ${i + 1} has no column for ${lacking.map((f) => spec.headers[f][0]).join(", ")}.`]
  const used = new Set(Object.values(columns) as number[])
  // Custom roles: placed in Settings, else on the first free column whose header is the role's name.
  const customAt = new Map<number, string>()
  for (const [c, role] of Object.entries(roles)) if (role.startsWith("x:")) customAt.set(Number(c), role.slice(2))
  const placed = new Set([...customAt.values()].map(normalize))
  for (const name of custom) {
    if (placed.has(normalize(name))) continue
    const j = whole.findIndex((v, k) => !used.has(k) && !customAt.has(k) && normalize(v) === normalize(name))
    if (j >= 0) customAt.set(j, name)
  }
  // "known": the ledger ends at its last column with a role (custom and "none" roles count, and columns Settings shows).
  const end = Math.max(...used, ...Object.keys(roles).map(Number), ...customAt.keys(), ...extend) + 1
  const row = spec.bound === "row" ? whole : whole.slice(0, end)
  // A header with a custom role's name, when that role is placed on another column, isn't read twice under one name.
  const names = new Set([...customAt.values()].map(normalize))
  const extras = Array.from({ length: Math.max(row.length, ...[...customAt.keys()].map((j) => j + 1)) }, (_, j) => j).flatMap((j) =>
    customAt.has(j) ? [{ col: j, text: customAt.get(j)!, custom: true as const }]
      : !used.has(j) && String(row[j] ?? "").trim() && !names.has(normalize(row[j])) ? [{ col: j, text: String(row[j]).trim() }] : [])
  const missing = (Object.keys(spec.headers) as F[]).filter((f) => !(f in columns))
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
const isDate = (v: Cell | undefined) => (typeof v === "number" && v > 0) || DATE_TEXT.test(String(v ?? "").trim())

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
  const hasDate = isDate(at("dv_date"))
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
export type Column<F extends string = Field> = { key: string; field: F | null; label: string; col: number; type: InputType; options: string[]; visibility: Visibility }
export type List = { header: string; values: string[] }

// ---- Settings saved in the spreadsheet as developer metadata (R5 Phase 5) ----

/** A book's metadata keys. The disbursement book keeps the bare "korphil" prefix, so settings saved before R9 still apply. */
export const metaKeys = (prefix: string) =>
  ({ layout: `${prefix}.layout`, header: `${prefix}.header`, ignore: `${prefix}.ignore`, column: `${prefix}.column` }) as const
export const META = metaKeys("korphil")
export type ColumnSetting<F extends string = Field> = { role?: F | "none" | Custom; type?: InputType; visibility?: Visibility }
export type Saved<F extends string = Field> = { headerRow: number | null; ignored: number[]; columns: Record<number, ColumnSetting<F>>; by: string; at: string }
export type Metadata = {
  metadataKey: string
  metadataValue?: string
  location?: { dimensionRange?: { sheetId?: number; dimension?: string; startIndex?: number } }
}

/** Settings from the metadata Google returns (null when none were saved). Row and column tags give their current position. */
export function savedFrom<F extends string = Field>(found: Metadata[], sheetId: number, keys: ReturnType<typeof metaKeys> = META): Saved<F> | null {
  const top = found.find((m) => m.metadataKey === keys.layout)
  if (!top) return null
  const saved: Saved<F> = { headerRow: null, ignored: [], columns: {}, by: "", at: "" }
  try {
    const { by, at } = JSON.parse(top.metadataValue ?? "{}")
    Object.assign(saved, { by: String(by ?? ""), at: String(at ?? "") })
  } catch { /* who/when is only shown on Settings */ }
  for (const m of found) {
    const at = m.location?.dimensionRange
    if (!at || (at.sheetId ?? 0) !== sheetId || at.startIndex === undefined) continue
    if (m.metadataKey === keys.header) saved.headerRow = at.startIndex + 1
    else if (m.metadataKey === keys.ignore) saved.ignored.push(at.startIndex + 1)
    else if (m.metadataKey === keys.column) {
      try {
        saved.columns[at.startIndex] = JSON.parse(m.metadataValue ?? "{}")
      } catch { /* an unreadable tag is skipped, not fatal */ }
    }
  }
  return saved
}

// ---- The whole tab, read through a layout ----

export type SheetModel<F extends string = Field> = {
  source: "saved" | "detected" | "fixed" | "none" // none: no layout found and the book has no fixed fallback
  error: string | null // why saved settings or detection weren't used
  layout: Layout<F>
  columns: Column<F>[] // in sheet order
  rows: number[] // 1-indexed rows read as ledger rows
  skipped: (RowClass & { row: number; preview: string })[] // non-blank rows that aren't clean ledger rows (unsure ones are still read)
  nextRow: number // first row after the last ledger row that is empty in every mapped column
  headerSig: string // the header cells of the mapped columns, compared before every write
}

/** The header cells a model reads, so a write can tell whether columns moved since the pull. */
export const headerSig = (header: Cell[], columns: { col: number }[]) => JSON.stringify(columns.map((c) => String(header[c.col] ?? "").trim()))

/**
 * Read the tab through a book: saved settings first, then detection, then the book's fixed layout (always, when fixed
 * is set). Detected rows go through the book's classify; unsure rows are kept, so nothing is dropped silently.
 */
export function readSheet<F extends string = Field>(
  values: Cell[][],
  { book = DISBURSEMENT as unknown as Book<F>, saved = null as Saved<F> | null, lists = [] as List[], fixed = false } = {},
): SheetModel<F> {
  let found: Layout<F> | null = null, error: string | null = null
  if (!fixed) {
    const roles: Roles<F> = Object.fromEntries(Object.entries(saved?.columns ?? {}).filter(([, s]) => s.role).map(([c, s]) => [c, s.role!]))
    const extend = Object.entries(saved?.columns ?? {}).filter(([, s]) => s.visibility && s.visibility !== "hidden").map(([c]) => Number(c))
    ;[found, error] = detectLayout(values, { headerRow: saved?.headerRow ?? book.overrides.headerRow, firstRow: book.overrides.firstRow }, roles, book, extend, bookRoles(book, lists).custom)
  }
  const fallback = found ? null : book.fixed?.() ?? null
  if (!found && !fallback) {
    const layout: Layout<F> = { headerRow: 1, firstRow: 2, columns: {}, headers: {}, extras: [], missing: [], duplicates: [] }
    return { source: "none", error, layout, columns: [], rows: [], skipped: [], nextRow: 2, headerSig: "" }
  }
  const source: SheetModel["source"] = !found ? "fixed" : saved ? "saved" : "detected"
  const layout = (found ?? fallback)!
  const ignored = new Set(source === "saved" ? saved!.ignored : [])
  const mapped = [...Object.values(layout.columns) as number[], ...layout.extras.map((x) => x.col)].sort((a, b) => a - b)
  const rows: number[] = [], skipped: SheetModel["skipped"] = []
  // Labels and totals can sit between the header and the ledger, so a book may say where its ledger starts.
  const first = source === "fixed" || book.overrides.firstRow || !book.starts ? layout.firstRow
    : values.findIndex((raw, i) => i + 1 >= layout.firstRow && book.starts!(raw, layout.columns)) + 1
  values.forEach((raw, i) => {
    const row = i + 1
    if (row < layout.firstRow) return
    if (source === "fixed") {
      if (raw.some((v) => v !== "")) rows.push(row) // the pre-R5 rule: every non-blank row from row 5
      return
    }
    const cells = mapped.map((j) => String(raw[j] ?? "").trim()) // what's past the ledger's bound is never read
    const above = row < first
    const c: RowClass = above ? (cells.some(Boolean) ? { kind: "skip", reason: "Above the first voucher" } : { kind: "skip", reason: "Blank" })
      : ignored.has(row) ? { kind: "skip", reason: "Ignored in Settings" } : book.classify(raw, layout.columns)
    if (c.kind !== "skip") rows.push(row)
    if (c.kind !== "voucher" && c.reason !== "Blank")
      skipped.push({ ...c, row, preview: cells.filter(Boolean).slice(0, 4).join(" · ").slice(0, 80) })
  })

  let nextRow = (rows.at(-1) ?? layout.firstRow - 1) + 1
  while (mapped.some((j) => String(values[nextRow - 1]?.[j] ?? "").trim() !== "")) nextRow++

  // Columns: roles and extras in sheet order, each with its input type and dropdown choices.
  // A column's values on ledger rows, for guessing its type and choices; a column empty on every ledger row (Deposit, whose
  // amounts sit on deposit lines) is guessed from everything below the header instead.
  const sample = (j: number) => {
    const own = rows.slice(-500).map((r) => values[r - 1]?.[j] ?? "")
    return own.some((v) => String(v).trim()) ? own : values.slice(layout.headerRow).slice(-500).map((r) => r[j] ?? "")
  }
  const fieldOf = aliases(book)
  // Option tables: every Selection List column except the role tables. A column's table is the one headed with its
  // role's name in the roles table ("Collection Area"), else with the column's own header, else any alias of its field.
  const tables = lists.filter((l) => !ROLE_HEADERS.has(normalize(l.header)))
  const roleName = new Map(bookRoles(book, lists).roles.map((r) => [r.field, normalize(r.label)]))
  const listOf = (label: string, field: F | null) =>
    (field !== null && tables.find((l) => normalize(l.header) === roleName.get(field))) ||
    tables.find((l) => normalize(l.header) === normalize(label)) ||
    (field !== null ? tables.find((l) => fieldOf.get(normalize(l.header)) === field) : undefined)
  const cols = [
    ...(Object.entries(layout.columns) as [F, number][]).map(([f, col]) => ({ key: f as string, field: f as F | null, label: layout.headers[f] || book.headers[f][0], col })),
    ...layout.extras.map((x) => ({ key: `x:${x.text}`, field: null, label: x.text, col: x.col, custom: !!x.custom })),
  ].sort((a, b) => a.col - b.col)
  const byHeader = cols.some((c) => listOf(c.label, c.field))
  const keys = new Set<string>()
  const columns = cols.map((c): Column<F> => {
    if (keys.has(c.key)) c.key += ` (${colLetter(c.col)})` // two extra columns with the same header
    keys.add(c.key)
    const list = listOf(c.label, c.field) ?? (!byHeader && c.field && book.lists.includes(c.field) ? tables[book.lists.indexOf(c.field)] : undefined)
    const set: ColumnSetting<F> = source === "saved" ? saved!.columns[c.col] ?? {} : {}
    // A column with an option table is a dropdown of that table, unless Settings says otherwise.
    const type = set.type ?? (list ? "dropdown" : (c.field && book.types[c.field]) || inferType(c.label, sample(c.col), false))
    const options = list?.values ?? (type === "dropdown" ? [...new Set(sample(c.col).map((v) => String(v).trim()).filter(Boolean))].sort() : [])
    // A column without a role stays out of forms, lists and reports until Settings shows it.
    const { custom, ...column } = c as typeof c & { custom?: boolean }
    // A column without a role stays out of forms, lists and reports until Settings shows it; a custom role counts as one.
    return { ...column, type, options, visibility: set.visibility ?? (c.field || custom ? "shown" : "hidden") }
  })
  return { source, error, layout, columns, rows, skipped, nextRow, headerSig: headerSig(values[layout.headerRow - 1] ?? [], columns) }
}

// ---- Roles, as the Selection List names them ----

/** Headers of the role tables (normalized), so no role table is ever offered as a dropdown's options. */
const ROLE_HEADERS = new Set(["DVROLES", "DV ROLES", "COLLECTION ROLES"].map(normalize))

export type BookRoles<F extends string> = {
  roles: { field: F | Custom; label: string }[] // in the table's order, labelled as the table spells them; required roles always included
  table: string | null // the role table's header, or null when the Selection List has none (then every field is a role)
  custom: string[] // names in the table that aren't fields the app knows: custom roles, read as named columns
  absent: F[] // fields the table doesn't list (required ones are offered anyway)
}

/** A book's roles from its table in the Selection List (e.g. DVROLES), matched to fields by header text. */
export function bookRoles<F extends string>(book: Pick<Book<F>, "headers" | "required" | "rolesHeader">, lists: List[]): BookRoles<F> {
  const all = (Object.keys(book.headers) as F[])
  const table = lists.find((l) => book.rolesHeader.some((h) => normalize(h) === normalize(l.header)))
  if (!table) return { roles: all.map((f) => ({ field: f, label: book.headers[f][0] })), table: null, custom: [], absent: [] }
  const map = aliases(book)
  const roles: BookRoles<F>["roles"] = [], custom: string[] = []
  for (const name of table.values) {
    const f = map.get(normalize(name)) ?? (`x:${name}` as Custom)
    if (roles.some((r) => r.field === f || normalize(r.label) === normalize(name))) continue
    roles.push({ field: f, label: name })
    if (f.startsWith("x:")) custom.push(name)
  }
  const absent = all.filter((f) => !roles.some((r) => r.field === f))
  for (const f of book.required) if (absent.includes(f)) roles.push({ field: f, label: book.headers[f][0] })
  return { roles, table: table.header, custom, absent }
}

// ---- The disbursement book (the EXP tab) ----

export const DISBURSEMENT: Book<Field> = {
  name: "korphil",
  headers: HEADERS,
  required: REQUIRED,
  bound: "row",
  overrides: OVERRIDES,
  types: TYPE_OVERRIDES,
  lists: LIST_ORDER,
  rolesHeader: ["DVROLES", "DV ROLES"],
  raw: ["dv_no", "check_number", "payee"],
  classify: classifyRow,
  // Labels and totals sit between the header and the ledger, so reading starts at the first row with a date or a DV # in format.
  starts: (raw, columns) => isDate(raw[columns.dv_date ?? -1]) || DV.test(String(raw[columns.dv_no ?? -1] ?? "").trim()),
  fixed: fixedLayout,
}
