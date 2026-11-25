import "server-only"

import { CACHE_SECONDS, colLetter } from "@/lib/sheet-config"
import {
  API, call, canOpen, DEFAULT_TAB, envSource, explain, fetchRows, isMissingTab, quoted, SHEET_ID, valuesUrl,
  type BookName, type Source,
} from "@/lib/sheets"
import { MODULE_NAMES, parseYears, pickYear, sheetIdOf, YEAR, YEARS_HEADER, YEARS_TAB, yearsColumns, type Status, type YearRow } from "@/lib/years"

// The Years list lives in the main spreadsheet unless YEARS_SHEET_ID names a separate registry spreadsheet.
export const YEARS_SHEET_ID = process.env.YEARS_SHEET_ID || SHEET_ID
const TAB = quoted(YEARS_TAB)

// ponytail: one in-process copy of the list per server instance, like the ledger caches
let list: { at: number; rows: YearRow[]; error: string | null } = { at: 0, rows: [], error: null }

/**
 * The Years list, pulled at most every CACHE_SECONDS (force: now). A missing tab is an empty list, not an error.
 * If it can't be read, the last good list is kept and error says why; an empty list means the .env.local sheet is used.
 */
export async function readYears(token: string, force = false): Promise<{ rows: YearRow[]; error: string | null }> {
  const denied = await canOpen(token, YEARS_SHEET_ID)
  if (denied) return { rows: [], error: denied }
  if (!force && Date.now() - list.at < CACHE_SECONDS * 1000) return list
  try {
    const values = (await call(valuesUrl(YEARS_SHEET_ID, TAB, "?valueRenderOption=FORMATTED_VALUE"), token)).values ?? []
    list = { at: Date.now(), rows: parseYears(values), error: null }
  } catch (exc) {
    list = isMissingTab(exc)
      ? { at: Date.now(), rows: [], error: null }
      : { ...list, at: Date.now(), error: `Couldn't read the ${YEARS_TAB} tab: your Google account ${explain(exc)}` }
  }
  return list
}

/** A Years row as the source a module reads. */
export const sourceOf = <N extends BookName>(name: N, r: YearRow): Source<N> =>
  ({ name, id: r.id, range: r.tab || DEFAULT_TAB[name], year: r.year, readOnly: r.status === "Read-only" })

/** Where a module reads for the year asked for (see pickYear), and why the list failed if it did. */
export async function resolveSource<N extends BookName>(name: N, token: string, wanted: string) {
  const { rows, error } = await readYears(token)
  const row = pickYear(rows, name, wanted)
  return { source: row ? sourceOf(name, row) : envSource(name), error }
}

/** The Years tab's grid ID, adding the tab (with its header row) if the main spreadsheet doesn't have it yet. */
async function yearsTab(token: string): Promise<number> {
  const meta = await call(`${API}/${YEARS_SHEET_ID}?fields=sheets.properties(sheetId,title)`, token)
  const found = meta?.sheets?.find((s: { properties: { title: string } }) => s.properties.title === YEARS_TAB)?.properties?.sheetId
  if (found !== undefined) return found
  const added = await call(`${API}/${YEARS_SHEET_ID}:batchUpdate`, token, {
    method: "POST",
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: YEARS_TAB, gridProperties: { frozenRowCount: 1 } } } }] }),
  })
  await call(valuesUrl(YEARS_SHEET_ID, `${TAB}!A1:G1`, "?valueInputOption=RAW"), token, { method: "PUT", body: JSON.stringify({ values: [YEARS_HEADER] }) })
  return added.replies?.[0]?.addSheet?.properties?.sheetId ?? 0
}

export type Preview = { title: string; tab: string; tabs: string[]; headerRow: number | null; rows: number; error: string | null }

/**
 * Open a pasted link with the admin's own Google account before it's saved: the spreadsheet's title and tabs, then the
 * tab read the way the module will read it (header row found, row count).
 */
