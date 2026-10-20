"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { getSession } from "@/lib/data"
import { DV_FORMAT, FIELDS, FOR_REVIEW, nextDvNo, parseAmount, parseDate, sheetDate, todayManila, VERIFIED, type RawVoucher } from "@/lib/ledger"
import { SESSION_COOKIE } from "@/lib/session"
import { INPUT_TYPES, REQUIRED, VISIBILITY, type Column, type ColumnSetting, type InputType, type Saved, type Visibility } from "@/lib/sheet-config"
import { appendVoucher, fetchVouchers, lastPull, readWith, saveSettings, setDvNo, setStatuses, updateVoucherCells } from "@/lib/sheets"

export type Result = { ok: true; message: string } | { ok: false; message: string }
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const isRow = (r: number) => Number.isInteger(r) && r > 0

function refresh() {
  revalidatePath("/", "layout")
}

/** Validate a posted voucher: sheet-ready values by column key (shown columns only), or an error message. */
function clean(form: FormData, columns: Column[]): [Record<string, string>, string | null] {
  const values: Record<string, string> = {}
  for (const c of columns) {
    if (c.visibility !== "shown") continue // read-only and hidden columns are never written
    let v = String(form.get(c.key) ?? "").trim()
    if (c.type === "date" && ISO_DATE.test(v)) v = sheetDate(v)
    if (c.field === "status" && v !== VERIFIED) v = FOR_REVIEW
    values[c.key] = v
  }
  if (!values.dv_no) return [values, "DV # is required."]
  if (!values.gross_amount || parseAmount(values.gross_amount) === null) return [values, "Gross amount must be a number, like 12,500.00."]
  return [values, null]
}

const current = (r: RawVoucher, c: Column) => (c.field ? r[c.field] : r.extra?.[c.key] ?? "")

/**
 * Append (sheetRow null) or update one voucher row. An update re-reads the sheet first: the row must still hold
 * `dvNo` (its DV # when the form opened), and only the columns that differ from the sheet are written.
 */
export async function saveVoucher(sheetRow: number | null, form: FormData, dvNo = ""): Promise<Result> {
  if (sheetRow !== null && !isRow(sheetRow)) return { ok: false, message: "That row isn't a voucher row." }
  const { access_token: token, user } = await getSession()
  const [rows, pullError] = await fetchVouchers(token, sheetRow !== null)
  if (pullError) return { ok: false, message: pullError }
  const columns = lastPull().model?.columns ?? []
  const [values, invalid] = clean(form, columns)
  if (invalid) return { ok: false, message: invalid }
  let error: string | null
  if (sheetRow === null) error = await appendVoucher(token, values, user.email)
  else {
    const row = rows.find((r) => r.sheet_row === sheetRow)
    if (!row || row.dv_no.trim() !== dvNo.trim())
      return { ok: false, message: `Row ${sheetRow} no longer holds ${dvNo.trim() || "this voucher"}. Sync and try again.` }
    const changed = Object.fromEntries(columns.filter((c) => c.key in values && values[c.key] !== current(row, c)).map((c) => [c.key, values[c.key]]))
    if (!Object.keys(changed).length) return { ok: true, message: `No changes to ${values.dv_no}.` }
    error = await updateVoucherCells(token, sheetRow, changed, user.email)
  }
  if (error) return { ok: false, message: error }
  refresh()
  return { ok: true, message: `Saved ${values.dv_no} to the sheet.` }
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
  const dvNo = restore || !used.includes(to) ? to.trim() : nextDvNo(used, parseDate(row.dv_date) ?? todayManila())
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

export type LayoutResult = { ok: boolean; message: string } | null

/**
 * Settings editor: check, save or reset the layout settings stored in the spreadsheet.
 * Saving needs edit access to the sheet (Google refuses a Viewer), and every required role mapped and shown.
 */
export async function layoutAction(_: LayoutResult, form: FormData): Promise<LayoutResult> {
  const intent = String(form.get("intent"))
  const { access_token: token, user } = await getSession()
  const [, pullError] = await fetchVouchers(token, true) // fresh settings and values to check against
  if (pullError) return { ok: false, message: pullError }
  if (intent === "reset") {
    const error = await saveSettings(token, null)
    if (error) return { ok: false, message: error }
    await fetchVouchers(token, true)
    refresh()
    return { ok: true, message: "Settings removed. The layout is auto-detected again." }
  }

  const saved: Saved = {
    headerRow: Number(form.get("header")) || null,
    ignored: [...new Set([...form.getAll("ignore"), ...String(form.get("ignore-more") ?? "").split(/[\s,]+/)].map(Number).filter(isRow))],
    columns: {},
    by: user.email,
    at: new Date().toISOString(),
  }
  for (const [name, value] of form) {
    const m = /^(role|type|vis)-(\d+)$/.exec(name)
    if (!m || !value) continue
    const v = String(value), set: ColumnSetting = (saved.columns[Number(m[2])] ??= {})
    if (m[1] === "role" && (v === "none" || (FIELDS as string[]).includes(v))) set.role = v as ColumnSetting["role"]
    if (m[1] === "type" && v in INPUT_TYPES) set.type = v as InputType
    if (m[1] === "vis" && v in VISIBILITY) set.visibility = v as Visibility
    if (!Object.keys(set).length) delete saved.columns[Number(m[2])]
  }

  const model = readWith(saved)
  if (model.source !== "saved") return { ok: false, message: `Can't use these settings: ${model.error}` }
  const unshown = REQUIRED.filter((f) => model.columns.find((c) => c.field === f)?.visibility !== "shown")
  if (unshown.length) return { ok: false, message: `${unshown.map((f) => model.columns.find((c) => c.field === f)?.label ?? f).join(", ")} must stay shown.` }
  const summary = `${model.vouchers.length} vouchers read, ${saved.ignored.length} row${saved.ignored.length === 1 ? "" : "s"} ignored, all required roles mapped.`
  if (intent !== "save") return { ok: true, message: summary }
  const error = await saveSettings(token, saved)
  if (error) return { ok: false, message: error }
  await fetchVouchers(token, true)
  refresh()
  return { ok: true, message: `Saved. ${summary}` }
}

export async function signOut() {
  ;(await cookies()).delete(SESSION_COOKIE)
  redirect("/login/")
}
