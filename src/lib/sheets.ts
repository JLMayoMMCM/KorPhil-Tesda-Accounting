import "server-only"

import { after } from "next/server"

import { COLLECTION } from "@/lib/collection"
import { serialDate, type Field, type RawVoucher } from "@/lib/ledger"
import {
  CACHE_SECONDS, colLetter, DISBURSEMENT, headerSig, metaKeys, pullPlan, readSheet, savedFrom,
  type Book, type Cell, type Column, type List, type Metadata, type Saved, type SheetModel,
} from "@/lib/sheet-config"

// The layout itself (fixed fallback, detection, saved settings) lives in sheet-config.ts; each module's book says
// what its tab holds. Reads and writes go through the layout found in the tab, so forms follow its columns.
// SHEET_LAYOUT=fixed is the rollback switch for vouchers: the fixed A:L layout of R5 Phase 0.
export const LAYOUT_MODE = process.env.SHEET_LAYOUT === "fixed" ? "fixed" : "detected"
// Dropdown choices come from each spreadsheet's "Selection List" tab, one column per list, matched by row-1 header.
const LISTS_TAB = "'Selection List'"

export const SHEET_ID = process.env.GOOGLE_SHEET_ID ?? ""
export const SHEET_RANGE = process.env.GOOGLE_SHEET_RANGE || "EXP"
// The collection module reads its own tab, in its own spreadsheet when COLLECTION_SHEET_ID is set (else the same one).
// Each tab has its own cache, so neither module's pull can disturb the other's.
export const COLLECTION_SHEET_ID = process.env.COLLECTION_SHEET_ID || SHEET_ID
export const COLLECTION_RANGE = process.env.COLLECTION_SHEET_RANGE || "Collection"
const API_KEY = process.env.GOOGLE_SHEET_API_KEY ?? ""
const API = "https://sheets.googleapis.com/v4/spreadsheets"

/** Where each book lives. */
const TARGETS = {
  voucher: { book: DISBURSEMENT, id: SHEET_ID, range: SHEET_RANGE },
  collection: { book: COLLECTION, id: COLLECTION_SHEET_ID, range: COLLECTION_RANGE },
}
export type BookName = keyof typeof TARGETS
type FieldOf<N extends BookName> = (typeof TARGETS)[N]["book"] extends Book<infer F> ? F : never
const quoted = (range: string) => `'${range.replaceAll("'", "''")}'` // quoted, so any tab name is a valid range

/** A ledger row: each field and extra column as text, and its 1-indexed sheet row for writes. */
export type RawRow<F extends string> = Record<F, string> & { sheet_row: number; extra?: Record<string, string> }

// ponytail: in-process cache, one pull per minute per server instance; move to a shared store if instances disagree too long
export { CACHE_SECONDS }
// Everyone who can reach the cache has already proven sheet access at sign-in (see auth/callback).
type Freshness = { ts: number; tried: number; error: string | null; running: Promise<string | null> | null }
type Pull<F extends string> = Freshness & {
  gen: number // counts writes, so a pull that began before one isn't taken as fresh
  rows: RawRow<F>[]
  title: string
  sheetId: number | null // the tab's grid ID, for row and column metadata
  at: Date | null
  values: Cell[][] // the whole tab as last pulled
  lists: List[]
  saved: Saved<F> | null
  model: SheetModel<F> | null // the layout in use
  candidate: SheetModel<F> | null // saved settings or detection, shown on Settings whatever the mode
}
const pulls = new Map<BookName, Pull<string>>()
function state<N extends BookName>(name: N): Pull<FieldOf<N>> {
  if (!pulls.has(name))
    pulls.set(name, { ts: 0, tried: 0, error: null, running: null, gen: 0, rows: [], title: "", sheetId: null, at: null, values: [], lists: [], saved: null, model: null, candidate: null })
  return pulls.get(name)! as unknown as Pull<FieldOf<N>>
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
    await pullMeta("voucher", token)
    return null
  } catch (exc) {
    return explain(exc)
  }
}

