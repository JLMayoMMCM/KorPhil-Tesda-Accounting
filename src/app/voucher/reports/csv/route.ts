import type { NextRequest } from "next/server"

import { csvResponse, decimal } from "@/lib/csv"
import { getData } from "@/lib/data"
import { todayManila } from "@/lib/ledger"
import { buildReport, reportFile, titleOf, type Cell, type Fmt } from "@/lib/reports"
import { fullName } from "@/lib/session"

const plain = (v: Cell, fmt: Fmt) => (v === null ? "" : typeof v === "string" ? v : fmt === "peso" ? decimal(v) : fmt === "pct" ? (v * 100).toFixed(1) : v)

/** The report on /reports/ with the same query, as CSV: each schedule titled, a blank line between. */
export async function GET(request: NextRequest) {
  const { rows, columns, pull, user } = await getData()
  const { kind, scope, area, tables } = buildReport(rows, request.nextUrl.searchParams, todayManila(), columns,
    { source: pull.title, pulled: pull.at, generated: new Date(), by: fullName(user) })
  return csvResponse(`${reportFile(kind, scope)}.csv`,[titleOf(kind), `${scope.label} · ${area || "All trade areas"}`], tables.flatMap((t) => [
    [], [t.no ? `Schedule ${t.no}. ${t.title}` : t.title],
    ...(t.charts?.highlights.length ? [["Highlights"], ...t.charts.highlights, []] : []),
    t.cols.map((c) => c.head + (c.fmt === "pct" ? " (%)" : "")),
    ...[...t.rows, ...(t.foot ? [t.foot] : [])].map((r) => r.map((v, i) => plain(v, t.cols[i].fmt))),
  ]))
}
