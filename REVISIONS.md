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
