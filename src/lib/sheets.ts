import "server-only"

import { FIELDS, serialDate, type RawVoucher } from "@/lib/ledger"
import { colLetter, META, readSheet, savedFrom, type Cell, type Column, type List, type Metadata, type Saved, type SheetModel } from "@/lib/sheet-config"

// The layout itself (fixed fallback, detection, saved settings) lives in sheet-config.ts.
// SHEET_LAYOUT=detected reads and writes through the layout found in the sheet (saved settings, then detection);
// anything else keeps the fixed A:L layout of R5 Phase 0. It is also the rollback switch.
export const LAYOUT_MODE = process.env.SHEET_LAYOUT === "detected" ? "detected" : "fixed"
// Dropdown choices come from the "Selection List" tab, one column per list, matched to sheet columns by row-1 header.
const LISTS_TAB = "'Selection List'"
// Codes and names, not numbers or dates: written RAW so Google never converts them.
const RAW_KEYS = ["dv_no", "check_number", "payee"]

export const SHEET_ID = process.env.GOOGLE_SHEET_ID ?? ""
export const SHEET_RANGE = process.env.GOOGLE_SHEET_RANGE || "EXP"
const TAB = `'${SHEET_RANGE.replaceAll("'", "''")}'` // quoted, so any tab name is a valid range
const API_KEY = process.env.GOOGLE_SHEET_API_KEY ?? ""
const API = "https://sheets.googleapis.com/v4/spreadsheets"

// ponytail: in-process cache, one pull per minute per server instance; move to a shared store if instances disagree too long
export const CACHE_SECONDS = 60
// Everyone who can reach the cache has already proven sheet access at sign-in (see auth/callback).
type Pull = {
  ts: number
  rows: RawVoucher[]
  title: string
  sheetId: number | null // the tab's grid ID, for row and column metadata
  at: Date | null
  values: Cell[][] // the whole tab as last pulled
  lists: List[]
  saved: Saved | null
  model: SheetModel | null // the layout in use
  candidate: SheetModel | null // saved settings or detection, shown on Settings whatever the mode
}
const pulls = new Map<string, Pull>() // keyed by sheet ID
function state(): Pull {
  if (!pulls.has(SHEET_ID))
    pulls.set(SHEET_ID, { ts: 0, rows: [], title: "", sheetId: null, at: null, values: [], lists: [], saved: null, model: null, candidate: null })
  return pulls.get(SHEET_ID)!
}

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
    await pullMeta(token)
    return null
  } catch (exc) {
    return explain(exc)
  }
}

/** The spreadsheet's title and the tab's grid ID, once per server instance. */
async function pullMeta(token: string | null) {
  const meta = await call(`${API}/${SHEET_ID}?fields=properties.title,sheets.properties(sheetId,title)`, token)
  const pull = state()
  pull.title = meta?.properties?.title ?? ""
  pull.sheetId = meta?.sheets?.find((s: { properties: { title: string } }) => s.properties.title === SHEET_RANGE)?.properties?.sheetId ?? null
}

/**
 * Pull rows from the sheet, cached for CACHE_SECONDS (force skips the cache).
 * Returns [rows, error]; each row keeps sheet_row, its 1-indexed row number, for writes.
 */
export async function fetchVouchers(token: string | null, force = false): Promise<[RawVoucher[], string | null]> {
  let error: string | null = null
  const pull = state()
  if (force || Date.now() - pull.ts > CACHE_SECONDS * 1000) {
    const [[values, err], lists, saved] = await Promise.all([pullValues(token), pullLists(token), pullSaved(token)])
    error = err
    // Only a good pull replaces the shared cache, so one user's bad token can't blank it for everyone.
    if (error === null) {
      const use = { lists: lists ?? pull.lists, saved: saved === undefined ? pull.saved : saved }
      const candidate = readSheet(values, use)
      const model = LAYOUT_MODE === "detected" ? candidate : readSheet(values, { ...use, fixed: true })
      Object.assign(pull, { ts: Date.now(), at: new Date(), values, ...use, candidate, model, rows: toRows(values, model) })
    }
  }
  return [pull.rows.map((r) => ({ ...r, extra: { ...r.extra } })), error]
}

