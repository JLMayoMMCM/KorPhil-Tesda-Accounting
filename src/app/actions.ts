"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { getData, getSession } from "@/lib/data"
import { FIELDS, parseAmount, sheetDate, STATUSES, type Field } from "@/lib/ledger"
import { SESSION_COOKIE } from "@/lib/session"
import { appendVoucher, fetchVouchers, lastPull, setStatuses, updateVoucherRow } from "@/lib/sheets"

export type Result = { ok: true; message: string } | { ok: false; message: string }
const plural = (n: number) => (n === 1 ? "" : "s")
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function refresh() {
  revalidatePath("/", "layout")
}

/** Validate a posted voucher: sheet-ready fields, or an error message. */
function clean(form: FormData): [Record<Field, string>, string | null] {
  const fields = Object.fromEntries(FIELDS.map((f) => [f, String(form.get(f) ?? "").trim()])) as Record<Field, string>
  for (const f of ["dv_date", "due_date"] as const) {
    if (ISO_DATE.test(fields[f])) fields[f] = sheetDate(fields[f])
  }
  if (!fields.dv_no) return [fields, "DV # is required."]
  if (!fields.gross_amount || parseAmount(fields.gross_amount) === null) return [fields, "Gross amount must be a number, like 12,500.00."]
  if (!(STATUSES as readonly string[]).includes(fields.status)) return [fields, "Pick a status."]
  return [fields, null]
}

/** Append (sheetRow null) or overwrite one voucher row. */
export async function saveVoucher(sheetRow: number | null, form: FormData): Promise<Result> {
  const [fields, invalid] = clean(form)
  if (invalid) return { ok: false, message: invalid }
  const token = (await getSession()).access_token
  const error = sheetRow ? await updateVoucherRow(token, sheetRow, fields) : await appendVoucher(token, fields)
  if (error) return { ok: false, message: error }
  refresh()
  return { ok: true, message: `Saved ${fields.dv_no} to the sheet.` }
}

const validRows = (rows: unknown[]) => rows.map(Number).filter((n) => Number.isInteger(n) && n >= 3)

/** Write PAID to the status column. Returns the previous statuses so the toast can undo. */
export async function markPaid(rows: number[]): Promise<Result & { before?: Record<number, string> }> {
  const targets = validRows(rows)
  if (!targets.length) return { ok: false, message: "Select at least one voucher." }
  const { rows: all } = await getData()
  const before = Object.fromEntries(all.filter((r) => targets.includes(r.sheet_row)).map((r) => [r.sheet_row, r.status]))
  const error = await setStatuses((await getSession()).access_token, Object.fromEntries(targets.map((n) => [n, "PAID"])))
  if (error) return { ok: false, message: error }
  refresh()
  return { ok: true, message: `Marked ${targets.length} voucher${plural(targets.length)} paid.`, before }
}

/**
 * Put back the statuses a mark-paid overwrote. The client sends them back; that grants nothing new,
 * since the user's own Google access could write any status anyway. Rows and values are still checked.
 */
export async function undoPaid(before: Record<number, string>): Promise<Result> {
  const statuses = Object.fromEntries(
    Object.entries(before).filter(([n, s]) => validRows([n]).length && (s === "" || (STATUSES as readonly string[]).includes(s.trim().toUpperCase()))),
  )
  const n = Object.keys(statuses).length
  if (!n) return { ok: false, message: "Nothing to undo." }
  const error = await setStatuses((await getSession()).access_token, statuses)
  if (error) return { ok: false, message: error }
  refresh()
  return { ok: true, message: `Undid mark paid on ${n} voucher${plural(n)}.` }
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
