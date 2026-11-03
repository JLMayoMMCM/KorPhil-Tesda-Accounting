import "server-only"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { cache } from "react"

import { readCollections } from "@/lib/collection"
import { enrich, inTab, TABS, todayManila, type Tab } from "@/lib/ledger"
import { SESSION_COOKIE, unseal, type Session } from "@/lib/session"
import { fetchCollectionValues, fetchVouchers, lastPull } from "@/lib/sheets"

/** The signed-in session (proxy.ts has already refreshed it). */
export const getSession = cache(async (): Promise<Session> => {
  const session = await unseal<Session>((await cookies()).get(SESSION_COOKIE)?.value)
  if (!session) redirect("/login/")
  return session
})

/** One sheet pull per request, shared by the layout and the page. */
export const getData = cache(async () => {
  const session = await getSession()
  const [raw, error] = await fetchVouchers(session.access_token)
  const today = todayManila()
  const pull = lastPull()
  const rows = enrich(raw, pull.model?.layout.missing ?? [])
  const counts = Object.fromEntries((Object.keys(TABS) as Tab[]).map((t) => [t, rows.filter((r) => inTab(r, t)).length])) as Record<Tab, number>
  // columns: the sheet columns in use, in sheet order (role fields and extras), for the form, CSV and reports.
  return { rows, error, today, counts, pull, columns: pull.model?.columns ?? [], user: session.user }
})

/** One Collection tab pull per request: its entries, why rows were skipped, and the header it read. */
export const getCollectionData = cache(async () => {
  const session = await getSession()
  const [pull, pullError] = await fetchCollectionValues(session.access_token)
  const read = readCollections(pull.values)
  // A header that can't be found only matters once the tab has been read.
  const error = pullError ?? (pull.values.length ? read.error : null)
  return { ...read, error, today: todayManila(), title: pull.title, at: pull.at, user: session.user }
})

/** "3:05 PM" in Manila. */
export const clock = (d: Date | null) =>
  d ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }) : ""
