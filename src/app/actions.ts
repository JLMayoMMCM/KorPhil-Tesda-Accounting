"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { COLLECTION } from "@/lib/collection"
import { getSession, getSource, YEAR_COOKIE } from "@/lib/data"
import { cellOf, DV_FORMAT, FOR_REVIEW, freeDvNo, parseAmount, parseDate, rowSig, sameChoice, sheetDate, todayManila, VERIFIED, type SheetRow } from "@/lib/ledger"
import { COLLECTION_HOME, VOUCHER_HOME } from "@/lib/nav"
import { SESSION_COOKIE } from "@/lib/session"
import { bookRoles, colLetter, DISBURSEMENT, INPUT_TYPES, VISIBILITY, type Book, type Column, type ColumnSetting, type InputType, type Saved, type SheetModel, type Visibility } from "@/lib/sheet-config"
import { cleanLayout } from "@/lib/dashboard"
import { appendRow, type BookName, DEFAULT_TAB, fetchRows, readOnlyMessage, readWith, saveDashboard, saveSettings, setDvNo, setStatuses, updateCells, writeCells } from "@/lib/sheets"
import { MODULE_NAMES, STATUSES, YEAR, type Status } from "@/lib/years"
import { addYear, changeYear, previewSheet, type Preview } from "@/lib/years-sheet"

export type Result = { ok: true; message: string } | { ok: false; message: string }
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const isRow = (r: number) => Number.isInteger(r) && r > 0

function refresh() {
  revalidatePath("/", "layout")
}

/**
 * The signed-in user and where a module reads for their year. sheet: the spreadsheet the page was showing; a write
 * is refused if the year was switched since (in another tab), so it can never land in a different year's sheet.
 */
async function target<N extends BookName>(name: N, sheet?: string) {
  const { access_token: token, user } = await getSession()
  const { source: src } = await getSource(name)
  const error = sheet !== undefined && sheet !== src.id ? "The year was switched in another tab. Reload this page and try again." : null
  return { token, user, src, error }
}

/**
 * Validate a posted form: sheet-ready values by column key (shown columns only), or an error message.
 * required: column keys that can't be blank. Money must parse; dates must read as dates.
 */
function clean(form: FormData, columns: Column<string>[], required: string[]): [Record<string, string>, string | null] {
  const values: Record<string, string> = {}
  for (const c of columns) {
    if (c.visibility !== "shown") continue // read-only and hidden columns are never written
    let v = String(form.get(c.key) ?? "").trim()
    if (c.type === "date" && ISO_DATE.test(v)) v = sheetDate(v)
    values[c.key] = v
  }
  for (const c of columns) {
    const v = values[c.key]
    if (v === undefined) continue
    if (!v && required.includes(c.key)) return [values, `${c.label} is required.`]
    if (v && c.type === "money" && parseAmount(v) === null) return [values, `${c.label} must be a number, like 12,500.00.`]
    if (v && c.type === "date" && !parseDate(v)) return [values, `${c.label} must be a date.`]
  }
  return [values, null]
}

/** The posted values that differ from the row as pulled (dropdowns compared regardless of case). */
function changedCells(columns: Column<string>[], values: Record<string, string>, row: SheetRow) {
  const differs = (c: Column<string>) => (c.type === "dropdown" ? !sameChoice(values[c.key], cellOf(row, c)) : values[c.key] !== cellOf(row, c))
  return Object.fromEntries(columns.filter((c) => c.key in values && differs(c)).map((c) => [c.key, values[c.key]]))
}

/**
 * Append (sheetRow null) or update one voucher row. The sheet is re-read first. An append whose DV # someone else
 * just used takes the next free number. An update's row must still hold `dvNo` (its DV # when the form opened),
 * and only the columns that differ from the sheet are written. Argument order suits bind(null, sheet, row, dvNo).
 */
