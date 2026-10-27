# Revisions

## R1 · Remove overdue tracking (shift toward audit) · 2026-09-30

**Goal:** the app no longer tracks or flags overdue vouchers. A voucher is **Pending** or **Paid**. Due dates still sort the work, but nothing is labelled late. Audit work is scoped separately (see R2).

### Done

- [x] `src/lib/ledger.ts`: dropped the `overdue` state, `days_late`, the `late` / `late30` buckets and the `overdue` tab. `STATUSES` is now `PENDING | PAID`. A legacy `OVERDUE` cell in the sheet reads as pending. Past-due unpaid rows go to the `later` bucket, now labelled "Not due this week".
- [x] Workspace (`src/app/(app)/page.tsx`): removed the Overdue group, the "N days late" labels and the Overdue row in the open balance.
- [x] Vouchers (`src/app/(app)/vouchers/page.tsx`): removed "Nd late" from the list and the side-panel badge.
- [x] Trade Areas (`src/app/(app)/areas/page.tsx`): removed the late columns and their red heat ramp. Columns are now Due this week · Not due this week · Paid.
- [x] Dashboard (`src/app/(app)/dashboard/page.tsx`): removed the Overdue card (3 cards now), the "Unpaid by age" chart and the overdue sentence in the summary.
- [x] Reports (`src/lib/reports.ts`, `reports/page.tsx`): removed the "Unpaid and overdue aging" template. The audit extract stays.
- [x] Sidebar, `StatusBadge`, `StatusMark`, report `Totals` strip and the `--chart-overdue` token: overdue variants removed.
- [x] `undoPaid` still accepts `OVERDUE`, so undoing a mark-paid on a legacy row restores the original cell.
- [x] Login page: replaced "See what's overdue first" with an audit-ready point.
- [x] `ledger.test.ts` updated. `tsc`, `eslint` and `node --test` all pass.

R1's Pending/Paid model was superseded the same day by R2.

## R2 · Align to the EXP sheet · 2026-09-30

**Goal:** the app reads and writes the **EXP** tab of the shared sheet (`1rmpdcCB…hxBs`). EXP is a disbursement ledger with no due date and no status, so everything built on those columns is gone. The app shifts to audit: it flags vouchers with gaps and lets you fix them.

**EXP layout (A:J):** DV date · (blank spacer) · DV # · Payee · Particulars · Gross amount · Check # · Trade area · Diploma/ST/Assessment · Category. Row 1 is the header, rows 2–3 hold labels and totals, and data starts on row 5. M:O hold the dropdown lists for H:J; the app doesn't read or write them.

### Done

- [x] `sheets.ts`: new column map; reads `EXP!A:J` from row 5 and writes A:J only. Default range is `EXP`. Removed `setStatuses`.
- [x] `ledger.ts`: dropped status, due date, buckets and the unpaid/week/paid tabs. Added `check_number` and the review checks: **No DV #, Duplicate DV #, No DV date, No amount, No check #, No trade area**. Tabs are now All · Needs review. Rows sort newest DV date first. `parseDate` also reads EXP's `mm-dd-yy`.
- [x] Actions: removed `markPaid` / `undoPaid`. `saveVoucher` now refuses any row number below 5, so a crafted request can't overwrite the header or the totals formulas.
- [x] Workspace: "Needs review" queue grouped by check (long groups start collapsed), each row with a **Fix** link. The right rail shows totals disbursed this month, last month and overall, plus totals by trade area.
- [x] Vouchers: Check # and Review columns; a "Review check" filter (`?issue=`); bulk bar is Export / Clear. The edit panel drops Status and Due date and adds Check #.
- [x] Trade Areas: a grid of trade areas by DV month, with a total and a share of total.
- [x] Dashboard: cards for Disbursed · With check # · Needs review; a "Needs review" chart replaces the Status donut and the "Due in 14 days" chart.
- [x] Reports: Monthly · Trade area · Diploma/ST/Assessment · Category · Payee · Needs review · Audit extract. The status filter is gone.
- [x] Removed `StatusBadge`/`StatusMark`, the `--chart-pending/paid` tokens, `Donut`, `ColumnChart`, and the pay flow in `app-ui` / `selection`. Added `issue-badges.tsx`.
- [x] `.env.local` points at the shared sheet with range `EXP` (backup of the old values is in the session scratchpad).
- [x] Checked the live read with the API key: 641 vouchers, ₱25,635,598.86 (matches EXP!F3). Flags: 17 No DV #, 10 Duplicate DV #, 79 No check #, 1 No trade area.
- [x] `tsc`, `eslint` and `node --test` pass.

