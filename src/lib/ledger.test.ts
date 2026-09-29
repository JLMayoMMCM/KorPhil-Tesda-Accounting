// Run: node --test src/lib/ledger.test.ts  (ported from the legacy ledger.py self-check)
import assert from "node:assert/strict"
import { test } from "node:test"

import { enrich, filterRows, inTab, parseAmount, parseDate, peso, qs, sheetDate, total, type RawVoucher } from "./ledger.ts"

const row = (due: string, status: string, amount = "1,000.50", dv = "9/1/2026"): RawVoucher => ({
  gross_amount: amount, dv_date: dv, due_date: due, status, dv_no: due, sheet_row: 3,
  payee: "", particulars: "", trade_area: "", diploma_st_assessment: "", category: "",
})

test("ledger", () => {
  const rs = enrich([
    row("8/1/2026", "PENDING"), row("9/20/2026", "PENDING"), row("9/23/2026", "PENDING"),
    row("9/29/2026", "PENDING"), row("9/30/2026", "PENDING"), row("9/1/2026", "PAID"),
    row("10/1/2026", "OVERDUE"), row("", "", "oops"),
  ], "2026-09-23")
  const byDue = Object.fromEntries(rs.map((r) => [r.due_date, r]))
  assert.equal(byDue["8/1/2026"].bucket, "late30")
  assert.equal(byDue["8/1/2026"].days_late, 53)
  assert.equal(byDue["9/20/2026"].bucket, "late")
  assert.equal(byDue["9/23/2026"].bucket, "today")
  assert.equal(byDue["9/29/2026"].bucket, "week")
  assert.equal(byDue["9/30/2026"].bucket, "later")
  assert.equal(byDue["9/1/2026"].bucket, "paid")
  assert.equal(byDue["9/1/2026"].days_late, 0)
  assert.equal(byDue["10/1/2026"].state, "overdue") // sheet says overdue even though not past due
  assert.equal(byDue[""].amount, 0)
  assert.equal(byDue[""].bucket, "later")
  assert.equal(rs.at(-1)!.due_date, "") // undated sorts last
  assert.equal(total(rs), 700350)
  assert.equal(parseAmount("₱ 89,021.00"), 8902100)
  assert.equal(parseAmount("x"), null)
  assert.equal(parseAmount("0.29"), 29)
  assert.equal(peso(8902100), "₱89,021.00")
  assert.equal(peso(-50), "−₱0.50")
  assert.equal(parseDate("2/30/2026"), null)
  assert.equal(sheetDate("2026-09-03"), "9/3/2026")
  assert.equal(rs.filter((r) => inTab(r, "week")).length, 2)
  assert.equal(filterRows(rs, new URLSearchParams("bucket=week")).length, 2)
  assert.equal(qs(new URLSearchParams("tab=paid&open=4"), { open: null, area: "ADMIN" }), "?tab=paid&area=ADMIN")
})