export async function saveVoucher(sheet: string, sheetRow: number | null, dvNo: string, form: FormData): Promise<Result> {
  if (sheetRow !== null && !isRow(sheetRow)) return { ok: false, message: "That row isn't a voucher row." }
  const { token, user, src, error: switched } = await target("voucher", sheet)
  if (switched) return { ok: false, message: switched }
  if (src.readOnly) return { ok: false, message: readOnlyMessage(src) }
  const [rows, pullError, pull] = await fetchRows(src, token, true)
  if (pullError) return { ok: false, message: pullError }
  const columns = pull.model?.columns ?? []
  const [values, invalid] = clean(form, columns, ["dv_no", "gross_amount"])
  if (invalid) return { ok: false, message: invalid }
  let error: string | null
  if (sheetRow === null) {
    const typed = values.dv_no
    if (DV_FORMAT.test(typed)) values.dv_no = freeDvNo(rows.map((r) => r.dv_no.trim()), typed, parseDate(values.dv_date ?? "") ?? todayManila())
    error = await appendRow(src, token, values, user.email)
    if (!error && values.dv_no !== typed) {
      refresh()
      return { ok: true, message: `${typed} was already taken; saved as ${values.dv_no}.` }
    }
  } else {
    const row = rows.find((r) => r.sheet_row === sheetRow)
    if (!row || row.dv_no.trim() !== dvNo.trim())
      return { ok: false, message: `Row ${sheetRow} no longer holds ${dvNo.trim() || "this voucher"}. Sync and try again.` }
    const changed = changedCells(columns, values, row)
    if (!Object.keys(changed).length) return { ok: true, message: `No changes to ${values.dv_no}.` }
    error = await updateCells(src, token, sheetRow, changed, user.email)
  }
  if (error) return { ok: false, message: error }
  refresh()
  return { ok: true, message: `Saved ${values.dv_no} to the sheet.` }
}

/**
 * The Collection tab re-read fresh, and (for an existing row) that row, which must still hold what the form opened
 * with (sig), so an edit made in the sheet meanwhile is never overwritten.
 */
async function freshEntry(sheet: string, sheetRow: number | null, sig: string) {
  const { token, user, src, error: switched } = await target("collection", sheet)
  if (switched) return { error: switched }
  if (src.readOnly) return { error: readOnlyMessage(src) }
  const [rows, pullError, pull] = await fetchRows(src, token, true)
  const model = pull.model
  if (pullError || !model || model.source === "none") return { error: pullError ?? model?.error ?? "Couldn't read the Collection tab. Sync and try again." }
  const row = sheetRow === null ? null : rows.find((r) => r.sheet_row === sheetRow)
  if (row === undefined) return { error: `Row ${sheetRow} isn't a collection row any more. Sync and try again.` }
  if (row && rowSig(row, model.columns) !== sig) return { error: `Row ${sheetRow} changed in the sheet since you opened it. Sync and try again.` }
  return { error: null, src, token, by: user.email, rows, row, columns: model.columns as Column<string>[] }
}

const orLabel = (orNo: string | undefined) => (orNo?.trim() ? `OR # ${orNo.trim()}` : "the collection")

/**
 * Append (sheetRow null) or update one collection row, the same way as saveVoucher: the tab is re-read first, an
 * update's row must still hold what the form opened with (sig), and only changed cells are written. An OR # already on
 * another row is saved anyway (it's a review flag) and the message says where. Argument order suits bind(null, sheet, row, sig).
 */
