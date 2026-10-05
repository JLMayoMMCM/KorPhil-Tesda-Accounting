"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { getSession } from "@/lib/data"
import { FIELDS, FOR_REVIEW, parseAmount, sheetDate, VERIFIED, type Field } from "@/lib/ledger"
import { SESSION_COOKIE } from "@/lib/session"
import { appendVoucher, fetchVouchers, FIRST_ROW, lastPull, setStatuses, updateVoucherRow } from "@/lib/sheets"

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

/** Mark many rows Verified (or back to For Review) in column K. */
export async function setStatus(sheetRows: number[], verified: boolean): Promise<Result> {
  if (!sheetRows.length || !sheetRows.every((r) => Number.isInteger(r) && r >= FIRST_ROW)) return { ok: false, message: "Those rows aren't voucher rows." }
  const status = verified ? VERIFIED : FOR_REVIEW
  const error = await setStatuses((await getSession()).access_token, sheetRows, status)
  if (error) return { ok: false, message: error }
  refresh()
  return { ok: true, message: `Marked ${sheetRows.length} voucher${sheetRows.length === 1 ? "" : "s"} ${status}.` }
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
