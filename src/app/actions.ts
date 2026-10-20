"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { getSession } from "@/lib/data"
import { DV_FORMAT, FIELDS, FOR_REVIEW, nextDvNo, parseAmount, parseDate, sheetDate, todayManila, VERIFIED, type Field } from "@/lib/ledger"
import { SESSION_COOKIE } from "@/lib/session"
import { appendVoucher, fetchVouchers, FIRST_ROW, lastPull, setDvNo, setStatuses, updateVoucherRow } from "@/lib/sheets"

export type Result = { ok: true; message: string } | { ok: false; message: string }
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function refresh() {
  revalidatePath("/", "layout")
}

/** Validate a posted voucher: sheet-ready fields, or an error message. */
function clean(form: FormData): [Record<Field, string>, string | null] {
  const fields = Object.fromEntries(FIELDS.map((f) => [f, String(form.get(f) ?? "").trim()])) as Record<Field, string>
  if (ISO_DATE.test(fields.dv_date)) fields.dv_date = sheetDate(fields.dv_date)
  if (fields.status !== VERIFIED) fields.status = FOR_REVIEW
  if (!fields.dv_no) return [fields, "DV # is required."]
  if (!fields.gross_amount || parseAmount(fields.gross_amount) === null) return [fields, "Gross amount must be a number, like 12,500.00."]
  return [fields, null]
}

/** Append (sheetRow null) or overwrite one voucher row. */
export async function saveVoucher(sheetRow: number | null, form: FormData): Promise<Result> {
  const [fields, invalid] = clean(form)
  if (invalid) return { ok: false, message: invalid }
  if (sheetRow !== null && !(Number.isInteger(sheetRow) && sheetRow >= FIRST_ROW)) return { ok: false, message: "That row isn't a voucher row." }
  const token = (await getSession()).access_token
  const error = sheetRow ? await updateVoucherRow(token, sheetRow, fields) : await appendVoucher(token, fields)
  if (error) return { ok: false, message: error }
  refresh()
  return { ok: true, message: `Saved ${fields.dv_no} to the sheet.` }
}

/** Mark many rows Verified (or back to For Review) in column L. */
export async function setStatus(sheetRows: number[], verified: boolean): Promise<Result> {
  if (!sheetRows.length || !sheetRows.every((r) => Number.isInteger(r) && r >= FIRST_ROW)) return { ok: false, message: "Those rows aren't voucher rows." }
  const status = verified ? VERIFIED : FOR_REVIEW
  const error = await setStatuses((await getSession()).access_token, sheetRows, status)
  if (error) return { ok: false, message: error }
  refresh()
  return { ok: true, message: `Marked ${sheetRows.length} voucher${sheetRows.length === 1 ? "" : "s"} ${status}.` }
}

/**
 * Change one row's DV # (column C only) from `from` to `to`. The sheet is re-read first: the row must still hold
 * `from`, and a `to` someone else just used becomes the next free number (dvNo says which was written).
 * restore (undo) puts back an old number as is, duplicate or not.
 */
export async function renumberVoucher(sheetRow: number, from: string, to: string, restore = false): Promise<Result & { dvNo?: string }> {
  if (!(Number.isInteger(sheetRow) && sheetRow >= FIRST_ROW)) return { ok: false, message: "That row isn't a voucher row." }
  if (!(restore ? to.trim() : DV_FORMAT.test(to))) return { ok: false, message: "Use the format 06-YYYY-MM-00000." }
  const token = (await getSession()).access_token
  const [rows, error] = await fetchVouchers(token, true)
  if (error) return { ok: false, message: error }
  const row = rows.find((r) => r.sheet_row === sheetRow)
  if (!row || row.dv_no.trim() !== from.trim()) return { ok: false, message: `Row ${sheetRow} no longer holds ${from}. Sync and try again.` }
  const used = rows.map((r) => r.dv_no.trim())
  const dvNo = restore || !used.includes(to) ? to.trim() : nextDvNo(used, parseDate(row.dv_date) ?? todayManila())
  const failed = await setDvNo(token, sheetRow, dvNo)
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

export async function signOut() {
  ;(await cookies()).delete(SESSION_COOKIE)
  redirect("/login/")
}
