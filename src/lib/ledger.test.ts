// Run: node --test src/lib/ledger.test.ts
import assert from "node:assert/strict"
import { test } from "node:test"

import { amountQuery, blank, byIssue, findRows, rowIndex, DV_FORMAT, enrich, formFromRow, freeDvNo, label, nextDvNo, filterRows, inTab, labelOf, median, monthsBack, pairHalves, paginate, parseAmount, parseDate, peso, qs, sameChoice, serialDate, sheetDate, total, rowSig, yearThrough, type RawVoucher } from "./ledger.ts"
import { collected, COLLECTION, filterEntries, readCollections, type CollectionField } from "./collection.ts"
import { bookRoles, classifyRow, colLetter, DISBURSEMENT, detectLayout, fixedLayout, HEADERS, headerSig, inferType, layoutDiff, META, metaKeys, normalize, pullPlan, readSheet, savedFrom } from "./sheet-config.ts"
import { documentXml, zip } from "./docx.ts"
import { inflateRawSync } from "node:zlib"

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

  // Placeholder text reads as blank everywhere: Not set in reports and filters, flagged by the review checks.
  for (const t of ["", "  ", "(BLANK)", "blank", "-", "--", "N/A", "n/a", "NA", "None"]) assert.ok(blank(t), t)
  for (const t of ["ADMIN", "N/A Supplies", "-5", "Nonelectric"]) assert.ok(!blank(t), t)
  const [ph] = enrich([row("D", "01-09-26", "1,000", "-", "(BLANK)")])
  assert.equal(label(ph, "trade_area"), "Not set")
  assert.equal(labelOf(ph, "trade_area"), "Not set")
  assert.deepEqual(ph.issues, ["no_check", "no_area"])
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

test("nextDvNo", () => {
  const used = ["06-2026-01-00010", "06-2026-08-00659", " 06-2025-12-00900 ", "06-2026-13-99999", "junk"]
  assert.equal(nextDvNo(used, "2026-03-31"), "06-2026-03-00660") // year's max, month from the date; bad month ignored
  assert.equal(nextDvNo(used, "2026-08-17", ["06-2026-08-00660"]), "06-2026-08-00661") // numbers handed out this session
  assert.equal(nextDvNo(used, "2025-12-01"), "06-2025-12-00901") // trimmed; other years don't count
  assert.equal(nextDvNo([], "2027-01-02"), "06-2027-01-00001")
  assert.ok(DV_FORMAT.test("06-2026-08-00659") && !DV_FORMAT.test("06-2026-8-659"))
  assert.equal(freeDvNo(["06-2026-08-00659"], "06-2026-08-00660", "2026-08-17"), "06-2026-08-00660") // free: kept
  assert.equal(freeDvNo(["06-2026-08-00659"], "06-2026-08-00659", "2026-09-01"), "06-2026-09-00660") // taken: next free
})

test("sameChoice", () => {
  assert.ok(sameChoice(" Verified ", "VERIFIED")) // the sheet's spelling and its list's count as one choice
  assert.ok(!sameChoice("Verified", "UNVERIFIED"))
})

test("pullPlan", () => {
  const now = 1_000_000, ago = (s: number) => now - s * 1000
  const plan = (ts: number, tried: number, running = false, force = false) => pullPlan({ ts, tried, running }, force, now)
  assert.equal(plan(0, 0), "wait") // nothing cached, or just written
  assert.equal(plan(ago(10), ago(10)), "none") // fresh
  assert.equal(plan(ago(61), ago(61)), "background") // stale: serve it, pull behind it
  assert.equal(plan(ago(61), ago(5)), "none") // failed just now: no retry on every click
  assert.equal(plan(ago(61), ago(61), true), "none") // already pulling
  assert.equal(plan(0, ago(5)), "none") // nothing cached and failed just now: show the error
  assert.equal(plan(0, ago(5), true), "wait") // nothing cached, a pull is coming
  assert.equal(plan(ago(10), ago(10), false, true), "wait") // Sync
})