export async function saveEntry(sheet: string, sheetRow: number | null, sig: string, form: FormData): Promise<Result> {
  if (sheetRow !== null && !isRow(sheetRow)) return { ok: false, message: "That row isn't a collection row." }
  const fresh = await freshEntry(sheet, sheetRow, sig)
  if (fresh.error !== null) return { ok: false, message: fresh.error }
  const { src, token, by, rows, row, columns } = fresh
  const [values, invalid] = clean(form, columns, COLLECTION.required)
  if (invalid) return { ok: false, message: invalid }
  let error: string | null
  if (!row) error = await appendRow(src, token, values, by)
  else {
    const changed = changedCells(columns, values, row)
    if (!Object.keys(changed).length) return { ok: true, message: `No changes to ${orLabel(values.or_no)}.` }
    error = await updateCells(src, token, row.sheet_row, changed, by)
  }
  if (error) return { ok: false, message: error }
  refresh()
  const twin = values.or_no ? rows.find((r) => r.sheet_row !== sheetRow && r.or_no.trim() === values.or_no) : undefined
  return { ok: true, message: `Saved ${orLabel(values.or_no)} to the sheet.${twin ? ` The same OR # is on row ${twin.sheet_row}.` : ""}` }
}

/**
 * Delete one collection row by clearing its ledger cells. The row itself stays, and so do the cells past the ledger
 * (Deposit, Undeposited, the summary tables), so formulas beside it keep working. Read-only and hidden columns are left
 * as they are. Each cleared cell is logged with its old value, like any write.
 */
export async function deleteEntry(sheet: string, sheetRow: number, sig: string): Promise<Result> {
  if (!isRow(sheetRow)) return { ok: false, message: "That row isn't a collection row." }
  const fresh = await freshEntry(sheet, sheetRow, sig)
  if (fresh.error !== null) return { ok: false, message: fresh.error }
  const { src, token, by, row, columns } = fresh
  const cleared = Object.fromEntries(columns.filter((c) => c.visibility === "shown" && cellOf(row!, c).trim()).map((c) => [c.key, ""]))
  const error = await updateCells(src, token, sheetRow, cleared, by)
  if (error) return { ok: false, message: error }
  refresh()
  return { ok: true, message: `Deleted ${orLabel(row!.or_no)} (row ${sheetRow} cleared).` }
}

/** Mark many rows Verified (or back to For Review) in the status column of the sheet the page showed. */
export async function setStatus(sheet: string, sheetRows: number[], verified: boolean): Promise<Result> {
  if (!sheetRows.length || !sheetRows.every(isRow)) return { ok: false, message: "Those rows aren't voucher rows." }
  const status = verified ? VERIFIED : FOR_REVIEW
  const { token, user, src, error: switched } = await target("voucher", sheet)
  if (switched) return { ok: false, message: switched }
  const error = await setStatuses(src, token, sheetRows, status, user.email)
  if (error) return { ok: false, message: error }
  refresh()
  return { ok: true, message: `Marked ${sheetRows.length} voucher${sheetRows.length === 1 ? "" : "s"} ${status}.` }
}

/**
 * Delete many voucher rows by clearing their ledger cells, like deleteEntry: the rows stay, so formulas beside them
 * keep working, and read-only and hidden columns are left as they are. The sheet is re-read first and each row must
 * still hold the DV # the page showed. One request; each cleared cell is logged with its old value.
 */
export async function deleteVouchers(sheet: string, picked: { sheet_row: number; dv_no: string }[]): Promise<Result> {
  if (!picked.length || !picked.every((p) => isRow(p.sheet_row))) return { ok: false, message: "Those rows aren't voucher rows." }
  const { token, user, src, error: switched } = await target("voucher", sheet)
  if (switched) return { ok: false, message: switched }
  if (src.readOnly) return { ok: false, message: readOnlyMessage(src) }
  const [rows, pullError, pull] = await fetchRows(src, token, true)
  if (pullError) return { ok: false, message: pullError }
  const shown = (pull.model?.columns ?? []).filter((c) => c.visibility === "shown")
  const cells = []
  for (const p of picked) {
    const row = rows.find((r) => r.sheet_row === p.sheet_row)
    if (!row || row.dv_no.trim() !== p.dv_no.trim())
      return { ok: false, message: `Row ${p.sheet_row} no longer holds ${p.dv_no.trim() || "that voucher"}. Sync and try again.` }
    for (const c of shown) if (cellOf(row, c).trim()) cells.push({ row: p.sheet_row, key: c.key, value: "" })
  }
  const error = await writeCells(src, token, cells, user.email)
  if (error) return { ok: false, message: error }
  refresh()
  return { ok: true, message: `Deleted ${picked.length} voucher${picked.length === 1 ? "" : "s"}.` }
}

/**
 * Change one row's DV # (that cell only) from `from` to `to`. The sheet is re-read first: the row must still hold
 * `from`, and a `to` someone else just used becomes the next free number (dvNo says which was written).
 * restore (undo) puts back an old number as is, duplicate or not.
 */
export async function renumberVoucher(sheetRow: number, from: string, to: string, restore = false): Promise<Result & { dvNo?: string }> {
  if (!isRow(sheetRow)) return { ok: false, message: "That row isn't a voucher row." }
  if (!(restore ? to.trim() : DV_FORMAT.test(to))) return { ok: false, message: "Use the format 06-YYYY-MM-00000." }
  const { token, user, src } = await target("voucher")
  if (src.readOnly) return { ok: false, message: readOnlyMessage(src) }
  const [rows, error] = await fetchRows(src, token, true)
  if (error) return { ok: false, message: error }
  const row = rows.find((r) => r.sheet_row === sheetRow)
  if (!row || row.dv_no.trim() !== from.trim()) return { ok: false, message: `Row ${sheetRow} no longer holds ${from}. Sync and try again.` }
  const used = rows.map((r) => r.dv_no.trim())
  const dvNo = restore ? to.trim() : freeDvNo(used, to, parseDate(row.dv_date) ?? todayManila())
  const failed = await setDvNo(src, token, sheetRow, dvNo, user.email)
  if (failed) return { ok: false, message: failed }
  refresh()
  return { ok: true, message: dvNo === to.trim() ? `Row ${sheetRow} is now ${dvNo}.` : `${to} was just taken; used ${dvNo}.`, dvNo }
}

/** Save the signed-in person's dashboard layout for a module in its year's spreadsheet (the browser keeps a copy too). */
export async function saveDashboardLayout(name: BookName, sheet: string, layout: unknown): Promise<Result> {
  if (name !== "voucher" && name !== "collection") return { ok: false, message: "Not saved: unknown dashboard." }
  const clean = cleanLayout(layout)
  if (!clean) return { ok: false, message: "Not saved: that layout couldn't be read." }
  const { token, user, src, error } = await target(name, sheet)
  if (error) return { ok: false, message: error }
  const failed = await saveDashboard(src, token, user.email, clean)
  return failed ? { ok: false, message: failed } : { ok: true, message: "Layout saved" }
}

export async function sync(): Promise<Result> {
  const { token, src } = await target("voucher")
  const [, error, pull] = await fetchRows(src, token, true)
  if (error) return { ok: false, message: error }
  refresh()
  return { ok: true, message: `Pulled ${pull.rows} rows from the sheet.` }
}

export async function syncCollections(): Promise<Result> {
  const { token, src } = await target("collection")
  const [rows, error] = await fetchRows(src, token, true)
  if (error) return { ok: false, message: error }
  refresh()
  return { ok: true, message: `Pulled ${rows.length} entries from the sheet.` }
}

export type LayoutResult = { ok: boolean; message: string } | null

// The books Settings can edit, and what their rows are called.
const BOOKS: Record<BookName, { book: Book<string>; noun: string }> = {
  voucher: { book: DISBURSEMENT as Book<string>, noun: "vouchers" },
  collection: { book: COLLECTION as unknown as Book<string>, noun: "entries" },
}

/**
 * Settings editor: check, save or reset the layout settings stored in the spreadsheet.
 * Saving needs edit access to the sheet (Google refuses a Viewer), and every required role mapped and shown.
 */
export async function layoutAction(_: LayoutResult, form: FormData): Promise<LayoutResult> {
  const intent = String(form.get("intent"))
  const name = String(form.get("book"))
  if (!(name in BOOKS)) return { ok: false, message: "Unknown sheet." }
  const { book, noun } = BOOKS[name as BookName]
  const { token, user, src, error: switched } = await target(name as BookName, String(form.get("sheet") ?? ""))
  if (switched) return { ok: false, message: switched }
  const [, pullError, pull] = await fetchRows(src, token, true) // fresh settings and values to check against
  if (pullError) return { ok: false, message: pullError }
  if (intent === "reset") {
    const error = await saveSettings(src, token, null)
    if (error) return { ok: false, message: error }
    await fetchRows(src, token, true)
    refresh()
    return { ok: true, message: "Settings removed. The layout is auto-detected again." }
  }

  const saved: Saved<string> = {
    headerRow: Number(form.get("header")) || null,
    ignored: [...new Set([...form.getAll("ignore"), ...String(form.get("ignore-more") ?? "").split(/[\s,]+/)].map(Number).filter(isRow))],
    columns: {},
    by: user.email,
    at: new Date().toISOString(),
  }
  const custom = new Set(bookRoles(book, pull.lists).custom.map((n) => `x:${n}`)) // as the roles table names them
  for (const [key, value] of form) {
    const m = /^(role|type|vis)-(\d+)$/.exec(key)
    if (!m || !value) continue
    const v = String(value), set: ColumnSetting<string> = (saved.columns[Number(m[2])] ??= {})
    if (m[1] === "role" && (v === "none" || v in book.headers || custom.has(v))) set.role = v as ColumnSetting<string>["role"]
    if (m[1] === "type" && v in INPUT_TYPES) set.type = v as InputType
    if (m[1] === "vis" && v in VISIBILITY) set.visibility = v as Visibility
    if (!Object.keys(set).length) delete saved.columns[Number(m[2])]
  }
  // A role can be on one column only.
  const on = new Map<string, number>()
  for (const [c, s] of Object.entries(saved.columns)) {
    if (!s.role || s.role === "none") continue
    const other = on.get(s.role)
    if (other !== undefined) return { ok: false, message: `${book.headers[s.role]?.[0] ?? s.role.replace(/^x:/, "")} is set on columns ${colLetter(other)} and ${colLetter(Number(c))}. A role can be on one column only.` }
    on.set(s.role, Number(c))
  }

  const model = readWith(saved as Saved<never>, src) as SheetModel<string>
  if (model.source !== "saved") return { ok: false, message: `Can't use these settings: ${model.error}` }
  const unshown = (book.required as string[]).filter((f) => model.columns.find((c) => c.field === f)?.visibility !== "shown")
  if (unshown.length) return { ok: false, message: `${unshown.map((f) => model.columns.find((c) => c.field === f)?.label ?? f).join(", ")} must stay shown.` }
  const summary = `${model.rows.length} ${noun} read, ${saved.ignored.length} row${saved.ignored.length === 1 ? "" : "s"} ignored, all required roles mapped.`
  if (intent !== "save") return { ok: true, message: summary }
  const error = await saveSettings(src, token, saved)
  if (error) return { ok: false, message: error }
  await fetchRows(src, token, true)
  refresh()
  return { ok: true, message: `Saved. ${summary}` }
}

/** Open one year's spreadsheet in a module (the home page's Open buttons). Every page and export then reads that year. */
export async function openYear(year: string, module: string) {
  if (!YEAR.test(year) || !isBook(module)) return
  ;(await cookies()).set(YEAR_COOKIE, year, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 400 })
  refresh()
  redirect(module === "voucher" ? VOUCHER_HOME : COLLECTION_HOME)
}

