import type { NextRequest } from "next/server"

import { csvResponse } from "@/lib/csv"
import { getData } from "@/lib/data"
import { FIELD_LABELS, FIELDS, filterRows, todayManila } from "@/lib/ledger"

/** The voucher list (same filters as /vouchers/, or ?sel=row&sel=row) as raw sheet values. */
export async function GET(request: NextRequest) {
  const { rows } = await getData()
  return csvResponse(
    `vouchers-${todayManila().replaceAll("-", "")}.csv`,
    Object.values(FIELD_LABELS),
    filterRows(rows, request.nextUrl.searchParams).map((r) => FIELDS.map((f) => r[f])),
  )
}