test("paginate", () => {
  const h = { cap: 100, start: 40, carry: 10, head: 10, gap: 0, end: 30 }
  const rows = (n: number) => Array<number>(n).fill(10) // body rows + total row
  // 3 rows + total fit page 1 (40 + 10 + 4*10 = 90); sign-off (30) spills to a new page.
  assert.deepEqual(paginate([rows(4)], h), [[{ block: 0, from: 0, to: 4 }], []])
  // 10 rows + total: page 1 takes 5, page 2 takes the other 5 + total, sign-off still fits? 10+10+60=80, +30 > 100.
  assert.deepEqual(paginate([rows(11)], h), [[{ block: 0, from: 0, to: 5 }], [{ block: 0, from: 5, to: 11 }], []])
  // Two small blocks share page 1; no rows still prints its total row.
  assert.deepEqual(paginate([rows(1), rows(2)], { ...h, start: 0 }), [[{ block: 0, from: 0, to: 1 }, { block: 1, from: 0, to: 2 }]])
  // A wrapped (taller) row moves to the next page whole.
  assert.deepEqual(paginate([[10, 10, 10, 10, 30]], h), [[{ block: 0, from: 0, to: 4 }], [{ block: 0, from: 4, to: 5 }]])
})

test("sheet layout detection", () => {
  assert.equal(normalize(" DV No. "), "dv no")
  assert.equal(normalize("DV #"), "dv no")
  assert.equal(normalize("DV Number"), "dv no")
  assert.equal(normalize("Diploma / ST / Assessment"), "diploma st assessment")
  assert.deepEqual([0, 11, 25, 26, 27, 51, 52, 701, 702].map(colLetter), ["A", "L", "Z", "AA", "AB", "AZ", "BA", "ZZ", "AAA"])

  const none = { headerRow: null, firstRow: null }
  const header = ["DV Date", "", "DV No.", "Payee", "Particulars", "Gross Amount", "", "Check #", "Trade Area", "Diploma/ST/Assessment", "Category", "Status"]
  const exp = [["KORPHIL DISBURSEMENTS 2026"], header, ["", "", "", "", "", "", "", "", "", "", "", ""], ["", "", "", "", "", 25635598.86], [], [46031, "", "06-2026-01-00001", "ACME", "Supplies", 1000.5]]
  const [layout, error] = detectLayout(exp, none)
  assert.equal(error, null)
  assert.equal(layout!.headerRow, 2)
  assert.equal(layout!.firstRow, 3)
  assert.deepEqual(layoutDiff(layout!, fixedLayout()), []) // same columns as the fixed layout
  assert.deepEqual(layout!.missing, [])

  // Three title rows added above, a column inserted after Payee, an unknown "Remarks" column and a two-line header.
  const moved = [["Title"], ["Subtitle"], ["", "", "", "", "", "Check"], ["DV date", "DV #", "Payee", "Remarks", "Gross", "Number"]]
  const [m] = detectLayout(moved, none)
  assert.equal(m!.headerRow, 4)
  assert.deepEqual(m!.columns, { dv_date: 0, dv_no: 1, payee: 2, gross_amount: 4, check_number: 5 }) // "Number" + "Check" above
  assert.deepEqual(m!.extras, [{ col: 3, text: "Remarks" }])
  assert.deepEqual(detectLayout([["DV #", "Check No"], ["", "Number"]], none)[1], "Header row 1 has no column for DV date, Gross amount.")
  assert.equal(detectLayout([["Gross"], ["DV #", "Date", "Amount"]], { headerRow: 2, firstRow: 6 })[0]!.firstRow, 6) // overrides
  assert.match(detectLayout([["a"], ["b"]], none)[1]!, /No header row/)

  const cols = fixedLayout().columns
  const kind = (row: (string | number)[]) => classifyRow(row, cols).kind
  assert.equal(kind([46031, "", "06-2026-01-00001", "ACME", "Supplies", 1000.5]), "voucher")
  assert.equal(kind(["", "", "", "", "", 25635598.86]), "skip") // totals row
  assert.equal(classifyRow(["", "", "", "", "", 25635598.86], cols).reason, "Totals or subtotal")
  assert.equal(kind(["", "", "06-2026-01-00099", "", "", ""]), "voucher") // DV # in format alone
  assert.equal(kind(["", "", "DV-17", "", "", 500]), "voucher") // sparse real voucher stays a voucher
  assert.equal(kind(["9/3/2026", "", "", "", "", "1,250.00"]), "voucher") // dates and amounts typed as text
  assert.equal(kind(["", "", "06-YYYY-MM-00000", "Payee", "", 1]), "skip") // placeholder
  assert.equal(kind([46031, "", "", "e.g. ACME Corp", "", 1]), "skip") // example row
  assert.equal(kind(["JANUARY 2026"]), "skip") // month divider
  assert.equal(kind(["", "", "", "", "", "one thousand", "", "x", "y"]), "skip") // amount written as text
  assert.equal(kind(["", "", "", "", "see note", "", "", "123", "ADMIN"]), "unsure")
  assert.equal(kind(["", "", ""]), "skip")
})

