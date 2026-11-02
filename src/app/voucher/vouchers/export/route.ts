import type { NextRequest } from "next/server"

import { csvResponse } from "@/lib/csv"
import { getData } from "@/lib/data"
import { filterRows, todayManila } from "@/lib/ledger"

/** The voucher list (same filters as /vouchers/, or ?sel=row&sel=row) as raw sheet values, one column per sheet column. */
export async function GET(request: NextRequest) {
  const { rows, columns } = await getData()
  const cols = columns.filter((c) => c.visibility !== "hidden")
  return csvResponse(
    `vouchers-${todayManila().replaceAll("-", "")}.csv`,
    cols.map((c) => c.label),
    filterRows(rows, request.nextUrl.searchParams).map((r) => cols.map((c) => (c.field ? r[c.field] : r.extra?.[c.key] ?? ""))),
  )
}