export const lastPull = () => {
  const { title, at, rows, model, candidate, saved, values } = state()
  return { title, at, rows: rows.length, model, candidate, saved, top: values.slice(0, 20).map((r) => r.map(String)) }
}

/** The tab read through one layout (used to check settings before they're saved). */
export const readWith = (saved: Saved | null) => readSheet(state().values, { saved, lists: state().lists })

/** Rows the model counts as vouchers, each field and extra column as text. Missing optional fields read blank. */
function toRows(values: Cell[][], model: SheetModel): RawVoucher[] {
  return model.vouchers.map((row) => {
    const raw = values[row - 1] ?? []
    const v = { ...Object.fromEntries(FIELDS.map((f) => [f, ""])), sheet_row: row, extra: {} } as RawVoucher
    for (const c of model.columns) {
      const cell = raw[c.col] ?? ""
      const text = typeof cell === "number" && c.type === "date" ? serialDate(cell) : String(cell)
      if (c.field) v[c.field] = text
      else v.extra![c.key] = text
    }
    return v
  })
}

async function pullValues(token: string | null): Promise<[Cell[][], string | null]> {
  if (!SHEET_ID || !(token || API_KEY)) return [[], "Google Sheet is not configured. Set GOOGLE_SHEET_ID in .env.local."]
  try {
    // The whole used range (tab name alone), so added columns are seen.
    // Raw cell values, not display text: amounts keep every decimal whatever the cell format, dates arrive as serials.
    return [(await call(valuesUrl(TAB, "?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER"), token)).values ?? [], null]
  } catch (exc) {
    return [[], "Couldn't read the sheet: your Google account " + explain(exc)]
  }
}

/** Each Selection List column with its row-1 header, or null if the tab couldn't be read. */
async function pullLists(token: string | null): Promise<List[] | null> {
  try {
    const values: string[][] = (await call(valuesUrl(LISTS_TAB, "?majorDimension=COLUMNS"), token)).values ?? []
    return values.map(([header = "", ...rest]) => ({ header: String(header), values: [...new Set(rest.map((v) => String(v).trim()).filter(Boolean))] }))
  } catch {
    return null // a renamed or missing tab must not block the voucher pull
  }
}

/** Settings saved in the spreadsheet: null if none, undefined if they couldn't be read (the last ones are kept). */
async function pullSaved(token: string | null): Promise<Saved | null | undefined> {
  try {
    if (state().sheetId === null) await pullMeta(token)
    const found: { developerMetadata: Metadata }[] = (await call(`${API}/${SHEET_ID}/developerMetadata:search`, token, {
      method: "POST",
      body: JSON.stringify({ dataFilters: Object.values(META).map((metadataKey) => ({ developerMetadataLookup: { metadataKey } })) }),
    })).matchedDeveloperMetadata ?? []
    return savedFrom(found.map((m) => m.developerMetadata), state().sheetId ?? 0)
  } catch {
    return undefined // e.g. the read-only API key; settings are a refinement, never a blocker
  }
}

/** Send a request as the signed-in user. Returns [response, error message or null]. */
async function send(token: string | null, url: string, method: string, body: unknown): Promise<[{ updates?: { updatedRange?: string } } | null, string | null]> {
  if (!token) return [null, "Sign in with Google to save changes to the sheet."]
  try {
    const response = await call(url, token, { method, body: JSON.stringify(body) })
    state().ts = 0 // next read pulls fresh
    return [response, null]
  } catch (exc) {
    return [null, "Not saved: your Google account " + explain(exc)]
  }
}

const valuesUrl = (range: string, query: string) =>
  `${API}/${SHEET_ID}/values/${encodeURIComponent(range)}${query}`

type CellWrite = { row: number; key: string; value: string }
/** What a write expects of its target rows: a voucher still holding the DV # last pulled, an empty row, or nothing. */
type Expect = "voucher" | "empty" | "none"

const valueOf = (r: RawVoucher | undefined, c: Column) => (!r ? "" : c.field ? r[c.field] : r.extra?.[c.key] ?? "")

/**
 * Write single cells, never whole rows: spacers and anything the app doesn't own stay as they are.
 * The header row and each target row are re-read first; if either moved since the pull, nothing is written.
 * RAW_KEYS go in RAW; dates and amounts USER_ENTERED, so the sheet parses them. Returns an error or null.
 */
