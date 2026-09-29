import "server-only"

import type { Field, RawVoucher } from "@/lib/ledger"

// Column layout of the source sheet (see Archive/Assets/SAMPLE SHEET - TESTING.csv).
// Columns G/H are spacer columns in the sheet and are dropped.
const COLUMNS: (Field | null)[] = [
  "dv_date", "due_date", "dv_no", "payee", "particulars", "gross_amount",
  null, null,
  "trade_area", "diploma_st_assessment", "category", "status",
]
const STATUS_COLUMN = "L"

export const SHEET_ID = process.env.GOOGLE_SHEET_ID ?? ""
export const SHEET_RANGE = process.env.GOOGLE_SHEET_RANGE || "Sheet1"
const API_KEY = process.env.GOOGLE_SHEET_API_KEY ?? ""
const API = "https://sheets.googleapis.com/v4/spreadsheets"

// ponytail: in-process cache, one pull per minute per server instance; move to a shared store if instances disagree too long
export const CACHE_SECONDS = 60
// Everyone who can reach the cache has already proven sheet access at sign-in (see auth/callback).
const pull = { ts: 0, rows: [] as RawVoucher[], title: "", at: null as Date | null }

class SheetsError extends Error {
  status: number
  body: string
  constructor(status: number, body: string) {
    super(`HTTP ${status}`)
    this.status = status
    this.body = body
  }
}

async function call(url: string, token: string | null, init: RequestInit = {}) {
  const u = new URL(url)
  const headers = new Headers(init.headers)
  if (token) headers.set("Authorization", `Bearer ${token}`)
  else u.searchParams.set("key", API_KEY) // read-only fallback for requests with no signed-in token
  if (init.body) headers.set("Content-Type", "application/json")
  const response = await fetch(u, { ...init, headers, cache: "no-store", signal: AbortSignal.timeout(10_000) })
  if (!response.ok) throw new SheetsError(response.status, await response.text())
  return response.json()
}

/** Finish the sentence "your Google account ..." for a failed Sheets call. */
export function explain(exc: unknown): string {
  if (!(exc instanceof SheetsError)) return `couldn't reach Google Sheets (${exc instanceof Error ? exc.message : exc}).`
  if (exc.status === 403 && exc.body.includes("SERVICE_DISABLED"))
    return "can't be used yet: turn on the Google Sheets API in the app's Google Cloud project."
  if (exc.status === 403) return "doesn't have permission for this sheet. Ask the sheet owner to share it with you as Editor."
  if (exc.status === 404) return "can't find the sheet. Check GOOGLE_SHEET_ID in .env.local."
  if (exc.status === 401) return "sign-in has expired. Sign in again."
  return `couldn't reach Google Sheets (${exc.message}).`
}

/** Error text (to follow the user's email) if this token can't open the sheet, else null. */
export async function checkAccess(token: string): Promise<string | null> {
  if (!SHEET_ID) return "can't sign in yet: GOOGLE_SHEET_ID is not set in .env.local."
  try {
    const meta = await call(`${API}/${SHEET_ID}?fields=properties.title`, token)
    pull.title = meta?.properties?.title ?? ""
    return null
  } catch (exc) {
    return explain(exc)
  }
}

/**
 * Pull rows from the sheet, cached for CACHE_SECONDS (force skips the cache).
 * Returns [rows, error]; each row keeps sheet_row, its 1-indexed row number, for writes.
 */
export async function fetchVouchers(token: string | null, force = false): Promise<[RawVoucher[], string | null]> {
  let error: string | null = null
  if (force || Date.now() - pull.ts > CACHE_SECONDS * 1000) {
    let rows: RawVoucher[] = []
    ;[rows, error] = await pullSheet(token)
    // Only a good pull replaces the shared cache, so one user's bad token can't blank it for everyone.
    if (error === null) Object.assign(pull, { ts: Date.now(), rows, at: new Date() })
  }
  return [pull.rows.map((r) => ({ ...r })), error]
}

export const lastPull = () => ({ title: pull.title, at: pull.at, rows: pull.rows.length })

async function pullSheet(token: string | null): Promise<[RawVoucher[], string | null]> {
  if (!SHEET_ID || !(token || API_KEY)) return [[], "Google Sheet is not configured. Set GOOGLE_SHEET_ID in .env.local."]
  let values: string[][]
  try {
    values = (await call(`${API}/${SHEET_ID}/values/${encodeURIComponent(SHEET_RANGE)}`, token)).values ?? []
    // Each server instance learns the title on its first pull, not only at sign-in.
    if (!pull.title) pull.title = (await call(`${API}/${SHEET_ID}?fields=properties.title`, token))?.properties?.title ?? ""
  } catch (exc) {
    return [[], "Couldn't read the sheet: your Google account " + explain(exc)]
  }
  const rows: RawVoucher[] = []
  values.slice(2).forEach((raw, i) => { // skip header row and the blank spacer row beneath it
    if (!raw.some(Boolean)) return
    const row = { sheet_row: i + 3 } as RawVoucher
    COLUMNS.forEach((name, j) => { if (name) row[name] = raw[j] ?? "" })
    rows.push(row)
  })
  return [rows, null]
}

/** Send values to the sheet as the signed-in user. Returns an error message or null. */
async function write(token: string | null, url: string, method: string, body: unknown): Promise<string | null> {
  if (!token) return "Sign in with Google to save changes to the sheet."
  try {
    await call(url, token, { method, body: JSON.stringify(body) })
  } catch (exc) {
    return "Not saved: your Google account " + explain(exc)
  }
  pull.ts = 0 // next read pulls fresh
  return null
}

const valuesUrl = (range: string, query: string) =>
  `${API}/${SHEET_ID}/values/${encodeURIComponent(range)}${query}`
const ordered = (fields: Record<Field, string>) => COLUMNS.map((name) => (name ? fields[name] ?? "" : ""))

/** Overwrite one data row (A:L). */
export function updateVoucherRow(token: string | null, sheetRow: number, fields: Record<Field, string>) {
  return write(token, valuesUrl(`${SHEET_RANGE}!A${sheetRow}:L${sheetRow}`, "?valueInputOption=USER_ENTERED"), "PUT",
    { values: [ordered(fields)] })
}

export function appendVoucher(token: string | null, fields: Record<Field, string>) {
  return write(token, valuesUrl(`${SHEET_RANGE}!A:L`, ":append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS"), "POST",
    { values: [ordered(fields)] })
}

/** Write only the status cells, {sheetRow: status}, in one request, so stale cached rows can't overwrite other columns. */
export function setStatuses(token: string | null, statuses: Record<number, string>) {
  return write(token, `${API}/${SHEET_ID}/values:batchUpdate`, "POST", {
    valueInputOption: "USER_ENTERED", // batchUpdate takes this in the body, not the query
    data: Object.entries(statuses).map(([n, s]) => ({ range: `${SHEET_RANGE}!${STATUS_COLUMN}${n}`, values: [[s]] })),
  })
}

export const sheetUrl = SHEET_ID ? `https://docs.google.com/spreadsheets/d/${SHEET_ID}` : ""
