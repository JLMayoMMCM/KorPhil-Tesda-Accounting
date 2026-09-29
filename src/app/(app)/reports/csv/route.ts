import type { NextRequest } from "next/server"

import { csvResponse, decimal } from "@/lib/csv"
import { getData } from "@/lib/data"
import { FIELD_LABELS, FIELDS, total } from "@/lib/ledger"
import { buildReport } from "@/lib/reports"

/** The report on /reports/ with the same query, as CSV. */
export async function GET(request: NextRequest) {
  const { rows } = await getData()
  const { kind, month, scoped, lines } = buildReport(rows, request.nextUrl.searchParams)
  const filename = `${kind}-${month || "all"}.csv`
  if (kind === "audit") return csvResponse(filename, Object.values(FIELD_LABELS), scoped.map((r) => FIELDS.map((f) => r[f])))
  return csvResponse(filename, ["Group", "Vouchers", "Amount"], [
    ...lines.map((l) => [l.label, l.count, decimal(l.amount)]),
    ["Total", scoped.length, decimal(total(scoped))],
  ])
}