// ---- Data sources: the Years list. Writing it needs edit access to the main spreadsheet; Google enforces that. ----

const isBook = (v: string): v is BookName => v === "voucher" || v === "collection"
export type SourceResult = { ok: boolean; message: string; preview?: Preview } | null

/**
 * Data sources → Add a year: one spreadsheet holding both tabs. "check" opens the link and previews each tab; "save"
 * checks again and lists the year for both modules. A blank tab leaves that module out (it can live in another file).
 */
export async function sourceAction(_: SourceResult, form: FormData): Promise<SourceResult> {
  const year = String(form.get("year") ?? "").trim(), link = String(form.get("link") ?? "").trim()
  const status = String(form.get("status") ?? "Active") as Status
  const books = (["voucher", "collection"] as const).map((b) => [b, String(form.get(`tab-${b}`) ?? "").trim()] as const).filter(([, tab]) => tab)
  if (!YEAR.test(year)) return { ok: false, message: "Enter the year as four digits, like 2026." }
  if (!books.length) return { ok: false, message: "Enter the Disbursement tab, the Collection tab, or both." }
  if (!STATUSES.includes(status)) return { ok: false, message: "Pick a status." }
  const { access_token: token, user } = await getSession()
  const previews = await Promise.all(books.map(([b, tab]) => previewSheet(b, token, link, tab)))
  const bad = previews.findIndex((p) => p.error)
  if (bad >= 0) return { ok: false, message: `${MODULE_NAMES[books[bad][0]]}: ${previews[bad].error}`, preview: previews[bad] }
  const found = `${previews[0].title}: ${books.map(([b], i) => `${previews[i].tab} tab, header on row ${previews[i].headerRow}, ${previews[i].rows} ${b === "voucher" ? "vouchers" : "entries"}`).join("; ")}.`
  if (form.get("intent") !== "save") return { ok: true, message: found, preview: previews[0] }
  const added: string[] = []
  for (const [i, [b]] of books.entries()) {
    const error = await addYear(token, { year, module: b, link, tab: previews[i].tab === DEFAULT_TAB[b] ? "" : previews[i].tab, status }, user.email)
    if (error) {
      if (added.length) refresh()
      return { ok: false, message: added.length ? `Added ${added.join(" and ")}, but not ${MODULE_NAMES[b]}: ${error}` : error, preview: previews[i] }
    }
    added.push(`${year} ${MODULE_NAMES[b]}`)
  }
  refresh()
  return { ok: true, message: `Added ${added.join(" and ")}. ${found}` }
}

