import type { NextRequest } from "next/server"

import { buildCollectionReport, collectionTitle } from "@/lib/collection-reports"
import { getCollectionData } from "@/lib/data"
import { docxResponse } from "@/lib/docx"
import { fmtCell, reportFile } from "@/lib/reports"
import { fullName } from "@/lib/session"

/** The report on /collection/reports/ with the same query, as a Word document: letterhead, then each schedule with its table and notes. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const { entries, skipped, title, at, user, today } = await getCollectionData()
  const { kind, scope, area, tables } = buildCollectionReport(entries, params, today,
    { source: title, pulled: at, generated: new Date(), by: fullName(user) }, skipped.length)
  return docxResponse(`collections-${reportFile(kind, scope)}.docx`,collectionTitle(kind), `${scope.label} · ${area || "All areas"}`, "Collection report", tables.map((t) => ({
    title: t.no ? `Schedule ${t.no}. ${t.title}` : t.title, basis: t.basis,
    highlights: t.charts?.highlights.map(([k, v]) => `${k}: ${v}`) ?? [],
    head: t.cols.map((c) => c.head), width: t.cols.map((c) => c.w), right: t.cols.map((c) => c.fmt !== "text"),
    rows: t.rows.map((r) => r.map((v, i) => fmtCell(v, t.cols[i].fmt))), foot: t.foot?.map((v, i) => fmtCell(v, t.cols[i].fmt)), notes: t.notes,
  })), params.get("paper") ?? undefined)
}
