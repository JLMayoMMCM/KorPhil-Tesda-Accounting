// Run: node --test src/lib/ledger.test.ts
import assert from "node:assert/strict"
import { test } from "node:test"

import { byIssue, enrich, filterRows, inTab, median, monthsBack, parseAmount, parseDate, peso, qs, serialDate, sheetDate, total, yearThrough, type RawVoucher } from "./ledger.ts"

let n = 5
const row = (dv_no: string, dv_date: string, amount = "1,000.50", check = "3477204", area = "ADMIN"): RawVoucher => ({
  dv_no, dv_date, gross_amount: amount, check_number: check, trade_area: area, sheet_row: n++,
  payee: "", particulars: "", diploma_st_assessment: "", category: "", status: dv_no === "A" ? " verified " : "",
})

test("ledger", () => {
  const rs = enrich([
    row("A", "01-09-26"), row("B", "4/7/2026"), row("C", "08-17-26", "2,000"), row("C", "08-17-26", "", ""),
    row("", "", "oops", "", ""),
  ])
  const by = (dv: string) => rs.filter((r) => r.dv_no === dv)
  assert.equal(by("A")[0].dv, "2026-01-09") // EXP's mm-dd-yy
  assert.equal(by("B")[0].dv, "2026-04-07") // dates typed as text
  assert.deepEqual(by("A")[0].issues, [])
  assert.deepEqual(by("C")[0].issues, ["duplicate_dv", "no_amount", "no_check"]) // same date: later sheet row first
  assert.equal(by("C")[0].amount, 0)
  assert.deepEqual(by("C")[1].issues, ["duplicate_dv"])
  assert.deepEqual(by("")[0].issues, ["no_dv", "no_date", "no_amount", "no_check", "no_area"])
  assert.equal(rs[0].dv, "2026-08-17") // newest first
  assert.equal(rs.at(-1)!.dv, null) // undated last
  assert.equal(total(rs), 400100)
  assert.equal(rs.filter((r) => inTab(r, "review")).length, 3)
  assert.deepEqual(rs.filter((r) => inTab(r, "verified")).map((r) => r.dv_no), ["A"]) // case/space-insensitive
  assert.equal(rs.filter((r) => inTab(r, "pending")).length, 4) // blank counts as for review
  assert.deepEqual(enrich([{ ...row("D", "", "", "", ""), status: "Verified" }])[0].issues, []) // verified: blanks ignored
  assert.deepEqual(enrich([{ ...row("F", ""), status: "Verified" }, row("F", "")]).map((r) => r.issues),
    [["duplicate_dv", "no_date"], ["duplicate_dv"]]) // verified still flags a duplicate DV #
  assert.equal(filterRows(rs, new URLSearchParams("issue=no_check")).length, 2)
  assert.equal(filterRows(rs, new URLSearchParams("issue=none")).length, 2) // A, B
  assert.equal(filterRows(rs, new URLSearchParams("tab=pending&issue=any")).length, 3)
  assert.deepEqual(byIssue(rs).map(([i, l]) => [i, l.length]),
    [["no_dv", 1], ["duplicate_dv", 2], ["no_date", 1], ["no_amount", 2], ["no_check", 2], ["no_area", 1]])
  assert.equal(parseAmount("₱ 89,021.00"), 8902100)
  assert.equal(parseAmount("x"), null)
  assert.equal(parseAmount("0.29"), 29)
  assert.equal(peso(8902100), "₱89,021.00")
  assert.equal(peso(-50), "−₱0.50")
  assert.equal(parseDate("2/30/2026"), null)
  assert.equal(sheetDate("2026-09-03"), "9/3/2026")
  assert.equal(serialDate(46031), "1/9/2026") // raw sheet serial (EXP row 5)
  assert.equal(serialDate(46031.75), "1/9/2026") // time of day dropped
  assert.equal(parseAmount(String(73419.5)), 7341950) // raw decimal
  assert.equal(parseAmount(String(60249)), 6024900) // raw whole number
  assert.equal(qs(new URLSearchParams("tab=review&open=4"), { open: null, area: "ADMIN" }), "?tab=review&area=ADMIN")
})

test("dashboard figures", () => {
  const rs = enrich([row("D1", "1/5/2026", "100"), row("D2", "3/5/2026", "300"), row("D3", "11/5/2026", "50"), row("D4", "2/1/2025", "200"), row("D5", "12/1/2025", "999")])
  assert.equal(median(rs), 20000) // 50, 100, 200, 300, 999 -> 200.00
  assert.equal(median(rs.slice(0, 4)), 20000) // even count: mean of the middle two
  assert.equal(median([]), 0)
  assert.equal(monthsBack("2026-01", 1), "2025-12")
  assert.equal(total(yearThrough(rs, 2026, "10")), 40000) // Jan–Oct 2026 leaves out November
  assert.equal(total(yearThrough(rs, 2025, "10")), 20000) // the same window a year earlier
})