### Follow-ups

- [ ] **Production env:** set `GOOGLE_SHEET_ID` and `GOOGLE_SHEET_RANGE=EXP` on Vercel.
- [ ] **Sharing:** everyone who signs in needs the sheet shared with them. Editors can save; Viewers can only look.
- [ ] **Browser check:** verify in the running app after a Google sign-in. Nothing has been checked on screen yet.
- [ ] **Stored formulas:** saving a row writes values, so the few amount cells that are formulas (e.g. F199 `=5940/2`) become plain numbers.
- [ ] **Old links:** `?tab=unpaid|week|paid`, `?bucket=…`, `?report=summary|aging` and `?status=` fall back to All or Monthly.
- [ ] **Design docs:** `DESIGN.md` and `.impeccable/` still describe status marks and due buckets. `MIGRATION.md` stays as a historical record.
- [ ] **Category checks:** "No category" and "No Diploma/ST/Assessment" aren't flagged, because category is blank on about half the rows (it looks optional). Add them to `ISSUES` if they're required.

## R3 · Ponytail audit + dashboard KPIs · 2026-10-05 

### Part A: audit (over-engineering only, ranked biggest cut first)

App code (`src/lib`, pages, own components) is lean: no unused exports, no stdlib re-implementations, every dependency is used. The cuts are in vendored shadcn files and duplicated agent docs.

- [x] **delete** the unused shadcn components `ui/select.tsx` (200), `ui/tabs.tsx` (81), `ui/toggle-group.tsx` (89) and `ui/toggle.tsx` (44, which only `toggle-group` imports). Nothing imports them. Re-add with `npx shadcn add` when needed. About -414 lines.
- [x] **delete** the unused exports in vendored `ui/sidebar.tsx`: `SidebarGroupAction/Content/Label`, `SidebarInput`, `SidebarMenuAction`, `SidebarMenuSkeleton`, `SidebarSeparator`. About -120 lines. Optional: a `shadcn add` re-adds them.
- [x] **delete** the unused exports in `ui/dropdown-menu.tsx` (the `Sub*`, `Radio*`, `CheckboxItem`, `Shortcut`, `Portal` exports) and `ui/field.tsx` (`FieldSet/Legend/Description/Error/Separator/Content/Title`). About -150 lines. Optional, for the same reason.
- [x] **delete** `.agents/skills/` if only Claude Code is used. It duplicates `.claude/skills/shadcn` and `migrate-radix-to-base`.
- [x] **shrink** `prevMonth` in `(app)/page.tsx`, which duplicates `monthsBack` in `dashboard/page.tsx`. Move `monthsBack` to `ledger.ts` and use it in both.
- [x] **fix** the stray comment in `lib/nav.ts`: the `safeNext` doc comment sits above `HOME`.

Net: about -730 lines, -0 deps (`shadcn`, `server-only` and `cn` are all used: `globals.css` imports `shadcn/tailwind.css`).

### Part B: dashboard KPIs / analytics

**What the dashboard has now:** verified %, the three states (Verified / Ready / Needs fixing), the monthly trend (verified vs for review), blockers by check, verification by trade area, category, program split and top payees. This month vs last month appears only inside the Summary popover.

**Proposed:** a KPI strip under the year switcher, server-rendered, in the same `dl` ledger-strip pattern as `Totals` in `charts.tsx`. No new deps and no new chart. Each KPI is one value plus one comparison line, computed from `rows` that the page already has.

- [x] **Disbursed (scope):** `total(rows)` and the voucher count. Comparison: the same period last year (Jan to the current month), shown only when a single year is selected.
- [x] **This month:** `total(monthRows)` and its % change on last month. Moved out of the Summary popover; the popover keeps its sentence.
- [x] **Average voucher:** `total / count`, with the median beside it. The median shows skew from a few large DVs.
- [x] **Check # coverage:** the share of vouchers (and pesos) with a check #. The dashboard dropped "With check #" in R2; Reports still shows it.
- [x] **Payee concentration:** the top-5 payees' share of the total, from the existing `payees` array. An audit risk signal.
- [x] **Category completeness:** the share of vouchers with a blank category. This ties to the R2 follow-up: it shows the gap without making it a review flag.
- [x] `ledger.test.ts`: one test for the median and the same-period-last-year sum (the only new logic).

