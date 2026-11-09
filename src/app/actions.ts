"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { COLLECTION } from "@/lib/collection"
import { getSession } from "@/lib/data"
import { cellOf, DV_FORMAT, FOR_REVIEW, freeDvNo, parseAmount, parseDate, rowSig, sameChoice, sheetDate, todayManila, VERIFIED, type SheetRow } from "@/lib/ledger"
import { SESSION_COOKIE } from "@/lib/session"
import { bookRoles, colLetter, DISBURSEMENT, INPUT_TYPES, VISIBILITY, type Book, type Column, type ColumnSetting, type InputType, type Saved, type SheetModel, type Visibility } from "@/lib/sheet-config"
import { appendRow, appendVoucher, type BookName, fetchRows, fetchVouchers, lastPull, readWith, saveSettings, setDvNo, setStatuses, updateCells, updateVoucherCells } from "@/lib/sheets"

export type Result = { ok: true; message: string } | { ok: false; message: string }
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const isRow = (r: number) => Number.isInteger(r) && r > 0

function refresh() {
  revalidatePath("/", "layout")
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
 * and only the columns that differ from the sheet are written. Argument order suits bind(null, row, dvNo).
 */
export async function saveVoucher(sheetRow: number | null, dvNo: string, form: FormData): Promise<Result> {
  if (sheetRow !== null && !isRow(sheetRow)) return { ok: false, message: "That row isn't a voucher row." }
  const { access_token: token, user } = await getSession()
  const [rows, pullError] = await fetchVouchers(token, true)
  if (pullError) return { ok: false, message: pullError }
  const columns = lastPull().model?.columns ?? []
  const [values, invalid] = clean(form, columns, ["dv_no", "gross_amount"])
  if (invalid) return { ok: false, message: invalid }
  let error: string | null
  if (sheetRow === null) {
    const typed = values.dv_no
    if (DV_FORMAT.test(typed)) values.dv_no = freeDvNo(rows.map((r) => r.dv_no.trim()), typed, parseDate(values.dv_date ?? "") ?? todayManila())
    error = await appendVoucher(token, values, user.email)
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
    error = await updateVoucherCells(token, sheetRow, changed, user.email)
  }
  if (error) return { ok: false, message: error }
  refresh()
  return { ok: true, message: `Saved ${values.dv_no} to the sheet.` }
}

/**
 * The Collection tab re-read fresh, and (for an existing row) that row, which must still hold what the form opened
 * with (sig), so an edit made in the sheet meanwhile is never overwritten.
 */
async function freshEntry(sheetRow: number | null, sig: string) {
  const { access_token: token, user } = await getSession()
  const [rows, pullError] = await fetchRows("collection", token, true)
  const model = lastPull("collection").model
  if (pullError || !model || model.source === "none") return { error: pullError ?? model?.error ?? "Couldn't read the Collection tab. Sync and try again." }
  const row = sheetRow === null ? null : rows.find((r) => r.sheet_row === sheetRow)
  if (row === undefined) return { error: `Row ${sheetRow} isn't a collection row any more. Sync and try again.` }
  if (row && rowSig(row, model.columns) !== sig) return { error: `Row ${sheetRow} changed in the sheet since you opened it. Sync and try again.` }
  return { error: null, token, by: user.email, rows, row, columns: model.columns as Column<string>[] }
}

const orLabel = (orNo: string | undefined) => (orNo?.trim() ? `OR # ${orNo.trim()}` : "the collection")

/**
 * Append (sheetRow null) or update one collection row, the same way as saveVoucher: the tab is re-read first, an
 * update's row must still hold what the form opened with (sig), and only changed cells are written. An OR # already on
 * another row is saved anyway (it's a review flag) and the message says where. Argument order suits bind(null, row, sig).
 */
export async function saveEntry(sheetRow: number | null, sig: string, form: FormData): Promise<Result> {
  if (sheetRow !== null && !isRow(sheetRow)) return { ok: false, message: "That row isn't a collection row." }
  const fresh = await freshEntry(sheetRow, sig)
  if (fresh.error !== null) return { ok: false, message: fresh.error }
  const { token, by, rows, row, columns } = fresh
  const [values, invalid] = clean(form, columns, COLLECTION.required)
  if (invalid) return { ok: false, message: invalid }
  let error: string | null
  if (!row) error = await appendRow("collection", token, values, by)
  else {
    const changed = changedCells(columns, values, row)
    if (!Object.keys(changed).length) return { ok: true, message: `No changes to ${orLabel(values.or_no)}.` }
    error = await updateCells("collection", token, row.sheet_row, changed, by)
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
export async function deleteEntry(sheetRow: number, sig: string): Promise<Result> {
  if (!isRow(sheetRow)) return { ok: false, message: "That row isn't a collection row." }
  const fresh = await freshEntry(sheetRow, sig)
  if (fresh.error !== null) return { ok: false, message: fresh.error }
  const { token, by, row, columns } = fresh
  const cleared = Object.fromEntries(columns.filter((c) => c.visibility === "shown" && cellOf(row!, c).trim()).map((c) => [c.key, ""]))
  const error = await updateCells("collection", token, sheetRow, cleared, by)
  if (error) return { ok: false, message: error }
  refresh()
  return { ok: true, message: `Deleted ${orLabel(row!.or_no)} (row ${sheetRow} cleared).` }
}

/** Mark many rows Verified (or back to For Review) in the status column. */
export async function setStatus(sheetRows: number[], verified: boolean): Promise<Result> {
  if (!sheetRows.length || !sheetRows.every(isRow)) return { ok: false, message: "Those rows aren't voucher rows." }
  const status = verified ? VERIFIED : FOR_REVIEW
  const { access_token: token, user } = await getSession()
  const error = await setStatuses(token, sheetRows, status, user.email)
  if (error) return { ok: false, message: error }
  refresh()
  return { ok: true, message: `Marked ${sheetRows.length} voucher${sheetRows.length === 1 ? "" : "s"} ${status}.` }
}

/**
 * Change one row's DV # (that cell only) from `from` to `to`. The sheet is re-read first: the row must still hold
 * `from`, and a `to` someone else just used becomes the next free number (dvNo says which was written).
 * restore (undo) puts back an old number as is, duplicate or not.
 */
export async function renumberVoucher(sheetRow: number, from: string, to: string, restore = false): Promise<Result & { dvNo?: string }> {
  if (!isRow(sheetRow)) return { ok: false, message: "That row isn't a voucher row." }
  if (!(restore ? to.trim() : DV_FORMAT.test(to))) return { ok: false, message: "Use the format 06-YYYY-MM-00000." }
  const { access_token: token, user } = await getSession()
  const [rows, error] = await fetchVouchers(token, true)
  if (error) return { ok: false, message: error }
  const row = rows.find((r) => r.sheet_row === sheetRow)
  if (!row || row.dv_no.trim() !== from.trim()) return { ok: false, message: `Row ${sheetRow} no longer holds ${from}. Sync and try again.` }
  const used = rows.map((r) => r.dv_no.trim())
  const dvNo = restore ? to.trim() : freeDvNo(used, to, parseDate(row.dv_date) ?? todayManila())
  const failed = await setDvNo(token, sheetRow, dvNo, user.email)
  if (failed) return { ok: false, message: failed }
  refresh()
  return { ok: true, message: dvNo === to.trim() ? `Row ${sheetRow} is now ${dvNo}.` : `${to} was just taken; used ${dvNo}.`, dvNo }
}

export async function sync(): Promise<Result> {
  const [, error] = await fetchVouchers((await getSession()).access_token, true)
  if (error) return { ok: false, message: error }
  refresh()
  return { ok: true, message: `Pulled ${lastPull().rows} rows from the sheet.` }
}

export async function syncCollections(): Promise<Result> {
  const [rows, error] = await fetchRows("collection", (await getSession()).access_token, true)
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
  const { access_token: token, user } = await getSession()
  const [, pullError] = await fetchRows(name as BookName, token, true) // fresh settings and values to check against
  if (pullError) return { ok: false, message: pullError }
  if (intent === "reset") {
    const error = await saveSettings(token, null, name as BookName)
    if (error) return { ok: false, message: error }
    await fetchRows(name as BookName, token, true)
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
  const custom = new Set(bookRoles(book, lastPull(name as BookName).lists).custom.map((n) => `x:${n}`)) // as the roles table names them
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

  const model = readWith(saved as Saved<never>, name as BookName) as SheetModel<string>
  if (model.source !== "saved") return { ok: false, message: `Can't use these settings: ${model.error}` }
  const unshown = (book.required as string[]).filter((f) => model.columns.find((c) => c.field === f)?.visibility !== "shown")
  if (unshown.length) return { ok: false, message: `${unshown.map((f) => model.columns.find((c) => c.field === f)?.label ?? f).join(", ")} must stay shown.` }
  const summary = `${model.rows.length} ${noun} read, ${saved.ignored.length} row${saved.ignored.length === 1 ? "" : "s"} ignored, all required roles mapped.`
  if (intent !== "save") return { ok: true, message: summary }
  const error = await saveSettings(token, saved, name as BookName)
  if (error) return { ok: false, message: error }
  await fetchRows(name as BookName, token, true)
  refresh()
  return { ok: true, message: `Saved. ${summary}` }
}

export async function signOut() {
  ;(await cookies()).delete(SESSION_COOKIE)
  redirect("/login/")
}