/** Data sources → one row: set its status, change its link or tab, or remove it from the list. Bound to the row as listed. */
export async function yearRowAction(row: number, year: string, module: string, form: FormData): Promise<Result> {
  if (!isRow(row) || !isBook(module)) return { ok: false, message: "That isn't a Years row." }
  const { access_token: token, user } = await getSession()
  const intent = String(form.get("intent"))
  let change: Parameters<typeof changeYear>[3]
  if (intent === "remove") change = "remove"
  else if (intent === "status") {
    const status = String(form.get("status")) as Status
    if (!STATUSES.includes(status)) return { ok: false, message: "Pick a status." }
    change = { status }
  } else if (intent === "link") {
    const link = String(form.get("link") ?? "").trim(), tab = String(form.get("tab") ?? "").trim()
    const preview = await previewSheet(module, token, link, tab)
    if (preview.error) return { ok: false, message: preview.error }
    change = { link, tab: preview.tab === DEFAULT_TAB[module] ? "" : preview.tab }
  } else return { ok: false, message: "Unknown change." }
  const error = await changeYear(token, row, { year, module }, change, user.email)
  if (error) return { ok: false, message: error }
  refresh()
  return {
    ok: true,
    message: change === "remove" ? `Removed ${year} ${MODULE_NAMES[module]} from the list. The spreadsheet itself is unchanged.` : `Saved ${year} ${MODULE_NAMES[module]}.`,
  }
}

export async function signOut() {
  ;(await cookies()).delete(SESSION_COOKIE)
  redirect("/login/")
}
