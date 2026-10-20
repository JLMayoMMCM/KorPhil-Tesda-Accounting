import type { NextRequest } from "next/server"

import { csvResponse, decimal } from "@/lib/csv"
import { getData } from "@/lib/data"
import { todayManila } from "@/lib/ledger"
import { buildReport, REPORTS, type Cell, type Fmt } from "@/lib/reports"

const plain = (v: Cell, fmt: Fmt) => (v === null ? "" : typeof v === "string" ? v : fmt === "peso" ? decimal(v) : fmt === "pct" ? (v * 100).toFixed(1) : v)

/** The report on /reports/ with the same query, as CSV: each table as a titled section, a blank line between. */
export async function GET(request: NextRequest) {
  const { rows } = await getData()
  const { kind, scope, area, tables } = buildReport(rows, request.nextUrl.searchParams, todayManila())
  const filename = `${kind}-${scope.from ? (scope.from === scope.to ? scope.from : `${scope.from}_${scope.to}`) : "all"}.csv`
  return csvResponse(filename, [REPORTS[kind], `${scope.label} · ${area || "All trade areas"}`], tables.flatMap((t) => [
    [], [t.title], t.cols.map((c) => c.head + (c.fmt === "pct" ? " (%)" : "")),
    ...[...t.rows, ...(t.foot ? [t.foot] : [])].map((r) => r.map((v, i) => plain(v, t.cols[i].fmt))),
  ]))
}
