import type { NextRequest } from "next/server"

import { buildCollectionReport, collectionTitle } from "@/lib/collection-reports"
import { csvResponse, decimal } from "@/lib/csv"
import { getCollectionData } from "@/lib/data"
import { reportFile, type Cell, type Fmt } from "@/lib/reports"
import { fullName } from "@/lib/session"

const plain = (v: Cell, fmt: Fmt) => (v === null ? "" : typeof v === "string" ? v : fmt === "peso" ? decimal(v) : fmt === "pct" ? (v * 100).toFixed(1) : v)

/** The report on /collection/reports/ with the same query, as CSV: each schedule titled, with its basis and notes, a blank line between. */
export async function GET(request: NextRequest) {
  const { entries, skipped, title, at, user, today } = await getCollectionData()
  const { kind, scope, area, tables } = buildCollectionReport(entries, request.nextUrl.searchParams, today,
    { source: title, pulled: at, generated: new Date(), by: fullName(user) }, skipped.length)
  return csvResponse(`collections-${reportFile(kind, scope)}.csv`,[collectionTitle(kind), `${scope.label} · ${area || "All areas"}`], tables.flatMap((t) => [
    [], [t.no ? `Schedule ${t.no}. ${t.title}` : t.title], ...(t.basis ? [[t.basis]] : []),
    t.cols.map((c) => c.head + (c.fmt === "pct" ? " (%)" : "")),
    ...[...t.rows, ...(t.foot ? [t.foot] : [])].map((r) => r.map((v, i) => plain(v, t.cols[i].fmt))),
    ...t.notes.map((n) => [`Note: ${n}`]),
  ]))
}