async function writeCells(token: string | null, cells: CellWrite[], by: string, expect: Expect = "voucher"): Promise<string | null> {
  if (!token) return "Sign in with Google to save changes to the sheet."
  if (!cells.length) return null
  if (!state().model) await fetchVouchers(token)
  const { model, rows } = state()
  if (!model) return "Couldn't read the sheet. Sync and try again."
  const columns = new Map(model.columns.map((c) => [c.key, c]))
  for (const c of cells) {
    const col = columns.get(c.key)
    if (!col) return `The sheet has no column for ${c.key.replace(/^x:/, "")}. Sync and try again.`
    if (col.visibility !== "shown") return `${col.label} is ${col.visibility === "hidden" ? "hidden" : "read-only"} in Settings.`
  }

  const before = new Map(rows.map((r) => [r.sheet_row, r])) // as last pulled
  const targets = [...new Set(cells.map((c) => c.row))]
  if (expect !== "none") {
    const ranges = [model.layout.headerRow, ...targets].map((r) => `ranges=${encodeURIComponent(`${TAB}!${r}:${r}`)}`).join("&")
    let fresh: Cell[][]
    try {
      const got = await call(`${API}/${SHEET_ID}/values:batchGet?${ranges}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`, token)
      fresh = (got.valueRanges ?? []).map((v: { values?: Cell[][] }) => v.values?.[0] ?? [])
    } catch (exc) {
      return "Not saved: your Google account " + explain(exc)
    }
    if (JSON.stringify(fresh[0] ?? []) !== model.headerSig) return "The sheet's header row changed since the last sync. Sync and try again."
    const dv = columns.get("dv_no")!
    for (const [i, row] of targets.entries()) {
      const now = fresh[i + 1] ?? []
      if (expect === "empty") {
        if (model.columns.some((c) => String(now[c.col] ?? "").trim())) return `Row ${row} is no longer empty. Sync and try again.`
        continue
      }
      const was = before.get(row)
      if (!was) return `Row ${row} isn't a voucher row.`
      if (String(now[dv.col] ?? "").trim() !== was.dv_no.trim())
        return `Row ${row} no longer holds ${was.dv_no.trim() || "the voucher you opened"}. Sync and try again.`
    }
  }

  const groups: [string, CellWrite[]][] = [
    ["USER_ENTERED", cells.filter((c) => !RAW_KEYS.includes(c.key))],
    ["RAW", cells.filter((c) => RAW_KEYS.includes(c.key))],
  ]
  let wrote = false
  for (const [option, group] of groups) {
    if (!group.length) continue
    const range = (c: CellWrite) => `${TAB}!${colLetter(columns.get(c.key)!.col)}${c.row}`
    const [, error] = await send(token, `${API}/${SHEET_ID}/values:batchUpdate`, "POST", {
      valueInputOption: option,
      data: group.map((c) => ({ range: range(c), values: [[c.value]] })),
    })
    if (error) return wrote ? error.replace("Not saved", "Partly saved") : error
    wrote = true
    // Server log, for an undo trail beside the sheet's own version history.
    for (const c of group)
      console.info("[sheet write]", JSON.stringify({ sheet: SHEET_ID, range: range(c), old: valueOf(before.get(c.row), columns.get(c.key)!), new: c.value, by }))
  }
  return null
}

/** Set the status column on many rows in one request. */
export function setStatuses(token: string | null, sheetRows: number[], status: string, by: string) {
  return writeCells(token, sheetRows.map((row) => ({ row, key: "status", value: status })), by)
}

/** Set one row's DV #, as plain text. */
export function setDvNo(token: string | null, sheetRow: number, dvNo: string, by: string) {
  return writeCells(token, [{ row: sheetRow, key: "dv_no", value: dvNo }], by)
}

/** Write the given columns (by key) of one voucher row; other cells are left alone. */
export function updateVoucherCells(token: string | null, sheetRow: number, values: Record<string, string>, by: string) {
  return writeCells(token, Object.entries(values).map(([key, value]) => ({ row: sheetRow, key, value })), by)
}

