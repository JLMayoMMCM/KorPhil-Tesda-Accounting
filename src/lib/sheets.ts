import "server-only"

import { createHash } from "node:crypto"
import { after } from "next/server"

import { COLLECTION } from "@/lib/collection"
import { serialDate, type Field } from "@/lib/ledger"
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

// The main spreadsheet: checked at sign-in, holds the Years list, and is the current year when that list is empty.
export const SHEET_ID = process.env.GOOGLE_SHEET_ID ?? ""
export const SHEET_RANGE = process.env.GOOGLE_SHEET_RANGE || "EXP"
// The collection module reads its own tab, in its own spreadsheet when COLLECTION_SHEET_ID is set (else the same one).
export const COLLECTION_SHEET_ID = process.env.COLLECTION_SHEET_ID || SHEET_ID
export const COLLECTION_RANGE = process.env.COLLECTION_SHEET_RANGE || "Collection"
export const API = "https://sheets.googleapis.com/v4/spreadsheets"

/** What each module's tab holds. */
const BOOKS = { voucher: DISBURSEMENT, collection: COLLECTION }
export type BookName = keyof typeof BOOKS
type FieldOf<N extends BookName> = (typeof BOOKS)[N] extends Book<infer F> ? F : never
const bookOf = (name: BookName) => BOOKS[name] as unknown as Book<string>
export const quoted = (range: string) => `'${range.replaceAll("'", "''")}'` // quoted, so any tab name is a valid range

/** The tab each module reads when the Years list doesn't name one. */
export const DEFAULT_TAB: Record<BookName, string> = { voucher: SHEET_RANGE, collection: COLLECTION_RANGE }

/**
 * One year of one module: the spreadsheet and tab it lives in, and whether its books are closed (readOnly: ledger
 * writes are refused here, whatever the page shows). year is "" for the .env.local sheet.
 */
export type Source<N extends BookName = BookName> = { name: N; id: string; range: string; year: string; readOnly: boolean }

/** The sheet set in .env.local: the fallback when the Years list is empty or can't be read. */
export const envSource = <N extends BookName>(name: N): Source<N> =>
  ({ name, id: name === "voucher" ? SHEET_ID : COLLECTION_SHEET_ID, range: DEFAULT_TAB[name], year: "", readOnly: false })

/** A ledger row: each field and extra column as text, and its 1-indexed sheet row for writes. */
export type RawRow<F extends string> = Record<F, string> & { sheet_row: number; extra?: Record<string, string> }