test("reading the sheet through a layout", () => {
  const header = ["DV Date", "", "DV No.", "Payee", "Particulars", "Gross Amount", "", "Check #", "Trade Area", "Diploma/ST/Assessment", "Category", "Status"]
  const v = (dv: string, extra: (string | number)[] = []) => [46031, "", dv, "ACME", "Supplies", 1000, "", "123", "ADMIN", "NC II", "Ops", "", ...extra]
  const exp = [["TITLE"], header, [], ["", "", "", "", "", 2000], v("06-2026-01-00001"), ["JANUARY"], v("06-2026-01-00002"), ["", "", "", "", "", 2000], []]
  const lists = [{ header: "Trade Area", values: ["ADMIN", "AUTO"] }, { header: "Funding Source", values: ["GAA", "STEP"] }]

  const fixed = readSheet(exp, { lists, fixed: true })
  assert.equal(fixed.source, "fixed")
  assert.deepEqual(fixed.rows, [5, 6, 7, 8]) // pre-R5: every non-blank row from row 5
  const d = readSheet(exp, { lists })
  assert.equal(d.source, "detected")
  assert.deepEqual(d.rows, [5, 7]) // month divider and totals skipped
  assert.deepEqual(d.skipped.map((r) => [r.row, r.reason]), [[4, "Above the first voucher"], [6, "Text in only one or two cells"], [8, "Totals or subtotal"]])
  assert.equal(d.nextRow, 9) // the totals row below the last voucher is never written over

  // The EXP tab: header on row 1, then a label row and a totals row that look like vouchers, then the ledger.
  const top = [header, ["..", "", "", "Cash Bal. Book", "Cash bal", "", "", "", "(BLANK)"], [0, "", 61, 486229, "x", 25635598, "", "", "(BLANK)", "(BLANK)", "", "Verified"], v("06-2026-01-00001")]
  assert.deepEqual(readSheet(top).rows, [4])
  const type = (key: string) => d.columns.find((c) => c.key === key)?.type
  assert.deepEqual([type("dv_date"), type("gross_amount"), type("particulars"), type("trade_area"), type("category")], ["date", "money", "long", "dropdown", "dropdown"])
  assert.deepEqual(d.columns.find((c) => c.key === "trade_area")!.options, ["ADMIN", "AUTO"]) // matched by list header
  assert.deepEqual(d.columns.find((c) => c.key === "category")!.options, ["Ops"]) // no list: values already in the sheet

  // A column added in the sheet: "Remarks" (text) and "Funding Source" (dropdown, from its Selection List column).
  const wider = exp.map((r, i) => (i === 1 ? [...r, "Remarks", "Funding Source"] : r.length > 6 ? [...r, ...Array(12 - r.length).fill(""), "ok", "GAA"] : r))
  const w = readSheet(wider, { lists })
  assert.deepEqual(w.columns.slice(-2).map((c) => [c.key, c.type, c.options]), [["x:Remarks", "text", []], ["x:Funding Source", "dropdown", ["GAA", "STEP"]]])

  // Without a Check # column: no column, and enrich stops flagging it.
  const noCheck = readSheet(exp.map((r, i) => (i === 1 ? r.map((h) => (h === "Check #" ? "" : h)) : r)), { lists })
  assert.ok(noCheck.layout.missing.includes("check_number"))
  const raw = { ...Object.fromEntries(Object.keys(HEADERS).map((f) => [f, ""])), dv_no: "X", dv_date: "1/1/2026", gross_amount: "5", trade_area: "A", sheet_row: 5 } as RawVoucher
  assert.deepEqual(enrich([raw])[0].issues, ["no_check"])
  assert.deepEqual(enrich([raw], ["check_number"])[0].issues, [])

  // The Selection List read by position (A, B, C) when no list header matches a column.
  const old = readSheet(exp, { lists: [{ header: "x", values: ["T"] }, { header: "y", values: ["D"] }, { header: "z", values: ["C"] }] })
  assert.deepEqual(["trade_area", "diploma_st_assessment", "category"].map((k) => old.columns.find((c) => c.key === k)!.options), [["T"], ["D"], ["C"]])
})