/** The spreadsheet's title and the tab's grid ID. */
async function pullMeta(name: BookName, token: string | null) {
  const { id, range } = TARGETS[name]
  const meta = await call(`${API}/${id}?fields=properties.title,sheets.properties(sheetId,title)`, token)
  const pull = state(name)
  pull.title = meta?.properties?.title ?? ""
  pull.sheetId = meta?.sheets?.find((s: { properties: { title: string } }) => s.properties.title === range)?.properties?.sheetId ?? null
}

/** Carry out pullPlan for one cache, one pull at a time. Returns the last pull's error. */
async function keepFresh(f: Freshness, force: boolean, pull: () => Promise<string | null>) {
  const start = () => (f.running ??= pull().then((error) => (f.error = error)).finally(() => { f.running = null }))
  const plan = pullPlan({ ...f, running: !!f.running }, force, Date.now())
  if (plan === "wait") {
    await f.running // it may have begun before a write, so it doesn't settle this read by itself
    if (force || !f.ts) {
      f.tried = Date.now()
      await start()
    }
  } else if (plan === "background") {
    f.tried = Date.now() // so only this request schedules it
    after(start)
  }
  return f.error
}

async function pullBook(name: BookName, token: string | null): Promise<string | null> {
  const pull = state(name) as unknown as Pull<string>, gen = pull.gen, book = TARGETS[name].book as unknown as Book<string>
  const [[values, error], lists, saved] = await Promise.all([pullValues(name, token), pullLists(name, token), pullSaved(name, token)])
  // Only a good pull replaces the shared cache, so one user's bad token can't blank it for everyone.
  if (error !== null) return error
  const use = { book, lists: lists ?? pull.lists, saved: saved === undefined ? pull.saved : saved }
  const candidate = readSheet(values, use)
  const model = LAYOUT_MODE === "detected" || name !== "voucher" ? candidate : readSheet(values, { ...use, fixed: true })
  Object.assign(pull, { ts: gen === pull.gen ? Date.now() : 0, at: new Date(), values, lists: use.lists, saved: use.saved, candidate, model, rows: toRows(values, model) })
  return null
}

/**
 * A book's rows from the cache, kept fresh by keepFresh (force waits for a new pull).
 * Returns [rows, error]; each row keeps sheet_row, its 1-indexed row number, for writes.
 */
export async function fetchRows<N extends BookName>(name: N, token: string | null, force = false): Promise<[RawRow<FieldOf<N>>[], string | null]> {
  const pull = state(name)
  const error = await keepFresh(pull, force, () => pullBook(name, token))
  return [pull.rows.map((r) => ({ ...r, extra: { ...r.extra } })), error]
}

export const fetchVouchers = (token: string | null, force = false) => fetchRows("voucher", token, force) as Promise<[RawVoucher[], string | null]>

export const lastPull = <N extends BookName = "voucher">(name = "voucher" as N) => {
  const { title, at, rows, model, candidate, saved, values, lists } = state(name)
  return { title, at, rows: rows.length, model, candidate, saved, values, lists, top: values.slice(0, 20).map((r) => r.map(String)) }
}

/** The tab read through one set of settings (used to check settings before they're saved). */
export const readWith = <N extends BookName = "voucher">(saved: Saved<FieldOf<N>> | null, name = "voucher" as N) =>
  readSheet(state(name).values, { book: TARGETS[name].book as unknown as Book<FieldOf<N>>, saved, lists: state(name).lists })

/** Rows the model reads, each field and extra column as text. Fields with no column read blank. */
function toRows<F extends string>(values: Cell[][], model: SheetModel<F>): RawRow<F>[] {
  const blank = Object.fromEntries([...model.layout.missing, ...Object.keys(model.layout.columns)].map((f) => [f, ""]))
  return model.rows.map((row) => {
    const raw = values[row - 1] ?? []
    const v = { ...blank, sheet_row: row, extra: {} } as RawRow<F>
    for (const c of model.columns) {
      const cell = raw[c.col] ?? ""
      const text = typeof cell === "number" && c.type === "date" ? serialDate(cell) : String(cell)
      if (c.field) (v as Record<string, unknown>)[c.field] = text
      else v.extra![c.key] = text
    }
    return v
  })
}