// ponytail: in-process cache, one pull per minute per server instance; move to a shared store if instances disagree too long
export { CACHE_SECONDS }
// One cache per spreadsheet and tab, shared by every user; canOpen checks each user against each spreadsheet first.
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
const pulls = new Map<string, Pull<string>>()
function state<N extends BookName>(src: Source<N>): Pull<FieldOf<N>> {
  const key = `${src.name}|${src.id}|${src.range}`
  if (!pulls.has(key))
    pulls.set(key, { ts: 0, tried: 0, error: null, running: null, gen: 0, rows: [], title: "", sheetId: null, at: null, values: [], lists: [], saved: null, model: null, candidate: null })
  return pulls.get(key)! as unknown as Pull<FieldOf<N>>
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

/** One Sheets API call as the signed-in user. There is no API-key fallback: every sheet opens through its own sharing. */
export async function call(url: string, token: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  headers.set("Authorization", `Bearer ${token}`)
  if (init.body) headers.set("Content-Type", "application/json")
  const response = await fetch(url, { ...init, headers, cache: "no-store", signal: AbortSignal.timeout(10_000) })
  if (!response.ok) throw new SheetsError(response.status, await response.text())
  return response.json()
}

/** Google's answer for a range naming a tab the spreadsheet doesn't have. */
export const isMissingTab = (exc: unknown) => exc instanceof SheetsError && exc.status === 400 && exc.body.includes("Unable to parse range")

/** Each way a Sheets call can fail, finishing the sentence "your Google account ...". */
const ACCESS_MESSAGES = {
  setup: "can't sign in yet: GOOGLE_SHEET_ID is not set in .env.local.",
  api: "can't be used yet: turn on the Google Sheets API in the app's Google Cloud project.",
  denied: "doesn't have permission for this sheet. Ask the sheet owner to share it with you as Editor.",
  missing: "can't find the sheet. Check its link on the Data sources page.",
  expired: "sign-in has expired. Sign in again.",
  unreachable: "couldn't reach Google Sheets. Try again.",
}
type AccessCode = keyof typeof ACCESS_MESSAGES
/** An error ending in this means the Google token stopped working: the page offers a way to sign in again. */
export const SIGN_IN_AGAIN = ACCESS_MESSAGES.expired

function accessCode(exc: unknown): AccessCode {
  if (!(exc instanceof SheetsError)) return "unreachable"
  if (exc.status === 403) return exc.body.includes("SERVICE_DISABLED") ? "api" : "denied"
  return exc.status === 404 ? "missing" : exc.status === 401 ? "expired" : "unreachable"
}

/** The message for a code from the sign-in redirect (?error=access&detail=<code>). Only the app's own text ever shows, never the URL's. */
export const accessMessage = (code: string) =>
  ACCESS_MESSAGES[Object.hasOwn(ACCESS_MESSAGES, code) ? (code as AccessCode) : "unreachable"]

/** Finish the sentence "your Google account ..." for a failed Sheets call. */
export function explain(exc: unknown): string {
  const code = accessCode(exc)
  if (code !== "unreachable") return ACCESS_MESSAGES[code]
  return `couldn't reach Google Sheets (${exc instanceof Error ? exc.message : exc}).`
}

/** A code for why this token can't open the main sheet (see accessMessage), else null. */
export async function checkAccess(token: string): Promise<AccessCode | null> {
  if (!SHEET_ID) return "setup"
  try {
    await pullMeta(envSource("voucher"), token)
    return null
  } catch (exc) {
    console.error("Sheet access check failed at sign-in:", exc)
    return accessCode(exc)
  }
}

// Who has been seen opening which spreadsheet, so a sheet's cached rows are only served to people it is shared with.
// Keyed by a hash of the access token, which Google replaces about hourly: a removed share stops working within the hour.
const OPEN_FOR = 60 * 60 * 1000
const opened = new Map<string, number>() // hash -> until
const openKey = (token: string, id: string) => createHash("sha256").update(`${token}|${id}`).digest("base64url")

/** null if this token can open the spreadsheet (asked of Google at most hourly), else why not. */
export async function canOpen(token: string, id: string): Promise<string | null> {
  if (!id) return "No spreadsheet is set for this year. Add one on the Data sources page."
  const key = openKey(token, id), now = Date.now()
  if ((opened.get(key) ?? 0) > now) return null
  try {
    await call(`${API}/${id}?fields=spreadsheetId`, token)
  } catch (exc) {
    return "Couldn't open this year's spreadsheet: your Google account " + explain(exc)
  }
  if (opened.size > 5000) for (const [k, until] of opened) if (until <= now) opened.delete(k)
  opened.set(key, now + OPEN_FOR)
  return null
}

/** The spreadsheet's title and the tab's grid ID. */
async function pullMeta(src: Source, token: string) {
  const meta = await call(`${API}/${src.id}?fields=properties.title,sheets.properties(sheetId,title)`, token)
  const pull = state(src)
  pull.title = meta?.properties?.title ?? ""
  pull.sheetId = meta?.sheets?.find((s: { properties: { title: string } }) => s.properties.title === src.range)?.properties?.sheetId ?? null
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

async function pullBook(src: Source, token: string): Promise<string | null> {
  const pull = state(src) as unknown as Pull<string>, gen = pull.gen, book = bookOf(src.name)
  const [[values, error], lists, saved] = await Promise.all([pullValues(src, token), pullLists(src, token), pullSaved(src, token)])
  // Only a good pull replaces the shared cache, so one user's bad token can't blank it for everyone.
  if (error !== null) return error
  const use = { book, lists: lists ?? pull.lists, saved: saved === undefined ? pull.saved : saved }
  const candidate = readSheet(values, use)
  const model = LAYOUT_MODE === "detected" || src.name !== "voucher" ? candidate : readSheet(values, { ...use, fixed: true })
  Object.assign(pull, { ts: gen === pull.gen ? Date.now() : 0, at: new Date(), values, lists: use.lists, saved: use.saved, candidate, model, rows: toRows(values, model) })
  return null
}

const pullOf = <N extends BookName>(p: Pull<FieldOf<N>>) => {
  const { title, at, rows, model, candidate, saved, values, lists } = p
  return { title, at, rows: rows.length, model, candidate, saved, values, lists, top: values.slice(0, 20).map((r) => r.map(String)) }
}
/** A cache's state as pages see it: title, layout in use, saved settings, the tab's first rows. */
export type LastPull<N extends BookName = "voucher"> = ReturnType<typeof pullOf<N>>
const blankPull = <N extends BookName>(): LastPull<N> =>
  ({ title: "", at: null, rows: 0, model: null, candidate: null, saved: null, values: [], lists: [], top: [] })

/**
 * A book's rows from the cache, kept fresh by keepFresh (force waits for a new pull), once this token is known to open
 * the spreadsheet. Returns [rows, error, pull]: each row keeps sheet_row, its 1-indexed row number, for writes; pull is
 * the cache's state, blank for someone the sheet isn't shared with.
 */
export async function fetchRows<N extends BookName>(src: Source<N>, token: string, force = false): Promise<[RawRow<FieldOf<N>>[], string | null, LastPull<N>]> {
  const denied = await canOpen(token, src.id)
  if (denied) return [[], denied, blankPull<N>()]
  const pull = state(src)
  const error = await keepFresh(pull, force, () => pullBook(src, token))
  return [pull.rows.map((r) => ({ ...r, extra: { ...r.extra } })), error, pullOf(pull)]
}

/** The tab read through one set of settings (used to check settings before they're saved; fetchRows first). */
export const readWith = <N extends BookName>(saved: Saved<FieldOf<N>> | null, src: Source<N>) =>
  readSheet(state(src).values, { book: bookOf(src.name) as unknown as Book<FieldOf<N>>, saved, lists: state(src).lists })

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

async function pullValues({ id, range }: Source, token: string): Promise<[Cell[][], string | null]> {
  if (!id) return [[], "No spreadsheet is set for this year. Add one on the Data sources page."]
  try {
    // The whole used range (tab name alone), so added columns are seen.
    // Raw cell values, not display text: amounts keep every decimal whatever the cell format, dates arrive as serials.
    return [(await call(valuesUrl(id, quoted(range), "?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER"), token)).values ?? [], null]
  } catch (exc) {
    return [[], `Couldn't read the ${range} tab: your Google account ` + explain(exc)]
  }
}

/** Each Selection List column with its row-1 header, or null if the tab couldn't be read. */
async function pullLists(src: Source, token: string): Promise<List[] | null> {
  try {
    const values: string[][] = (await call(valuesUrl(src.id, LISTS_TAB, "?majorDimension=COLUMNS"), token)).values ?? []
    return values.map(([header = "", ...rest]) => ({ header: String(header), values: [...new Set(rest.map((v) => String(v).trim()).filter(Boolean))] }))
  } catch {
    return null // a renamed or missing tab must not block the pull
  }
}

/** Settings saved in the spreadsheet: null if none, undefined if they couldn't be read (the last ones are kept). */
async function pullSaved(src: Source, token: string): Promise<Saved<string> | null | undefined> {
  const keys = metaKeys(bookOf(src.name).name)
  try {
    if (state(src).sheetId === null) await pullMeta(src, token)
    const found: { developerMetadata: Metadata }[] = (await call(`${API}/${src.id}/developerMetadata:search`, token, {
      method: "POST",
      body: JSON.stringify({ dataFilters: Object.values(keys).map((metadataKey) => ({ developerMetadataLookup: { metadataKey } })) }),
    })).matchedDeveloperMetadata ?? []
    return savedFrom<string>(found.map((m) => m.developerMetadata), state(src).sheetId ?? 0, keys)
  } catch {
    return undefined // settings are a refinement, never a blocker
  }
}

/** Send a request as the signed-in user. Returns [response, error message or null]. */
async function send(src: Source, token: string, url: string, method: string, body: unknown): Promise<[{ updates?: { updatedRange?: string } } | null, string | null]> {
  if (!token) return [null, "Sign in with Google to save changes to the sheet."]
  try {
    const response = await call(url, token, { method, body: JSON.stringify(body) })
    const pull = state(src)
    Object.assign(pull, { ts: 0, tried: 0, gen: pull.gen + 1 }) // next read waits for a fresh pull
    return [response, null]
  } catch (exc) {
    return [null, "Not saved: your Google account " + explain(exc)]
  }
}

export const valuesUrl = (id: string, range: string, query: string) => `${API}/${id}/values/${encodeURIComponent(range)}${query}`

type CellWrite = { row: number; key: string; value: string }
/** What a write expects of its target rows: a ledger row unchanged since the pull, an empty row, or nothing. */
type Expect = "row" | "empty" | "none"

const valueOf = (r: RawRow<string> | undefined, c: Column<string>) => (!r ? "" : c.field ? r[c.field] : r.extra?.[c.key] ?? "")
const cellText = (v: Cell | undefined) => String(v ?? "").trim()

/** Why a closed year refuses a ledger write. */
export const readOnlyMessage = (src: Source) =>
  `Not saved: ${src.year || "this year"} is read-only (its books are closed). An admin can change that on the Data sources page.`

/**
 * Write single cells, never whole rows: spacers and anything the app doesn't own stay as they are.
 * The header row and each target row are re-read first; if the mapped headers moved, or a target row's mapped cells
 * changed since the pull, nothing is written. The book's raw keys go in RAW; dates and amounts USER_ENTERED, so the
 * sheet parses them. A read-only year refuses every write. Returns an error or null.
 */
export async function writeCells(src: Source, token: string, cells: CellWrite[], by: string, expect: Expect = "row"): Promise<string | null> {
  if (!token) return "Sign in with Google to save changes to the sheet."
  if (src.readOnly) return readOnlyMessage(src)
  if (!cells.length) return null
  const [, denied] = await fetchRows(src, token)
  if (denied && !state(src).model) return denied
  const { model, rows, values } = state(src) as unknown as Pull<string>
  const id = src.id, book = bookOf(src.name), tab = quoted(src.range)
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
    const [, error] = await send(src, token, `${API}/${id}/values:batchUpdate`, "POST", {
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

/** Set the status column on many voucher rows in one request. */
export function setStatuses(src: Source<"voucher">, token: string, sheetRows: number[], status: string, by: string) {
  return writeCells(src, token, sheetRows.map((row) => ({ row, key: "status" satisfies Field, value: status })), by)
}

/** Set one voucher row's DV #, as plain text. */
export function setDvNo(src: Source<"voucher">, token: string, sheetRow: number, dvNo: string, by: string) {
  return writeCells(src, token, [{ row: sheetRow, key: "dv_no" satisfies Field, value: dvNo }], by)
}

/** Write the given columns (by key) of one ledger row; other cells are left alone. */
export function updateCells(src: Source, token: string, sheetRow: number, values: Record<string, string>, by: string) {
  return writeCells(src, token, Object.entries(values).map(([key, value]) => ({ row: sheetRow, key, value })), by)
}

/**
 * Add a ledger row. Detected layout: into the first empty row after the last one (checked empty first).
 * Fixed voucher layout (Phase 0): appended with INSERT_ROWS, then the RAW cells written into the row Google reports.
 */
export async function appendRow(src: Source, token: string, values: Record<string, string>, by: string): Promise<string | null> {
  if (src.readOnly) return readOnlyMessage(src)
  const [, denied] = await fetchRows(src, token)
  if (denied && !state(src).model) return denied
  const model = state(src).model as SheetModel<string> | null
  if (!model || model.source === "none") return model?.error ?? "Couldn't read the sheet. Sync and try again."
  const cells = (row: number) => Object.entries(values).map(([key, value]) => ({ row, key, value }))
  if (model.source !== "fixed") return writeCells(src, token, cells(model.nextRow).filter((c) => c.value), by, "empty")

  const id = src.id, tab = quoted(src.range), raw = bookOf(src.name).raw as string[]
  // null leaves a cell untouched: spacers, and the RAW cells written next.
  const line: (string | null)[] = Array(Math.max(...model.columns.map((c) => c.col)) + 1).fill(null)
  for (const c of model.columns) if (!raw.includes(c.key) && c.key in values) line[c.col] = values[c.key]
  const [response, error] = await send(src, token, valuesUrl(id, `${tab}!A:${colLetter(line.length - 1)}`, ":append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS"), "POST", { values: [line] })
  if (error) return error
  const row = Number(/!\$?[A-Z]+\$?(\d+)/.exec(response?.updates?.updatedRange ?? "")?.[1])
  if (!row) return "Partly saved: the new row's codes and names weren't written. Sync and fill them in."
  for (const c of model.columns) if (!raw.includes(c.key) && c.key in values)
    console.info("[sheet write]", JSON.stringify({ sheet: id, range: `${tab}!${colLetter(c.col)}${row}`, old: "", new: values[c.key], by }))
  const failed = await writeCells(src, token, cells(row).filter((c) => raw.includes(c.key) && c.value), by, "none")
  return failed && failed.replace("Not saved", `Partly saved (row ${row} was added)`)
}

/**
 * Replace a book's layout settings stored in the spreadsheet (null = reset to auto-detect). Writing developer metadata
 * needs edit access, so a Viewer gets Google's permission error. Visibility PROJECT: only this app's Cloud project sees it.
 * Allowed on read-only years too: settings change how the app reads a sheet, never its ledger.
 */
export async function saveSettings(src: Source, token: string, saved: Saved<string> | null): Promise<string | null> {
  if (state(src).sheetId === null) {
    try {
      await pullMeta(src, token)
    } catch (exc) {
      return "Not saved: your Google account " + explain(exc)
    }
  }
  const keys = metaKeys(bookOf(src.name).name)
  const sheetId = state(src).sheetId ?? 0
  const create = (metadataKey: string, metadataValue: string, location: object) =>
    ({ createDeveloperMetadata: { developerMetadata: { metadataKey, metadataValue, location, visibility: "PROJECT" } } })
  const dim = (dimension: "ROWS" | "COLUMNS", i: number) => ({ dimensionRange: { sheetId, dimension, startIndex: i, endIndex: i + 1 } })
  const old = state(src).saved
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
  const [, error] = await send(src, token, `${API}/${src.id}:batchUpdate`, "POST", { requests })
  return error
}

/** A spreadsheet's address in Google Sheets. */
export const sheetUrl = (id: string) => (id ? `https://docs.google.com/spreadsheets/d/${id}` : "")