**Deliberately skipped:**
- Verification throughput / time-to-verify: the sheet has no verified-at date. It needs a column first.
- Outlier detection (e.g. above P95): add it if auditors ask. It would be a "Large amount" review check in `ISSUES`, not a KPI.
- Per-KPI sparklines: the trend chart already covers time.

**Built:** `<dl>` strip in `dashboard/page.tsx` on gap-px hairlines, wrapping 2 → 3 → 6 columns. `median`, `monthsBack` and `yearThrough` moved into `ledger.ts`, with tests. The month comparison and the Summary popover share one `change()` helper. `tsc`, `eslint` and `node --test` pass. The browser check is still open (it needs a Google sign-in).

**Done when:** the strip renders for a single year and for All years, the empty-year state still shows, the layout is fine at phone width and in print, and `tsc`, `eslint` and `node --test` pass.

## R4 · Reports revision · 2026-10-20

**Goal:** reports read like a formal financial report: the office letterhead, full tables, a standard order, period filters and KPIs.

### Done

- [x] **Letterhead:** Bagong Pilipinas + TESDA logos left, the KorPhil VTC seal right, the four-line TESDA XI / RTC – KorPhil VTC / Buhisan Tibungco address centred, as on the office's printed header. Later pages carry a one-line running header.
- [x] **Logos:** `public/logo.webp` was removed, so the favicon, sidebar and login now use `tesda_korphil_logo.png`. The proxy matcher lets every `.png` through without a session.
- [x] **Order:** Key performance indicators → by category (nature) → by trade area → by diploma / ST / assessment (segments) → by month → by payee → exceptions → voucher register. The sidebar and the contents page group them as Overview · Analysis of disbursements · Period and payee · Compliance.
- [x] **Tables:** No. · label · vouchers · amount · average · % of total, with a total row. The share bars are gone. Monthly lists every month in the period oldest first (zero months included) with a cumulative column; "Not set" and "Undated" lines sit at the foot. Cells wrap instead of truncating; pagination estimates wrapped row heights.
- [x] **Periods:** All dates · Month · Quarter · Year · Range of months, headed IFRS-style ("For the quarter ended September 30, 2026"). A bare `?month=` from old links still means that month.
- [x] **KPIs:** total, count, average, median, largest voucher, average per month (elapsed months only), payees, top-5 payee share, check # coverage, verified share, exception rate and amount, each against the prior period of the same length with a change column (% or pp).
- [x] **CSV:** one titled section per table, same columns as the page.
- [x] `paginate` takes per-row heights; test updated. `tsc`, `eslint` and `node --test` pass. Period and KPI logic checked against synthetic data.

### Follow-ups

- [ ] **Browser check:** the report page needs a Google sign-in; the layout and the page-height estimates (`H` in `reports/page.tsx`) are not yet checked on screen or in print.

## R5 · Modular sheet · 2026-10-21

**Goal:** the app follows the Google Sheet's layout instead of hard-coding it, in six phases with no structural change to the sheet (plan: *KorPhil-TESDA Accounting — Modular Sheet Revision Plan*). Today's layout stays the fallback throughout. All six phases (0–5) are built. `SHEET_LAYOUT` defaults to `fixed`, so the live app keeps the Phase 0 layout until Settings confirms the detected layout matches and `SHEET_LAYOUT=detected` is set.

### Phase 0 · Write-path safety

- [x] **Cell writes only:** every save goes through `writeCells` in `sheets.ts`, one `values:batchUpdate` range per cell. Spacer columns B and G are no longer blanked, and an edit writes only the fields that differ from the sheet, so untouched formula cells (e.g. F199 `=5940/2`) stay formulas.
- [x] **RAW codes:** DV # and check # are written `RAW`; dates, amounts and the rest stay `USER_ENTERED`. A new voucher is appended with those two cells left empty, then they are written `RAW` into the row Google reports.
- [x] **Re-check before save:** `saveVoucher` re-reads the sheet and refuses if the row no longer holds the DV # the form opened with ("Sync and try again"), as `renumberVoucher` already did.
- [x] **Cache keyed by sheet ID.**
- [x] **Write log:** each written cell logs `[sheet write]` with range, old value (as last pulled), new value and the user's email, beside the sheet's own version history.
- [x] Settings and `readme.md` say A:L (from `LAST_COLUMN`), not A:J.

### Phase 1 · Layout detection in shadow mode

