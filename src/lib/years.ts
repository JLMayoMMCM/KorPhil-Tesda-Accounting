// The Years list: one row per spreadsheet (year, module, link, tab, status), kept in a "Years" tab of the main
// spreadsheet. Pure parsing and picking here (tested); reading and writing the tab is in years-sheet.ts.
import type { BookName } from "./sheets.ts"

export const YEARS_TAB = "Years"
export const YEARS_HEADER = ["Year", "Module", "Spreadsheet link", "Tab", "Status", "Added by", "Added on"] as const
export const STATUSES = ["Active", "Read-only", "Hidden"] as const
export type Status = (typeof STATUSES)[number]
export const MODULE_NAMES: Record<BookName, string> = { voucher: "Disbursement", collection: "Collection" }
export const YEAR = /^\d{4}$/

/** One row of the Years tab. id is "" when the link isn't a Google Sheets link; tab "" means the module's default tab. */
export type YearRow = { row: number; year: string; module: BookName; link: string; id: string; tab: string; status: Status; by: string; on: string }

// Only docs.google.com spreadsheet links are taken, and only their ID is kept: the app never fetches any other address.
const SHEET_LINK = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})(?:[/?#]|$)/
/** The spreadsheet ID in a Google Sheets link, or null. */
export const sheetIdOf = (link: string) => SHEET_LINK.exec(link.trim())?.[1] ?? null

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase()
const moduleOf = (v: unknown): BookName | null => (/^disb|^voucher|^dv\b/.test(norm(v)) ? "voucher" : /^coll/.test(norm(v)) ? "collection" : null)
const statusOf = (v: unknown): Status => STATUSES.find((s) => norm(s) === norm(v).replace(/\s+/g, "-")) ?? "Active"

/** Each header's column in the Years tab's first row (any order; a missing one is -1). */
export function yearsColumns(header: unknown[]) {
  const at = (name: string) => header.findIndex((h) => norm(h) === name.toLowerCase())
  return { year: at("Year"), module: at("Module"), link: at("Spreadsheet link"), tab: at("Tab"), status: at("Status"), by: at("Added by"), on: at("Added on") }
}

/** The Years tab's rows (row 1 is the header). Rows without a year or a known module are left out. */
export function parseYears(values: unknown[][]): YearRow[] {
  const col = yearsColumns(values[0] ?? [])
  if (col.year < 0 || col.module < 0 || col.link < 0) return []
  const cell = (r: unknown[], i: number) => (i < 0 ? "" : String(r[i] ?? "").trim())
  return values.slice(1).flatMap((r, i) => {
    const year = cell(r, col.year), book = moduleOf(cell(r, col.module)), link = cell(r, col.link)
    if (!YEAR.test(year) || !book) return []
    return [{ row: i + 2, year, module: book, link, id: sheetIdOf(link) ?? "", tab: cell(r, col.tab), status: statusOf(cell(r, col.status)), by: cell(r, col.by), on: cell(r, col.on) }]
  })
}

/** A module's years the picker offers, newest first: not Hidden, with a usable link, one row per year (the first). */
export function yearsFor(rows: YearRow[], module: BookName): YearRow[] {
  const seen = new Set<string>()
  return rows
    .filter((r) => r.module === module && r.status !== "Hidden" && r.id)
    .sort((a, b) => b.year.localeCompare(a.year) || a.row - b.row)
    .filter((r) => !seen.has(r.year) && !!seen.add(r.year))
}

/** The year to show: the one asked for if the module has it, else the newest Active one, else the newest. null if none. */
export function pickYear(rows: YearRow[], module: BookName, wanted: string): YearRow | null {
  const list = yearsFor(rows, module)
  return list.find((r) => r.year === wanted) ?? list.find((r) => r.status === "Active") ?? list[0] ?? null
}