async function pullValues(name: BookName, token: string | null): Promise<[Cell[][], string | null]> {
  const { id, range } = TARGETS[name]
  if (!id || !(token || API_KEY)) return [[], "Google Sheet is not configured. Set GOOGLE_SHEET_ID in .env.local."]
  try {
    // The whole used range (tab name alone), so added columns are seen.
    // Raw cell values, not display text: amounts keep every decimal whatever the cell format, dates arrive as serials.
    return [(await call(valuesUrl(id, quoted(range), "?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER"), token)).values ?? [], null]
  } catch (exc) {
    return [[], `Couldn't read the ${range} tab: your Google account ` + explain(exc)]
  }
}

/** Each Selection List column with its row-1 header, or null if the tab couldn't be read. */
async function pullLists(name: BookName, token: string | null): Promise<List[] | null> {
  try {
    const values: string[][] = (await call(valuesUrl(TARGETS[name].id, LISTS_TAB, "?majorDimension=COLUMNS"), token)).values ?? []
    return values.map(([header = "", ...rest]) => ({ header: String(header), values: [...new Set(rest.map((v) => String(v).trim()).filter(Boolean))] }))
  } catch {
    return null // a renamed or missing tab must not block the pull
  }
}

/** Settings saved in the spreadsheet: null if none, undefined if they couldn't be read (the last ones are kept). */
async function pullSaved(name: BookName, token: string | null): Promise<Saved<string> | null | undefined> {
  const keys = metaKeys(TARGETS[name].book.name)
  try {
    if (state(name).sheetId === null) await pullMeta(name, token)
    const found: { developerMetadata: Metadata }[] = (await call(`${API}/${TARGETS[name].id}/developerMetadata:search`, token, {
      method: "POST",
      body: JSON.stringify({ dataFilters: Object.values(keys).map((metadataKey) => ({ developerMetadataLookup: { metadataKey } })) }),
    })).matchedDeveloperMetadata ?? []
    return savedFrom<string>(found.map((m) => m.developerMetadata), state(name).sheetId ?? 0, keys)
  } catch {
    return undefined // e.g. the read-only API key; settings are a refinement, never a blocker
  }
}

/** Send a request as the signed-in user. Returns [response, error message or null]. */
async function send(name: BookName, token: string | null, url: string, method: string, body: unknown): Promise<[{ updates?: { updatedRange?: string } } | null, string | null]> {
  if (!token) return [null, "Sign in with Google to save changes to the sheet."]
  try {
    const response = await call(url, token, { method, body: JSON.stringify(body) })
    const pull = state(name)
    Object.assign(pull, { ts: 0, tried: 0, gen: pull.gen + 1 }) // next read waits for a fresh pull
    return [response, null]
  } catch (exc) {
    return [null, "Not saved: your Google account " + explain(exc)]
  }
}

const valuesUrl = (id: string, range: string, query: string) => `${API}/${id}/values/${encodeURIComponent(range)}${query}`

type CellWrite = { row: number; key: string; value: string }
/** What a write expects of its target rows: a ledger row unchanged since the pull, an empty row, or nothing. */
type Expect = "row" | "empty" | "none"

const valueOf = (r: RawRow<string> | undefined, c: Column<string>) => (!r ? "" : c.field ? r[c.field] : r.extra?.[c.key] ?? "")
const cellText = (v: Cell | undefined) => String(v ?? "").trim()

/**
 * Write single cells, never whole rows: spacers and anything the app doesn't own stay as they are.
 * The header row and each target row are re-read first; if the mapped headers moved, or a target row's mapped cells
 * changed since the pull, nothing is written. The book's raw keys go in RAW; dates and amounts USER_ENTERED, so the
 * sheet parses them. Returns an error or null.
 */