test("saved settings", () => {
  const meta = [
    { metadataKey: META.layout, metadataValue: JSON.stringify({ by: "a@b.c", at: "2026-10-21T00:00:00Z" }) },
    { metadataKey: META.header, location: { dimensionRange: { sheetId: 7, dimension: "ROWS", startIndex: 4 } } }, // moved down by 3 inserted title rows
    { metadataKey: META.ignore, location: { dimensionRange: { sheetId: 7, dimension: "ROWS", startIndex: 8 } } },
    { metadataKey: META.column, metadataValue: JSON.stringify({ role: "gross_amount", visibility: "readonly" }), location: { dimensionRange: { sheetId: 7, dimension: "COLUMNS", startIndex: 2 } } },
    { metadataKey: META.ignore, location: { dimensionRange: { sheetId: 99, dimension: "ROWS", startIndex: 1 } } }, // another tab
  ]
  const saved = savedFrom(meta, 7)!
  assert.deepEqual({ ...saved }, { headerRow: 5, ignored: [9], columns: { 2: { role: "gross_amount", visibility: "readonly" } }, by: "a@b.c", at: "2026-10-21T00:00:00Z" })
  assert.equal(savedFrom(meta.slice(1), 7), null) // no top-level record: nothing saved

  // Header text the app doesn't know, mapped by hand; a dummy row that looks real, ignored by hand.
  const values = [["A"], ["B"], ["C"], ["D"], ["Fecha", "Numero", "Monto", "Tag"], [46031, "DV-1", 10, "x"], [46032, "DV-2", 20, "y"], [46033, "DV-3", 30, "z"], [46034, "SAMPLE ROW", 40, "w"]]
  assert.match(detectLayout(values)[1]!, /No header row|no column/)
  const m = readSheet(values, { saved: { ...saved, columns: { ...saved.columns, 0: { role: "dv_date" }, 1: { role: "dv_no" } } } })
  assert.equal(m.source, "saved")
  assert.deepEqual(m.layout.columns, { dv_date: 0, dv_no: 1, gross_amount: 2 })
  assert.deepEqual(m.rows, [6, 7, 8]) // row 9 ignored
  assert.deepEqual(m.columns.map((c) => [c.key, c.visibility]), [["dv_date", "shown"], ["dv_no", "shown"], ["gross_amount", "readonly"], ["x:Tag", "hidden"]]) // a column with no role is hidden until Settings shows it
  assert.equal(inferType("Remarks", ["a", "b"], false), "text")
  assert.equal(inferType("Released on date", [46031], false), "date")
  assert.equal(inferType("Retention", [1, 2, ""], false), "money")
  assert.equal(inferType("Notes", ["x".repeat(80)], false), "long")
})

test("generic column filter", () => {
  const rs = enrich([{ ...row("E1", "1/1/2026"), extra: { "x:Fund": "GAA" } }, { ...row("E2", "1/1/2026"), extra: { "x:Fund": "" } }])
  assert.equal(labelOf(rs.find((r) => r.dv_no === "E2")!, "x:Fund"), "Not set")
  assert.deepEqual(filterRows(rs, new URLSearchParams("col=x:Fund&is=GAA")).map((r) => r.dv_no), ["E1"])
  assert.deepEqual(filterRows(rs, new URLSearchParams("col=trade_area&is=ADMIN")).length, 2)
})

test("amount search", () => {
  const hits = (q: string) => [99900, 500000, 1250000, 1250050].filter((v) => amountQuery(q)?.(v))
  assert.deepEqual(hits("12,500"), [1250000])
  assert.deepEqual(hits("₱12,500.50"), [1250050])
  assert.deepEqual(hits(">5000"), [1250000, 1250050])
  assert.deepEqual(hits(">= 5,000"), [500000, 1250000, 1250050])
  assert.deepEqual(hits("<1000"), [99900])
  assert.deepEqual(hits("1000-12500"), [500000, 1250000])
  assert.deepEqual(hits("12500 to 1000"), [500000, 1250000]) // either order
  for (const text of ["ACME", "06-2026-01-00001", ">", ">5-6", "1,2a"]) assert.equal(amountQuery(text), null) // searched as text only
})