/**
 * Add a voucher. Detected layout: into the first empty row after the last voucher (checked empty first).
 * Fixed layout (Phase 0): appended with INSERT_ROWS, then the RAW cells written into the row Google reports.
 */
export async function appendVoucher(token: string | null, values: Record<string, string>, by: string): Promise<string | null> {
  if (!state().model) await fetchVouchers(token)
  const model = state().model
  if (!model) return "Couldn't read the sheet. Sync and try again."
  const cells = (row: number) => Object.entries(values).map(([key, value]) => ({ row, key, value }))
  if (LAYOUT_MODE === "detected") return writeCells(token, cells(model.nextRow).filter((c) => c.value), by, "empty")

  // null leaves a cell untouched: spacers, and the RAW cells written next.
  const line: (string | null)[] = Array(Math.max(...model.columns.map((c) => c.col)) + 1).fill(null)
  for (const c of model.columns) if (!RAW_KEYS.includes(c.key) && c.key in values) line[c.col] = values[c.key]
  const [response, error] = await send(token, valuesUrl(`${TAB}!A:${colLetter(line.length - 1)}`, ":append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS"), "POST", { values: [line] })
  if (error) return error
  const row = Number(/!\$?[A-Z]+\$?(\d+)/.exec(response?.updates?.updatedRange ?? "")?.[1])
  if (!row) return "Partly saved: the new row's DV #, check # and payee weren't written. Sync and fill them in."
  for (const c of model.columns) if (!RAW_KEYS.includes(c.key) && c.key in values)
    console.info("[sheet write]", JSON.stringify({ sheet: SHEET_ID, range: `${TAB}!${colLetter(c.col)}${row}`, old: "", new: values[c.key], by }))
  const failed = await writeCells(token, cells(row).filter((c) => RAW_KEYS.includes(c.key) && c.value), by, "none")
  return failed && failed.replace("Not saved", `Partly saved (row ${row} was added)`)
}

/**
 * Replace the layout settings stored in the spreadsheet (null = reset to auto-detect). Writing developer metadata
 * needs edit access, so a Viewer gets Google's permission error. Visibility PROJECT: only this app's Cloud project sees it.
 */
export async function saveSettings(token: string | null, saved: Saved | null): Promise<string | null> {
  if (state().sheetId === null) {
    try {
      await pullMeta(token)
    } catch (exc) {
      return "Not saved: your Google account " + explain(exc)
    }
  }
  const sheetId = state().sheetId ?? 0
  const create = (metadataKey: string, metadataValue: string, location: object) =>
    ({ createDeveloperMetadata: { developerMetadata: { metadataKey, metadataValue, location, visibility: "PROJECT" } } })
  const dim = (dimension: "ROWS" | "COLUMNS", i: number) => ({ dimensionRange: { sheetId, dimension, startIndex: i, endIndex: i + 1 } })
  const requests = [
    // Clear the earlier tags, only those that exist (the caller pulls fresh first).
    ...present(state().saved).map((metadataKey) => ({ deleteDeveloperMetadata: { dataFilter: { developerMetadataLookup: { metadataKey } } } })),
    ...(saved ? [
      create(META.layout, JSON.stringify({ by: saved.by, at: saved.at }), { spreadsheet: true }),
      ...(saved.headerRow ? [create(META.header, "1", dim("ROWS", saved.headerRow - 1))] : []),
      ...saved.ignored.map((r) => create(META.ignore, "1", dim("ROWS", r - 1))),
      ...Object.entries(saved.columns).map(([c, s]) => create(META.column, JSON.stringify(s), dim("COLUMNS", Number(c)))),
    ] : []),
  ]
  const [, error] = await send(token, `${API}/${SHEET_ID}:batchUpdate`, "POST", { requests })
  return error
}

/** The metadata keys a set of saved settings is stored under. */
const present = (s: Saved | null) => !s ? [] : [
  META.layout, ...(s.headerRow ? [META.header] : []), ...(s.ignored.length ? [META.ignore] : []), ...(Object.keys(s.columns).length ? [META.column] : []),
]

export const sheetUrl = SHEET_ID ? `https://docs.google.com/spreadsheets/d/${SHEET_ID}` : ""
