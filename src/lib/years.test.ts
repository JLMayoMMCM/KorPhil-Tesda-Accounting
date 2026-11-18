// Run: node --test src/lib/years.test.ts
import assert from "node:assert/strict"
import { test } from "node:test"

import { parseYears, pickYear, sheetIdOf, yearsFor, YEARS_HEADER } from "./years.ts"

const ID = (n: number) => `1AbC${String(n).padStart(2, "0")}defGHIjklMNOpqrSTUvwxYZ_-0123`
const link = (n: number) => `https://docs.google.com/spreadsheets/d/${ID(n)}/edit#gid=0`

test("sheetIdOf keeps only docs.google.com spreadsheet IDs", () => {
  assert.equal(sheetIdOf(link(1)), ID(1))
  assert.equal(sheetIdOf(`  https://docs.google.com/spreadsheets/d/${ID(2)}  `), ID(2))
  assert.equal(sheetIdOf(`http://docs.google.com/spreadsheets/d/${ID(1)}`), null) // not https
  assert.equal(sheetIdOf(`https://docs.google.com.evil.example/spreadsheets/d/${ID(1)}`), null)
  assert.equal(sheetIdOf(`https://evil.example/?u=https://docs.google.com/spreadsheets/d/${ID(1)}`), null)
  assert.equal(sheetIdOf("https://docs.google.com/spreadsheets/d/short"), null)
  assert.equal(sheetIdOf(""), null)
})

test("parseYears reads rows by header, in any column order, and skips what it can't use", () => {
  const rows = parseYears([
    ["Status", "Year", "Module", "Spreadsheet link", "Tab"],
    ["Read only", "2025", "Disbursement", link(1), ""],
    ["", 2026, "collection", link(2), "Collections 2026"],
    ["Active", "26", "Disbursement", link(3), ""], // not a 4-digit year
    ["Active", "2024", "Payroll", link(4), ""], // unknown module
    ["hidden", "2023", "DV", "not a link", ""],
  ])
  assert.deepEqual(rows.map((r) => [r.row, r.year, r.module, r.id, r.tab, r.status]), [
    [2, "2025", "voucher", ID(1), "", "Read-only"],
    [3, "2026", "collection", ID(2), "Collections 2026", "Active"],
    [6, "2023", "voucher", "", "", "Hidden"],
  ])
  assert.deepEqual(parseYears([]), [])
  assert.deepEqual(parseYears([["Year", "Module"]]), []) // no link column
  assert.equal(parseYears([[...YEARS_HEADER], ["2026", "Disbursement", link(5), "", "Active", "a@b", "2026-11-18"]])[0].by, "a@b")
})

test("yearsFor and pickYear: newest first, hidden and broken rows left out, the asked-for year kept when present", () => {
  const rows = parseYears([
    [...YEARS_HEADER],
    ["2024", "Disbursement", link(1), "", "Read-only"],
    ["2026", "Disbursement", link(2), "", "Hidden"],
    ["2025", "Disbursement", link(3), "", "Active"],
    ["2025", "Disbursement", link(4), "", "Active"], // a second 2025 row: the first wins
    ["2027", "Disbursement", "bad link", "", "Active"],
    ["2026", "Collection", link(5), "", "Active"],
  ])
  assert.deepEqual(yearsFor(rows, "voucher").map((r) => [r.year, r.id]), [["2025", ID(3)], ["2024", ID(1)]])
  assert.equal(pickYear(rows, "voucher", "2024")?.year, "2024")
  assert.equal(pickYear(rows, "voucher", "2026")?.year, "2025") // hidden: falls back to the newest Active
  assert.equal(pickYear(rows, "voucher", "")?.year, "2025")
  assert.equal(pickYear(rows, "collection", "2024")?.year, "2026")
  // Only closed years: the newest of them.
  assert.equal(pickYear(rows.filter((r) => r.status === "Read-only"), "voucher", "")?.year, "2024")
  assert.equal(pickYear([], "voucher", "2025"), null)
})