test("finding rows in Settings", () => {
  const cols = [{ col: 0, type: "date" }, { col: 1, type: "text" }, { col: 2, type: "money" }]
  const idx = rowIndex([["Date", "OR #", "Amount"], [46238, "104189", 1000], [], [46239, "SAMPLE", "12,500.00"]], cols)
  assert.deepEqual(idx.map((r) => r.row), [1, 2, 4]) // blank rows aren't listed
  assert.deepEqual(idx[1].cells, ["8/4/2026", "104189", "1000"])
  const rows = (q: string) => findRows(idx, q).map((r) => r.row)
  assert.deepEqual(rows("104189"), [2]) // a reference
  assert.deepEqual(rows("sample"), [4])
  assert.deepEqual(rows("row 4"), [4]) // a row number
  assert.deepEqual(rows(">5000"), [4]) // an amount: money columns only, so date serials never match
  assert.deepEqual(rows("8/4/2026"), [2]) // dates read as dates (serial 46238)
  assert.deepEqual(rows("  "), [])
})

test("roles and options from the Selection List", () => {
  // As the live tab has it: option tables, then DVROLES (E) and COLLECTION ROLES (I).
  const lists = [
    { header: "TRADE AREA", values: ["ADMIN", "DORM"] },
    { header: "STATUS", values: ["UNVERIFIED", "VERIFIED"] },
    { header: "DVROLES", values: ["DV DATE.", "DV#", "PAYEE", "GROSS AMOUNT", "STATUS", "REMARKS"] },
    { header: "UACS CODE", values: ["4020203000 - Examination Fee"] },
    { header: "COLLECTION AREA", values: ["CANTEEN", "DORM"] },
    { header: "NATURE OF COLLECTION", values: ["Dorm Fee"] },
    { header: "COLLECTION ROLES", values: ["Reference No./OR No.", "UACS CODE", "Collection Area", "Nature of Collection", "Collection"] },
  ]
  const dv = bookRoles(DISBURSEMENT, lists)
  assert.deepEqual(dv.roles.map((r) => [r.field, r.label]), [["dv_date", "DV DATE."], ["dv_no", "DV#"], ["payee", "PAYEE"], ["gross_amount", "GROSS AMOUNT"], ["status", "STATUS"], ["x:REMARKS", "REMARKS"]])
  assert.deepEqual([dv.table, dv.custom], ["DVROLES", ["REMARKS"]]) // a name the app doesn't know is a custom role
  const co = bookRoles(COLLECTION, lists)
  assert.deepEqual(co.roles.map((r) => r.field), ["or_no", "uacs", "area", "nature", "collection", "date"]) // Date isn't listed but is required
  assert.deepEqual(co.absent, ["date", "payor"])
  assert.deepEqual(bookRoles(COLLECTION, []).roles.length, 7) // no roles table: every field

  // Options: the table named for the role (Collection Area -> COLLECTION AREA, not TRADE AREA); a table makes a dropdown.
  const H = ["Date", "Reference No./OR No.", "Payor", "UACS CODE", "Area", "Nature of Collection", "Collection"]
  const m = readSheet([H, [46238, 1, "ANA", "x", "DORM", "Dorm Fee", 1000]], { book: COLLECTION, lists })
  const col = (k: string) => m.columns.find((c) => c.key === k)!
  assert.deepEqual([col("area").type, col("area").options], ["dropdown", ["CANTEEN", "DORM"]])
  assert.deepEqual([col("nature").type, col("nature").options], ["dropdown", ["Dorm Fee"]])
  assert.deepEqual([col("payor").type, col("collection").type], ["text", "money"]) // no table, no dropdown
  assert.ok(m.columns.every((c) => !c.options.includes("DV#") && !c.options.includes("Collection"))) // role tables are never options

  // A custom role ("Deposit" added to COLLECTION ROLES): found by header text, read past the last known column, shown.
  const withDeposit = lists.map((l) => (l.header === "COLLECTION ROLES" ? { ...l, values: [...l.values, "Deposit"] } : l))
  const wide = [[...H, "Deposit", "Undeposited Collection", "AUGUST Collection"], [46238, 1, "ANA", "x", "DORM", "Dorm Fee", 1000, 500, 500, 9]]
  const d = readSheet(wide, { book: COLLECTION, lists: withDeposit })
  assert.deepEqual(d.columns.slice(-1).map((c) => [c.key, c.col, c.type, c.visibility]), [["x:Deposit", 7, "money", "shown"]]) // Undeposited and J stay out
  assert.deepEqual(d.layout.extras, [{ col: 7, text: "Deposit", custom: true }])
  assert.equal(readSheet(wide, { book: COLLECTION, lists }).columns.length, 7) // not in the roles table: not read
  // Placed by hand on a column with another header: the role's name is its key and label.
  const moved = readSheet<CollectionField>(wide, { book: COLLECTION, lists: withDeposit, saved: { headerRow: null, ignored: [], columns: { 8: { role: "x:Deposit" } }, by: "", at: "" } })
  assert.deepEqual(moved.columns.slice(-1).map((c) => [c.key, c.col, c.label]), [["x:Deposit", 8, "Deposit"]])
})

