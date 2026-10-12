import type { NextRequest } from "next/server"

import { csvResponse, decimal } from "@/lib/csv"
import { getData } from "@/lib/data"
import { FIELD_LABELS, FIELDS, total } from "@/lib/ledger"
import { buildReport, REPORTS } from "@/lib/reports"

/** The report on /reports/ with the same query, as CSV. The summary adds a Report column. */
export async function GET(request: NextRequest) {
  const { rows } = await getData()
  const { kind, month, scoped, parts } = buildReport(rows, request.nextUrl.searchParams)
  const filename = `${kind}-${month || "all"}.csv`
  if (kind === "audit") return csvResponse(filename, Object.values(FIELD_LABELS), scoped.map((r) => FIELDS.map((f) => r[f])))
  const many = parts.length > 1
  return csvResponse(filename, [...(many ? ["Report"] : []), "Group", "Vouchers", "Amount"], parts.flatMap((p) =>
    [...p.lines.map((l) => [l.label, l.count, decimal(l.amount)]), ["Total", p.scoped.length, decimal(total(p.scoped))]]
      .map((r) => (many ? [REPORTS[p.kind], ...r] : r))))
}
