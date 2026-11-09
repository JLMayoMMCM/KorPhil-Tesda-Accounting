import type { NextRequest } from "next/server"

import { getData } from "@/lib/data"
import { docxResponse } from "@/lib/docx"
import { todayManila } from "@/lib/ledger"
import { buildReport, fmtCell, reportFile, titleOf } from "@/lib/reports"
import { fullName } from "@/lib/session"

/** The report on /reports/ with the same query, as a Word document: letterhead, then each schedule with its table. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const { rows, columns, pull, user } = await getData()
  const { kind, scope, area, tables } = buildReport(rows, params, todayManila(), columns,
    { source: pull.title, pulled: pull.at, generated: new Date(), by: fullName(user) })
  return docxResponse(`${reportFile(kind, scope)}.docx`,titleOf(kind), `${scope.label} · ${area || "All trade areas"}`, tables.map((t) => ({
    title: t.no ? `Schedule ${t.no}. ${t.title}` : t.title,
    highlights: t.charts?.highlights.map(([k, v]) => `${k}: ${v}`) ?? [],
    head: t.cols.map((c) => c.head), width: t.cols.map((c) => c.w), right: t.cols.map((c) => c.fmt !== "text"),
    rows: t.rows.map((r) => r.map((v, i) => fmtCell(v, t.cols[i].fmt))), foot: t.foot?.map((v, i) => fmtCell(v, t.cols[i].fmt)),
  })), params.get("paper") ?? undefined)
}