test("collection tab", () => {
  // As the sheet has it: header row 1, totals in row 2, summary tables from column J (never read).
  const H = ["Date", "Reference No./OR No.", "Payor", "UACS CODE", "Area", "Nature of Collection", "Collection", "Deposit", "Undeposited Collection", "AUGUST Collection"]
  const values = [
    H,
    ["", "", "", "", "", "", 1600, 1500, 100, 999],
    ["", "", "", "", "", "", "", "", "", "", "AUGUST"],
    [46238, 104189, "ANA", "4020213000 - Income from Venue etc", "DORM", "DORM FEE", 1000, "", "", "Collection"],
    [46239, 104190, "BEN", "4020203000 - Examination Fee", "", "AF", 500, "", ""],
    [46239, 104190, "CY", "4020203000 - Examination Fee", "DCET", "AF", 100, "", ""],
    [46240, 104191, "CANCELLED", "", "", "", "", "", ""],
    ["", "", "DEPOSIT", "", "", "", "", 1500, ""], // undated deposit row: left out, not listed as skipped
    [46240, "", "CASH DEPOSIT", "", "", "", "", 600, ""], // dated deposit row: left out too
    [46240, "", "LDDAP", "", "", "", "", "", ""], // dated, no amount, no OR #: a deposit line even with Deposit blank
  ]
  const r = readCollections(values)
  assert.equal(r.error, null)
  assert.deepEqual(r.model.layout.columns, { date: 0, or_no: 1, payor: 2, uacs: 3, area: 4, nature: 5, collection: 6 })
  assert.deepEqual(r.skipped.map((s) => [s.row, s.reason]), [[2, "Totals or subtotal"], [7, "No amount"]])
  assert.deepEqual([r.entries.length, collected(r.entries)], [3, 160000]) // agrees with row 2's Collection total
  assert.deepEqual(r.entries.find((e) => e.payor === "BEN")!.issues, ["duplicate_or", "no_area"])
  assert.deepEqual(filterEntries(r.entries, new URLSearchParams("issue=any")).map((e) => e.payor).sort(), ["BEN", "CY"])
  assert.deepEqual(filterEntries(r.entries, new URLSearchParams("area=DORM")).map((e) => e.payor), ["ANA"])
  assert.match(readCollections([["Date", "Payor"]]).error!, /no column for Collection\./)
  const bare = readCollections(values.map((v) => v.slice(0, 7))) // a sheet without Deposit reads the same
  assert.deepEqual([bare.entries.length, bare.skipped.map((s) => s.row)], [3, [2, 7]])

  // The ledger ends at its last known column: Deposit, Undeposited and the summary tables right beside them stay out.
  assert.deepEqual([r.model.layout.extras, r.model.columns.at(-1)!.key, r.model.nextRow], [[], "collection", 11])
  assert.equal(r.model.columns.find((c) => c.key === "uacs")!.type, "dropdown")
  assert.deepEqual(r.model.columns.find((c) => c.key === "area")!.options, ["DCET", "DORM"]) // no list: values already in the sheet
  // A column inserted inside the ledger is read as an extra; the summary header changing doesn't touch the write check.
  const wider = values.map((v, i) => [...v.slice(0, 5), i === 0 ? "Remarks" : "", ...v.slice(5)])
  const w = readCollections(wider)
  assert.deepEqual([w.model.layout.extras, w.entries.length], [[{ col: 5, text: "Remarks" }], 3])
  assert.deepEqual(w.entries.map((e) => e.extra), [{ "x:Remarks": "" }, { "x:Remarks": "" }, { "x:Remarks": "" }]) // extras ride on each entry
  const renamed = [...H.slice(0, 9), "SEPTEMBER Collection"]
  assert.equal(headerSig(renamed, r.model.columns), r.model.headerSig)
  assert.notEqual(headerSig(wider[0], r.model.columns), r.model.headerSig) // columns moved: writes are refused
  // A column given a role in Settings extends the ledger past the last known column.
  const roles = readCollections(values, { saved: { headerRow: null, ignored: [], columns: { 7: { role: "none" } }, by: "", at: "" } })
  assert.deepEqual(roles.model.columns.at(-1)!.key, "x:Deposit")
  // Each book keeps its own settings in the spreadsheet; vouchers keep the keys they had before R9.
  assert.deepEqual([metaKeys(COLLECTION.name).layout, META.layout], ["korphil.collection.layout", "korphil.layout"])

  // The panel form: sheet dates as ISO for the date picker, dropdowns in their list's spelling, a blank row from defaults.
  const cols = r.model.columns
  const row = { sheet_row: 4, date: "8/5/2026", or_no: "104189", payor: "ANA", uacs: "x", area: "dorm", nature: "DORM FEE", collection: "1000", extra: {} }
  const form = formFromRow(row, cols)
  assert.deepEqual([form.date, form.area, form.collection], ["2026-08-05", "DORM", "1000"])
  assert.deepEqual(formFromRow(null, cols, { date: "2026-11-09" }).date, "2026-11-09")
  // What the row held when the form opened: any cell changed in the sheet changes it, so the save is refused.
  assert.notEqual(rowSig(row, cols), rowSig({ ...row, payor: "ANNA" }, cols))
  assert.equal(rowSig(row, cols), rowSig({ ...row, payor: "ANA " }, cols)) // stray spaces don't count
})

