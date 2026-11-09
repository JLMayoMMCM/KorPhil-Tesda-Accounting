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

## R7 · Dashboards, review colours and Word export · 2026-11-03

**Goal:** clearer dashboards in both modules, one colour for "for review" everywhere, and reports staff can edit in Word.

### Done

- [x] **Word export (exception to the PRODUCT.md constraint, asked for by the accounting office):** each report page has **Download Word** next to Download CSV. `src/lib/docx.ts` writes the .docx with Node's own zlib (no new dependency): letterhead text, title and scope, each schedule with its basis, highlights, table (header repeats on each page, total row) and notes, on the report's paper size. Opened and checked in Microsoft Word.
- [x] **Vouchers dashboard:** trend chart redrawn (smooth line, peso axis, no grid, dots per month or week, verified drawn over the for-review band, ends at the last date with data); the By quarter crash fixed; the per-group summary is a searchable, sortable list beside the selected group's figures.
- [x] **Collection dashboard:** chart starts at the first month with collections; UACS as ranked bars with a total; Deposits as a donut by type (LDDAP, check, cash, other) with the latest three; Exceptions renamed Needs review. The year/month switcher and the four figure tiles are unchanged.
- [x] **For review** uses the Ready to verify blue (`--review`) for marks, bars and chart bands; the voucher panel's Status field takes its state's colour; dropdown lists are styled where the browser supports it.
- [x] Collections list shows the UACS code; every page has a loading skeleton.
- [x] `tsc`, `eslint`, `node --experimental-strip-types --test` and `next build` pass.

### Follow-ups

- [ ] **Browser check (signed in):** dashboards, trade-area list, Status field and the Word downloads on real data.
- [ ] `npm test` needs Node 22.18+ (or `--experimental-strip-types`) to run the `.ts` tests.

## R8 · QOL updates · 2026-11-05

**Goal:** quicker navigation, DV numbers filled in for you, sheet edits that appear on their own, saved reports that carry the logos, and New/Edit DV forms that follow the sheet.

### Done