export async function writeCells(name: BookName, token: string | null, cells: CellWrite[], by: string, expect: Expect = "row"): Promise<string | null> {
  if (!token) return "Sign in with Google to save changes to the sheet."
  if (!cells.length) return null
  if (!state(name).model) await fetchRows(name, token)
  const { model, rows, values } = state(name) as unknown as Pull<string>
  const { id, book } = TARGETS[name], tab = quoted(TARGETS[name].range)
  if (!model || model.source === "none") return model?.error ?? "Couldn't read the sheet. Sync and try again."
  const columns = new Map(model.columns.map((c) => [c.key, c]))
  for (const c of cells) {
    const col = columns.get(c.key)
    if (!col) return `The sheet has no column for ${c.key.replace(/^x:/, "")}. Sync and try again.`
    if (col.visibility !== "shown") return `${col.label} is ${col.visibility === "hidden" ? "hidden" : "read-only"} in Settings.`
  }

  const before = new Map(rows.map((r) => [r.sheet_row, r])) // as last pulled
  const targets = [...new Set(cells.map((c) => c.row))]
  if (expect !== "none") {
    const ranges = [model.layout.headerRow, ...targets].map((r) => `ranges=${encodeURIComponent(`${tab}!${r}:${r}`)}`).join("&")
    let fresh: Cell[][]
    try {
      const got = await call(`${API}/${id}/values:batchGet?${ranges}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`, token)
      fresh = (got.valueRanges ?? []).map((v: { values?: Cell[][] }) => v.values?.[0] ?? [])
    } catch (exc) {
      return "Not saved: your Google account " + explain(exc)
    }
    if (headerSig(fresh[0] ?? [], model.columns) !== model.headerSig) return "The sheet's header row changed since the last sync. Sync and try again."
    for (const [i, row] of targets.entries()) {
      const now = fresh[i + 1] ?? []
      if (expect === "empty") {
        if (model.columns.some((c) => cellText(now[c.col]))) return `Row ${row} is no longer empty. Sync and try again.`
        continue
      }
      if (!before.has(row)) return `Row ${row} isn't a ledger row.`
      const was = values[row - 1] ?? []
      const moved = model.columns.find((c) => cellText(now[c.col]) !== cellText(was[c.col]))
      if (moved) return `Row ${row} changed in the sheet since the last sync (${moved.label}). Sync and try again.`
    }
  }

  const raw = book.raw as string[]
  const groups: [string, CellWrite[]][] = [
    ["USER_ENTERED", cells.filter((c) => !raw.includes(c.key))],
    ["RAW", cells.filter((c) => raw.includes(c.key))],
  ]
  let wrote = false
  for (const [option, group] of groups) {
    if (!group.length) continue
    const range = (c: CellWrite) => `${tab}!${colLetter(columns.get(c.key)!.col)}${c.row}`
    const [, error] = await send(name, token, `${API}/${id}/values:batchUpdate`, "POST", {
      valueInputOption: option,
      data: group.map((c) => ({ range: range(c), values: [[c.value]] })),
    })
    if (error) return wrote ? error.replace("Not saved", "Partly saved") : error
    wrote = true
    // Server log, for an undo trail beside the sheet's own version history.
    for (const c of group)
      console.info("[sheet write]", JSON.stringify({ sheet: id, range: range(c), old: valueOf(before.get(c.row), columns.get(c.key)!), new: c.value, by }))
  }
  return null
}

/** Set the status column on many rows in one request. */
export function setStatuses(token: string | null, sheetRows: number[], status: string, by: string) {
  return writeCells("voucher", token, sheetRows.map((row) => ({ row, key: "status" satisfies Field, value: status })), by)
}

/** Set one row's DV #, as plain text. */
export function setDvNo(token: string | null, sheetRow: number, dvNo: string, by: string) {
  return writeCells("voucher", token, [{ row: sheetRow, key: "dv_no" satisfies Field, value: dvNo }], by)
}

/** Write the given columns (by key) of one ledger row; other cells are left alone. */
export function updateCells(name: BookName, token: string | null, sheetRow: number, values: Record<string, string>, by: string) {
  return writeCells(name, token, Object.entries(values).map(([key, value]) => ({ row: sheetRow, key, value })), by)
}
export const updateVoucherCells = (token: string | null, sheetRow: number, values: Record<string, string>, by: string) =>
  updateCells("voucher", token, sheetRow, values, by)

/**
 * Add a ledger row. Detected layout: into the first empty row after the last one (checked empty first).
 * Fixed voucher layout (Phase 0): appended with INSERT_ROWS, then the RAW cells written into the row Google reports.
 */