test("docx", () => {
  const xml = documentXml("T", "S", [{ title: "A", highlights: [], head: ["x"], width: [1], right: [false], rows: [["a & <b>"]] }])
  assert.match(xml, /a &amp; &lt;b&gt;/)
  assert.deepEqual(xml.match(/r:embed="rId\d"/g), ['r:embed="rId2"', 'r:embed="rId3"', 'r:embed="rId4"']) // the three letterhead logos
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]), one = zip([["a.png", png]]) // a binary part comes back byte for byte
  assert.deepEqual(inflateRawSync(one.subarray(30 + one.readUInt16LE(26), 30 + one.readUInt16LE(26) + one.readUInt32LE(18))), png)
  // Control characters pasted from the sheet are illegal in XML and would stop Word opening the file.
  const pasted = documentXml("T", "S", [{ title: "A", highlights: [], head: ["x"], width: [1], right: [false], rows: [["tab\there\u000Bvt\u0001"]] }])
  assert.match(pasted, /tab\therevt</)
  assert.doesNotMatch(pasted, /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/)
  const z = zip([["word/document.xml", xml]]), size = z.readUInt32LE(18), name = z.readUInt16LE(26)
  assert.equal(z.readUInt32LE(0), 0x04034b50)
  assert.equal(inflateRawSync(z.subarray(30 + name, 30 + name + size)).toString(), xml) // the stored file comes back intact
})

test("pairHalves", () => {
  const wide = (k: string) => k === k.toUpperCase()
  const lay = (ks: string) => pairHalves([...ks], wide).join("")
  assert.equal(lay("abPUcNd"), "abPUcdN") // collection panel: Area pairs with Collection, Nature after
  assert.equal(lay("abPcd"), "abPcd") // already paired: unchanged
  assert.equal(lay("aBc"), "acB") // a lone half pulls the next half up
  assert.equal(lay("aB"), "aB") // nothing to pair with: order kept
})