export async function previewSheet(name: BookName, token: string, link: string, tab: string): Promise<Preview> {
  const blank: Preview = { title: "", tab, tabs: [], headerRow: null, rows: 0, error: null }
  const id = sheetIdOf(link)
  if (!id) return { ...blank, error: "Paste a Google Sheets link (https://docs.google.com/spreadsheets/d/…)." }
  let tabs: string[], title: string
  try {
    const meta = await call(`${API}/${id}?fields=properties.title,sheets.properties.title`, token)
    title = meta?.properties?.title ?? ""
    tabs = (meta?.sheets ?? []).map((s: { properties: { title: string } }) => s.properties.title)
  } catch (exc) {
    return { ...blank, error: "Couldn't open that spreadsheet: your Google account " + explain(exc) }
  }
  const use = tab || DEFAULT_TAB[name]
  if (!tabs.includes(use)) return { ...blank, title, tab: use, tabs, error: `It has no ${use} tab. Pick one of its tabs.` }
  const [rows, error, pull] = await fetchRows({ name, id, range: use, year: "", readOnly: false }, token, true)
  const found = pull.model && pull.model.source !== "none"
  return { title, tab: use, tabs, headerRow: found ? pull.model!.layout.headerRow : null, rows: rows.length, error: error ?? (found ? null : pull.model?.error ?? "No header row found.") }
}

/** Add a row to the Years list. Refused if that module already lists that year. Returns an error or null. */
export async function addYear(token: string, entry: { year: string; module: BookName; link: string; tab: string; status: Status }, by: string): Promise<string | null> {
  if (!YEAR.test(entry.year)) return "Enter the year as four digits, like 2026."
  const id = sheetIdOf(entry.link)
  if (!id) return "Paste a Google Sheets link (https://docs.google.com/spreadsheets/d/…)."
  const { rows, error } = await readYears(token, true)
  if (error) return error
  const twin = rows.find((r) => r.module === entry.module && r.year === entry.year)
  if (twin) return `${entry.year} ${MODULE_NAMES[entry.module]} is already on row ${twin.row}. Change that row instead.`
  try {
    await yearsTab(token)
    const line = [entry.year, MODULE_NAMES[entry.module], `https://docs.google.com/spreadsheets/d/${id}`, entry.tab, entry.status, by, new Date().toISOString().slice(0, 10)]
    await call(valuesUrl(YEARS_SHEET_ID, `${TAB}!A:G`, ":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS"), token, { method: "POST", body: JSON.stringify({ values: [line] }) })
  } catch (exc) {
    return "Not saved: your Google account " + explain(exc)
  } finally {
    list.at = 0
  }
  console.info("[years write]", JSON.stringify({ add: entry, by }))
  return null
}

/**
 * Change or remove one Years row. The row is re-read first and must still be the same year and module (someone may have
 * sorted the tab). Removing deletes the row from the list only; the spreadsheet it points to is never touched.
 */
export async function changeYear(token: string, row: number, expect: { year: string; module: BookName }, change: { status?: Status; link?: string; tab?: string } | "remove", by: string): Promise<string | null> {
  const { rows, error } = await readYears(token, true)
  if (error) return error
  const now = rows.find((r) => r.row === row)
  if (!now || now.year !== expect.year || now.module !== expect.module) return "The Years list changed since this page loaded. Reload and try again."
  try {
    if (change === "remove") {
      const sheetId = await yearsTab(token)
      await call(`${API}/${YEARS_SHEET_ID}:batchUpdate`, token, {
        method: "POST",
        body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: row - 1, endIndex: row } } }] }),
      })
    } else {
      const header = (await call(valuesUrl(YEARS_SHEET_ID, `${TAB}!1:1`, ""), token)).values?.[0] ?? []
      const col = yearsColumns(header)
      const set: { status?: string; link?: string; tab?: string } = { ...change }
      if (set.link !== undefined) {
        const id = sheetIdOf(set.link)
        if (!id) return "Paste a Google Sheets link (https://docs.google.com/spreadsheets/d/…)."
        set.link = `https://docs.google.com/spreadsheets/d/${id}`
      }
      const data = (["status", "link", "tab"] as const)
        .filter((k) => set[k] !== undefined && col[k] >= 0)
        .map((k) => ({ range: `${TAB}!${colLetter(col[k])}${row}`, values: [[set[k]]] }))
      if (data.length) await call(`${API}/${YEARS_SHEET_ID}/values:batchUpdate`, token, { method: "POST", body: JSON.stringify({ valueInputOption: "RAW", data }) })
    }
  } catch (exc) {
    return "Not saved: your Google account " + explain(exc)
  } finally {
    list.at = 0
  }
  console.info("[years write]", JSON.stringify({ row, was: now, change, by }))
  return null
}