- [x] `src/lib/sheet-config.ts`: the fixed layout (`FIXED`, replacing `COLUMNS` / `FIRST_ROW` / `LAST_COLUMN`), accepted header text per field, required fields (DV #, DV date, gross amount), optional `SHEET_HEADER_ROW` / `SHEET_FIRST_ROW` overrides, `normalize`, `colLetter`, `detectLayout`, `classifyRow`.
- [x] The pull now reads the whole tab (no column limit). Detection searches the top 20 rows for the header with the most known headers (joining a cell with the one above for two-line headers) and classifies every row below it: voucher, skipped (blank, placeholder, sample/instruction text, totals, amount as text, one or two cells) or unsure.
- [x] **Settings → Detected layout:** field · column · header in sheet · found/missing/extra, the skipped and unsure rows with their reason, and whether it matches the fixed layout and today's row count. (Became the "Sheet layout" card in Phase 2.)
- [x] Tests: normalization and aliases, header-row detection with title rows and a two-line header, overrides, the row classifier (totals, placeholder, example, sparse voucher), `colLetter` past Z.

### Phase 2 · Reads and writes through the column map

- [x] `readSheet` in `sheet-config.ts` turns the whole tab into a `SheetModel`: layout, columns, voucher rows, skipped rows, the next empty row and a header signature. Precedence: saved settings → detection → fixed.
- [x] **Rollback switch:** `SHEET_LAYOUT=detected` reads and writes through that model; anything else (the default, `fixed`) keeps Phase 0 exactly, including the pre-R5 "every non-blank row from row 5" read and the `INSERT_ROWS` append. Detection failing also falls back to fixed, with the reason on Settings.
- [x] Reads: detected rows go through the classifier; **unsure rows are still read** (nothing is dropped silently) and are listed on Settings. Each voucher keeps its real `sheet_row`, plus `extra` values for columns with no role.
- [x] Writes: one `values:batchUpdate` range per cell, addressed through the model. DV #, check # and payee are `RAW`; the rest `USER_ENTERED`. `setDvNo` and `setStatuses` use the same path.
- [x] **Before every write** the header row and each target row are re-read (one `batchGet`): a changed header, a target row whose DV # moved, or a row that isn't a voucher refuses the save with "Sync and try again".
- [x] New voucher (detected): written into the first row after the last voucher that is empty in every mapped column, checked empty first. A totals row right below the data is skipped over, never written into (open decision 1, answered "insert below it").

### Phase 3 · Modular inputs

- [x] The voucher panel is built from the columns in sheet order, labelled with the sheet's header text. Input type: dropdown (Selection List column with the same row-1 header), date ("date" in the header, or dates typed as text), money (mostly numbers), long text (mostly over 60 characters), else text. Core roles keep fixed types (Particulars always long text, etc.).
- [x] Dropdowns match Selection List columns by header; when no header matches any column, the old A, B, C order is the fallback.
- [x] Extra columns get inputs and are saved; read-only columns show disabled; hidden ones don't show. They're in the CSV export, not in the vouchers table (open decision 2, answered "panel and CSV only").
- [x] Missing optional roles: no Check # → "No check #" flag and coverage KPI off; no Trade area → its flag and report off; no Status → Verify / For review bulk buttons hidden; no Payee → payee report hidden.

### Phase 4 · Generic reports and filters

- [x] Every dropdown column without a role gets a "Disbursements by …" section (`?report=x:<header>`), after the category / trade area / diploma sections in Analysis of disbursements and in the full report, in the R4 table format; the CSV follows. The three existing sections and their order are unchanged.
- [x] Dashboard: "Summary per …" groups by any dropdown column (trade area by default) with a Group by picker; each group links to the vouchers list through a new generic `?col=&is=` filter (trade area still uses `?area=`).

### Phase 5 · Settings editor

- [x] **Settings → Layout settings:** a grid of the first 20 rows to pick the header row and rows to ignore (plus a box for rows further down); per column: role, input type, visibility. **Check** shows "N vouchers read, N rows ignored, all required roles mapped"; **Save** is refused while DV #, DV date or gross amount is unmapped or not shown; **Reset to auto-detect** removes the settings. Last author and time are shown.
- [x] Stored as developer metadata, visibility `PROJECT`: a spreadsheet-level record (who and when), a tag on the header row, one on each ignored row, and one per configured column holding its role, type and visibility (kept on the column so it survives moves; the plan's single spreadsheet-level JSON was split this way for that reason). Rows inserted above keep the tags in place.
- [x] Permissions come from Google: writing metadata needs edit access, so a Viewer's save fails with the usual "share it with you as Editor" message.
- [x] Tests: `readSheet` (fixed vs detected rows, totals skipped, next row, types, list matching by header and by position, an added Remarks and Funding Source column, a missing Check # column), `savedFrom` (moved header tag, ignored row, column role, another tab's tags), hand-mapped roles for unknown headers, `inferType`, the generic `col`/`is` filter. `tsc`, `eslint` and `node --test` (8 groups) pass.

### Follow-ups

- [ ] **Turn it on:** open Settings against the live sheet. The "Sheet layout" card should say "Same columns as the fixed layout" with the voucher count close to the fixed one (641+; unsure rows are counted, skipped ones listed). Then set `SHEET_LAYOUT=detected` (first on a test-copy preview, then on Vercel). If a header shows as Missing, add its text to `HEADERS` in `sheet-config.ts` or map it in Layout settings. The live sheet couldn't be reached from the dev sandbox.
- [ ] **Test copy:** run the plan's scenarios on a copy (inserted / removed column, three title rows, instruction rows, totals moved to the bottom then a new voucher, sort while a voucher is open, a Remarks column and a dropdown column with its Selection List column), and save settings as an Editor and as a Viewer.
- [ ] **Unverified against Google:** the developer-metadata calls (search, create, delete) and `values:batchGet` follow the API reference but have not run against a real sheet.
- [ ] **Build and browser check:** `next build` wasn't run (the sandbox can't fetch Google Fonts) and nothing has been checked on screen; this also covers the R3/R4 browser follow-ups.
- [ ] **Not done from the plan:** two columns with the same header pick the first, not "the one holding the expected data type"; the Trade Areas page stays trade-area only.
- [ ] **Open decisions left:** whether only named people (not all Editors) may change settings; several sheet files (one per year) as a later revision.


## R6 · Reports redo: modularity, consistency, formality, transparency · 2026-10-27

**Goal:** the same report, built from parts that read the same everywhere, in a formal register, and showing how every figure was reached.

### Done

- [x] **Modularity:** `reports.ts` builds each schedule from a `BUILDERS` registry (one function per report, a shared `Ctx` instead of five arguments); breakdowns (category, trade area, program, payee, extra dropdown columns) share one `breakdown()`. The page's sheet parts moved to `components/report-sheet.tsx` (`layout`, `Letterhead`, `RunningHeader`, `Contents`, `Schedule`, `SignOff`, `PageFooter`); `reports/page.tsx` only holds the controls and composes the pages.
- [x] **Consistency:** shared column definitions (No., Vouchers, Amount (₱), Average (₱), % of total) and one "Total" row label across schedules; the register's total row matches the others. Every schedule has a basis line under its title and numbered notes under its table, on the page and in the CSV.
- [x] **Formality:** schedules are numbered ("Schedule 3. Disbursements by trade area") in every report and in the contents; the title block states "Amounts in Philippine pesos (₱)", so table amounts print without the sign (KPIs keep it, as their rows mix units); totals carry the accounting rule (single line above, double below); the sign-off adds a date line; the footer reads "System-generated from … · date · Page x of y".
- [x] **Transparency:** every report ends with a **Basis of preparation**: source sheet and when it was pulled, period, trade area, vouchers on record, what was left out (other trade areas, dated outside the period, undated) so the counts add up, vouchers whose amount was blank or unreadable (counted as ₱0.00), a **reconciliation** of each schedule's total against the vouchers in scope (computed, and says which schedule differs if any), rounding, and who generated it when. KPI and exception schedules define their measures and checks, including that a Verified voucher is flagged only for a duplicate DV #. The register adds the sheet **Row** so each line traces to its source, and lists **every column the sheet shows** (all but Hidden, extra columns included) with the sheet's own headers, two lines per voucher (line 1: Row · DV date · DV # · payee · check # · amount · review; line 2, indented: particulars and the rest in sheet order). The CSV keeps one line per voucher in sheet order. The full report now ends with the register as its supporting schedule. An empty scope still prints the basis.
- [x] `tsc`, `eslint` and `node --test` pass. `buildReport` was smoke-run on synthetic vouchers (full report, register, empty scope): exclusions add up to the vouchers on record and the reconciliation agrees.

### Follow-ups

- [ ] **Browser check:** the report needs a Google sign-in; the new basis/notes heights in `layout()` are estimates and not yet checked on screen or in print.
