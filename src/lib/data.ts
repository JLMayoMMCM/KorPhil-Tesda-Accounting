import "server-only"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { cache } from "react"

import { COLLECTION, entriesFrom } from "@/lib/collection"
import { enrich, inTab, TABS, todayManila, type Tab } from "@/lib/ledger"
import { SESSION_COOKIE, unseal, type Session } from "@/lib/session"
import { readSheet, type Column } from "@/lib/sheet-config"
import { fetchRows, type BookName } from "@/lib/sheets"
import { resolveSource } from "@/lib/years-sheet"

/** The year each user picked in the sidebar; every page and export reads that year's spreadsheet. */
export const YEAR_COOKIE = "year"

/** The signed-in session (proxy.ts has already refreshed it). */
export const getSession = cache(async (): Promise<Session> => {
  const session = await unseal<Session>((await cookies()).get(SESSION_COOKIE)?.value)
  if (!session) redirect("/login/")
  return session
})

/** Where a module reads for this user's year (see resolveSource), once per request. */
export const getSource = cache(async <N extends BookName>(name: N) => {
  const session = await getSession()
  return resolveSource(name, session.access_token, (await cookies()).get(YEAR_COOKIE)?.value ?? "")
})

/** A closed year's columns, all read-only: forms show them but can't save, and Verify is hidden. */
const locked = <C extends Column<string>>(columns: C[], readOnly: boolean): C[] =>
  readOnly ? columns.map((c) => (c.visibility === "shown" ? { ...c, visibility: "readonly" } : c)) : columns

/** One sheet pull per request, shared by the layout and the page. */
export const getData = cache(async () => {
  const session = await getSession()
  const { source } = await getSource("voucher")
  const [raw, error, pull] = await fetchRows(source, session.access_token)
  const today = todayManila()
  const rows = enrich(raw, pull.model?.layout.missing ?? [])
  const counts = Object.fromEntries((Object.keys(TABS) as Tab[]).map((t) => [t, rows.filter((r) => inTab(r, t)).length])) as Record<Tab, number>
  // columns: the sheet columns in use, in sheet order (role fields and extras), for the form, CSV and reports.
  const columns = locked(pull.model?.columns ?? [], source.readOnly)
  return { rows, error, today, counts, pull, columns, user: session.user, source }
})

/** One Collection tab pull per request: its entries and rows, why rows were skipped, and the header it read. */
export const getCollectionData = cache(async () => {
  const session = await getSession()
  const { source } = await getSource("collection")
  const [rows, pullError, pull] = await fetchRows(source, session.access_token)
  const read = entriesFrom(pull.values, pull.model ?? readSheet(pull.values, { book: COLLECTION }))
  // A header that can't be found only matters once the tab has been read.
  const error = pullError ?? (pull.values.length ? read.error : null)
  // layout: null until a header row is found.
  const layout = read.model.source === "none" ? null : read.model.layout
  // rows: each entry's cells as text by column key (extras too), for the form; columns: the tab's columns in sheet order.
  return {
    ...read, layout, rows, columns: locked(read.model.columns, source.readOnly), error, today: todayManila(), title: pull.title, at: pull.at,
    user: session.user, pull, source,
  }
})

/** "3:05 PM" in Manila. */
export const clock = (d: Date | null) =>
  d ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }) : ""

/** An export's file name, carrying the year when one is picked: "2025-vouchers-20261118.csv". */
export const withYear = (year: string, file: string) => (year ? `${year}-${file}` : file)