export async function appendRow(name: BookName, token: string | null, values: Record<string, string>, by: string): Promise<string | null> {
  if (!state(name).model) await fetchRows(name, token)
  const model = state(name).model as SheetModel<string> | null
  if (!model || model.source === "none") return model?.error ?? "Couldn't read the sheet. Sync and try again."
  const cells = (row: number) => Object.entries(values).map(([key, value]) => ({ row, key, value }))
  if (model.source !== "fixed") return writeCells(name, token, cells(model.nextRow).filter((c) => c.value), by, "empty")

  const { id, book } = TARGETS[name], tab = quoted(TARGETS[name].range), raw = book.raw as string[]
  // null leaves a cell untouched: spacers, and the RAW cells written next.
  const line: (string | null)[] = Array(Math.max(...model.columns.map((c) => c.col)) + 1).fill(null)
  for (const c of model.columns) if (!raw.includes(c.key) && c.key in values) line[c.col] = values[c.key]
  const [response, error] = await send(name, token, valuesUrl(id, `${tab}!A:${colLetter(line.length - 1)}`, ":append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS"), "POST", { values: [line] })
  if (error) return error
  const row = Number(/!\$?[A-Z]+\$?(\d+)/.exec(response?.updates?.updatedRange ?? "")?.[1])
  if (!row) return "Partly saved: the new row's codes and names weren't written. Sync and fill them in."
  for (const c of model.columns) if (!raw.includes(c.key) && c.key in values)
    console.info("[sheet write]", JSON.stringify({ sheet: id, range: `${tab}!${colLetter(c.col)}${row}`, old: "", new: values[c.key], by }))
  const failed = await writeCells(name, token, cells(row).filter((c) => raw.includes(c.key) && c.value), by, "none")
  return failed && failed.replace("Not saved", `Partly saved (row ${row} was added)`)
}
export const appendVoucher = (token: string | null, values: Record<string, string>, by: string) => appendRow("voucher", token, values, by)

/**
 * Replace a book's layout settings stored in the spreadsheet (null = reset to auto-detect). Writing developer metadata
 * needs edit access, so a Viewer gets Google's permission error. Visibility PROJECT: only this app's Cloud project sees it.
 */
export async function saveSettings(token: string | null, saved: Saved<string> | null, name: BookName = "voucher"): Promise<string | null> {
  if (state(name).sheetId === null) {
    try {
      await pullMeta(name, token)
    } catch (exc) {
      return "Not saved: your Google account " + explain(exc)
    }
  }
  const keys = metaKeys(TARGETS[name].book.name)
  const sheetId = state(name).sheetId ?? 0
  const create = (metadataKey: string, metadataValue: string, location: object) =>
    ({ createDeveloperMetadata: { developerMetadata: { metadataKey, metadataValue, location, visibility: "PROJECT" } } })
  const dim = (dimension: "ROWS" | "COLUMNS", i: number) => ({ dimensionRange: { sheetId, dimension, startIndex: i, endIndex: i + 1 } })
  const old = state(name).saved
  // Clear the earlier tags, only those that exist (the caller pulls fresh first).
  const present = !old ? [] : [keys.layout, ...(old.headerRow ? [keys.header] : []), ...(old.ignored.length ? [keys.ignore] : []), ...(Object.keys(old.columns).length ? [keys.column] : [])]
  const requests = [
    ...present.map((metadataKey) => ({ deleteDeveloperMetadata: { dataFilter: { developerMetadataLookup: { metadataKey } } } })),
    ...(saved ? [
      create(keys.layout, JSON.stringify({ by: saved.by, at: saved.at }), { spreadsheet: true }),
      ...(saved.headerRow ? [create(keys.header, "1", dim("ROWS", saved.headerRow - 1))] : []),
      ...saved.ignored.map((r) => create(keys.ignore, "1", dim("ROWS", r - 1))),
      ...Object.entries(saved.columns).map(([c, s]) => create(keys.column, JSON.stringify(s), dim("COLUMNS", Number(c)))),
    ] : []),
  ]
  const [, error] = await send(name, token, `${API}/${TARGETS[name].id}:batchUpdate`, "POST", { requests })
  return error
}

export const sheetUrl = SHEET_ID ? `https://docs.google.com/spreadsheets/d/${SHEET_ID}` : ""
export const collectionSheetUrl = COLLECTION_SHEET_ID ? `https://docs.google.com/spreadsheets/d/${COLLECTION_SHEET_ID}` : ""