- [x] **DV # autofill:** New DV opens with today's date and `nextDvNo`. The number follows the date until the user types their own. An append now re-reads the sheet first; a number already taken becomes the next free one (`freeDvNo`, shared with `renumberVoucher`) and the toast says so.
- [x] **New/Edit DV follow the sheet:** the detected layout is now the default (`SHEET_LAYOUT=fixed` rolls back), so labels are the sheet's own headers and added columns appear as inputs. Reading starts at the first row with a date or a DV # in format, so the label and totals rows stay out; on the live sheet both layouts read the same 641 vouchers and ₱25,635,598.86. Status keeps its colours from R7 but takes its options from the Selection List, and saving no longer turns other values into For Review. Dropdown values match regardless of capitalization, so opening and saving a voucher doesn't rewrite "Verified" as "VERIFIED".
- [x] **Saved reports:** PDF logos use the original files, loaded eagerly, and appear small on every later page. The button reads "Save as PDF" and suggests the report's name and period (`reportFile`, shared with the CSV and Word routes). The Word letterhead now has the three logos, on its first page; `next.config.ts` ships them with the Word routes.
- [x] **Report page fit:** corrected the row estimates (borders, the register's gaps, all-caps names). Now no page runs past the paper in the voucher full report on Short, Long or A4 (94, 74 and 87 pages) or in the collection full report on Short (43 pages).
- [x] **Sidebar:** R7's skeletons already give instant feedback and prefetching, so only voucher row links changed (no prefetch). Opening a row doesn't bring the skeleton back. The file link, collapsed, is the icon alone, with the file's name in the tooltip and accessible label.
- [x] **Sync:** a cache older than 60 s is served at once and refreshed behind it (`pullPlan`, tested). One pull runs at a time, failures wait 15 s before retrying, and a write or Sync still waits for fresh data. Open pages refresh every minute and when the tab regains focus, unless a form has unsaved edits or a dialog or toast is open.
- [x] `tsc`, `eslint`, `node --test` and `next build` pass. Checked against the live sheet with a read-only local session (no Google token, so writes are refused).

### Not changed

- The sidebar's collapse animation stays: re-laying out the table took 2.7 ms on average (9.9 ms at worst) at 50 rows, inside a 16 ms frame. The same check at 641 rows was inconclusive.

### Follow-ups

- [ ] **Real save:** saving a New or Edit DV, including the "already taken" path, needs a signed-in Editor. It has unit tests for the rule but hasn't been run end to end.
- [ ] **Open the files:** the Word files were checked as valid packages holding the three logos, and the PDF file name was checked, but neither was opened in Word or a PDF viewer.
- [ ] **Lists vs cell rules:** columns J and K only allow values from `O4:O45` and `P5:P38` (strict), but the form offers the Selection List. `(BLANK)`, `CENTER ADMINISTRATION`, `ELECTRECITY` and the list's own header in J, and `(BLANK)` in K, aren't in those ranges, so Google may refuse them. Status spells its options in capitals in the Selection List but "For Review" / "Verified" in column L's rule. Align them in the sheet.
- [ ] **DV # rule:** confirm the format with accounting (see the note at `DV_FORMAT`). A mistyped high number pushes every later number up, since the sequence follows the year's highest.
- [ ] **Several server instances:** each keeps its own cache, so Sync on one doesn't update another at once. If that shows up on Vercel, move to `unstable_cache` with `revalidateTag`.

## R9 · Collection: no deposits, CRUD, one sheet engine · planned 2026-11-09

**Goal:** the app stops knowing about Deposit / Undeposited Collection (the sheet keeps them), collections get New / Edit / Delete like vouchers, and both modules run on one sheet engine with no fixed column lists or table headers.

### What's there now

- **Deposit** is still a field (`COLLECTION_HEADERS.deposit`, `COLLECTION_LABELS.deposit`), read only so `readCollections` can drop deposit rows; tests at `ledger.test.ts:236-257`; the report note in `collection-reports.ts:163`. Undeposited is never read.
- **Collection is read-only and runs on its own path:** `readCollections` + `Layout<CollectionField>` (no `Column[]`, types, visibility or extras) and a separate `collectionPull` cache. Disbursement runs on `readSheet` → `SheetModel` → `writeCells` / `appendVoucher` / `VoucherPanel`.
- **Fixed things found:**
  1. `COLLECTION.lastCol: 8`: the ledger must be A:I; inserting a column pushes the last one out of reach.
  2. `sheets.ts` writes are bound to `SHEET_ID`, `TAB`, the one `state()` cache, `dv_no` as the row's identity and `RAW_KEYS` by name.
  3. `readSheet`, `classifyRow`, `TYPE_OVERRIDES`, `LIST_ORDER`, `fixedLayout` and `HEADERS` only know disbursement fields.
  4. Settings metadata keys (`korphil.layout`, `korphil.column`, …) aren't per module: when `COLLECTION_SHEET_ID` is the same spreadsheet, the spreadsheet-level `korphil.layout` tag is shared.
  5. `headerSig` is the whole header row; on Collection that includes the summary tables (J+), whose monthly titles change, so every write would be refused.
  6. Collections list (`collections/page.tsx`) and the cash receipts register (`collection-reports.ts:136`) hard-code their columns; added sheet columns never show. The vouchers list already shows extras.
  7. Collection settings is a read-only field table; vouchers have the role/type/visibility editor (`layout-editor.tsx`).

### Phase 1 · Drop deposits (small, ships alone) · done 2026-11-09

- [x] Remove `deposit` from `COLLECTION_HEADERS` and `COLLECTION_LABELS`; Deposit and Undeposited become unknown columns (extras once Phase 2 lands), never written.
- [x] Row rule without the Deposit column: a row with no Collection amount **and no OR #** is dropped quietly (deposit lines, blanks); one with an OR # but no amount is still listed under "Rows not read", so a real receipt gap stays visible.
- [x] Update the tests (deposit rows still drop out, now without a Deposit column) and the report source note.

### Phase 2 · One sheet engine (modularity) · done 2026-11-09

- [x] **A `Book` per module** (`sheet-config.ts`): headers, required fields, bound, env overrides, input types, positional lists, RAW keys, row classifier, optional start rule and fixed fallback. `DISBURSEMENT` lives in `sheet-config.ts`, `COLLECTION` in `collection.ts`; the engine names no module's fields.
- [x] `readSheet(values, { book, saved, lists, fixed })` gives either module a `SheetModel` with `Column[]` (types, options, visibility, extras). `SheetModel.vouchers` is now `rows`; a book with no fixed fallback reads `source: "none"` with the detection error. `readCollections` is `readSheet` + `entriesFrom`; the deposit rule is the collection book's `classify`.
- [x] **No `lastCol`, but not "first blank header" either:** on the live tab, Deposit, Undeposited and the monthly summary columns (J:L) sit right beside the ledger with no gap. So a book has a `bound`: vouchers read the whole header row (as before); collections end at the last column with a role (A:G today). A column inserted inside the ledger is read as an extra; a column past it is taken in by giving it a role in Settings ("No role" counts).
- [x] `headerSig` covers only the mapped columns, so renaming a summary header doesn't block writes; moving a ledger column still does.
- [x] `sheets.ts`: one cache per book (`fetchRows(name)`, `lastPull(name)`), `writeCells(name, …)`, `updateCells(name, …)`, `appendRow(name, …)`, `saveSettings(…, name)`. The voucher wrappers keep their names. Before a write, the target row's mapped cells must match the pull (was: the DV # only); the message names the column that changed. Each spreadsheet's own Selection List feeds its book.
- [x] Metadata keys per book: `korphil.collection.*` for collections; vouchers keep `korphil.*`, so saved settings survive.
- [x] Checks: `tsc`, `eslint`, `node --test` (new: the bound, an inserted column, header-sig vs summary headers, a role taking in Deposit, per-book keys) and `next build` pass. Live, read-only: vouchers read the same 642 rows and columns as before; collections the same 246 entries and ₱11,266,222.59.

**Found on the live tab:** row 127 is an LDDAP deposit line that also carries OR # 104300 (the next row's number). The old Deposit rule dropped it silently; it now shows under Rows not read ("No amount"). It isn't counted either way. Clear the OR # in the sheet if it's a slip.

### Phase 3 · Collection CRUD · done 2026-11-09

- [x] **`RecordPanel`** (`record-panel.tsx`): the side-panel form for any book, built from `Column[]`. It takes `save` / `remove` as bound server actions, plus `required`, `wide`, and two client hooks: `input` for a custom input, `onField` to keep fields in step. `VoucherPanel` is now a thin wrapper that adds the DV # following its date and the Status select. Nothing in the shared form names a field.
- [x] Shared helpers in `ledger.ts`: `formFromRow` (both lists use it) and `rowSig` (what a row held when the form opened). `clean` in `actions.ts` is generic: required keys, money that must parse, dates that must read as dates. `saveVoucher` now takes `(row, dvNo, form)` so it can be bound.
- [x] **`saveEntry(row | null, sig, form)`**: re-pulls the tab; an edit's row must still match `sig`; only changed cells are written; a new entry goes into the first empty row after the last one. An OR # already used elsewhere is saved, and the message names the other row.
- [x] **`deleteEntry(row, sig)`**: clears the row's shown ledger cells (A:G today). The row stays, and so do Deposit, Undeposited and the summary tables beside it. Every cleared cell is logged with its old value.
- [x] Collections list: rows open the panel (`?open=`), **New collection** in the header (`N`, `?new=1`), Delete in the panel behind a confirm. Secondary columns hide while the panel is open, as on vouchers.
- [x] Collection text fields (OR #, payor, UACS, area, nature) are written RAW, so typed text is never read as a formula. Date and amount are validated, then written USER_ENTERED.
- [x] `tsc`, `eslint`, `node --test` (new: form values, row signature) and `next build` pass.

**Not checked:** saving, editing and deleting in the browser need a signed-in Editor. The dev server's pane stopped at Google sign-in.

### Phase 4 · No fixed tables or headers in the UI · done 2026-11-09

- [x] Each collection `Entry` carries its extra columns (`extra`, by column key). The Collections list keeps its stacked pairs (Date · OR #, Payor · nature, UACS · area) and adds one column per extra, as the vouchers list does. Extras hide while the panel is open.
- [x] **Cash receipts register** is built from the tab's columns: labels are the sheet's own headers and hidden columns are left out. Known fields go in their zones (date and OR # on the left, payor and nature in the middle, UACS and area as tags, the amount on the right) and extras print by name. The CSV and Word exports follow, since they share `buildCollectionReport`.
- [x] **Collection Settings** has the same Layout settings editor as vouchers: header row, ignored rows, and each column's role, input and visibility. They're saved under the collection's own metadata keys. `LayoutEditor` takes the book and its field labels; `layoutAction` checks the book name and uses that book's fields and required roles.
- [x] **Amount search:** both search boxes (vouchers in the header, collections on the list) also match amounts: `12,500` exactly, `>5000`, `>=5000`, `<1000`, `<=1000`, or a range `1000-5000` / `1000 to 5000`. Text matches still count, so an OR # like 104189 finds the receipt either way (`amountQuery` in `ledger.ts`, tested).
- [x] `tsc`, `eslint`, `node --test` (new: extras ride on each entry) and `next build` pass.

**Not checked:** the Settings editor and the list's extra columns in the browser (Google sign-in). With the live tab as it is, there are no extras, so the list and register look as before.

### Roles and options from the Selection List · done 2026-11-09

- [x] **Roles come from the sheet:** Layout settings offers the names in the Selection List's **DVROLES** (E) or **COLLECTION ROLES** (I) column, spelled as the sheet spells them (`bookRoles`). Names are matched to app fields by header text. Settings lists any name the app can't match, and any field the table leaves out. Required fields are always offered. Without a roles column, every field is offered.
- [x] **One column per role:** a role picked on one column is greyed out on the others. A column whose Auto role is picked elsewhere drops to "Auto (no role found)". Saving the same role on two columns is refused, and the message names both columns.
- [x] **No "No role" option:** Auto covers it. A column with no role is hidden by default everywhere (forms, lists, register); setting its Show to Shown or Read-only brings it in. That also extends the collection ledger past its last known column. Old saved "No role" settings read as Auto, set to Shown.
- [x] **Dropdown options by role:** a column's choices come from the Selection List column headed with its role's name, then its own header, then any alias. Collection Area gets G (COLLECTION AREA), not A (TRADE AREA). A column with an options table is a dropdown, which makes Nature of collection one (H). The role columns are never used as options.
- [x] `tsc`, `eslint`, `node --test` (new: roles from the tables, options by role, role tables excluded) and `next build` pass. Live, read-only: all 10 DV roles and all 7 collection roles match. Dropdowns: trade area 18, diploma/ST 37, category 21, status 4; UACS 6, collection area 18, nature 9. 642 vouchers and 246 entries, as before.

**Not checked:** the editor and forms in the browser (Google sign-in). Option lists still include the sheet's own `(BLANK)` and `TEST2` values.

### Custom roles from the roles columns · done 2026-11-09

**Audit:** CATEGORY gained "MEDICAL" and the app already read it; the dropdown shows 21 choices because the column lists two values twice. Seeing it can take up to a minute of cache, or a Sync. COLLECTION ROLES gained "Deposit", and the app dropped it as "not a role the app knows".

- [x] **Custom roles:** any name in DVROLES or COLLECTION ROLES that isn't a field the app knows is a role too, keyed `x:<name>` and offered under the sheet's spelling (`bookRoles().custom`). Auto places it on the first free column whose header is that name, or Settings places it by hand (one column per role still holds). A column with a custom role is read as a named, shown column: in the form, list, register and exports, with options from a Selection List column of the same name if there is one. On the collection tab it extends the ledger.
- [x] A column empty on every ledger row has its type guessed from the rest of the column. Deposit's amounts sit on deposit lines, so it now reads as money.
- [x] Live, read-only: COLLECTION ROLES gives 8 roles with Deposit as the custom one. Columns are A:G plus Deposit (H, money, shown); Undeposited and the summary tables stay out. Still 246 entries and ₱11,266,222.59.
- [x] `tsc`, `eslint`, `node --test` (new: a custom role found by header, read past the last known column, placed by hand; not read when the roles column doesn't list it) and `next build` pass.

**Note:** deposit lines still aren't entries, so the Collections list's Deposit column is blank on every receipt today. It fills in once Deposit is entered on a receipt's own row.

### Checks

- [ ] `tsc`, `eslint`, `node --test`, `next build`.
- [ ] Tests: deposit rows drop without a Deposit column; an inserted column inside the ledger is read and one after the gap isn't; header-sig ignores J+; a write refused when the target row changed.
- [ ] Live: entry count and total match before and after Phase 1 (deposit rows were already excluded, so they must not change); a signed-in Editor runs New / Edit / Delete on a test row.

### Open questions

- **Delete:** clear the cells (planned) or remove the row? Removing shifts every row below and can break the Undeposited running-total formula.
- **New rows and formulas:** a new entry goes into the first empty row after the last one; if Undeposited is a formula per row, it won't be filled for that row. Fine, or should the app copy the formula down?
- **Delete for vouchers too?** Disbursement has no delete today; Phase 3 makes it a small addition.
