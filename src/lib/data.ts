import "server-only"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { cache } from "react"

import { enrich, inTab, TABS, todayManila, type Tab } from "@/lib/ledger"
import { SESSION_COOKIE, unseal, type Session } from "@/lib/session"
import { fetchVouchers, lastPull } from "@/lib/sheets"

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

/** "3:05 PM" in Manila. */
export const clock = (d: Date | null) =>
  d ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }) : ""
