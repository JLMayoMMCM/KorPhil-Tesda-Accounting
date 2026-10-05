# Product

**What:** Disbursement voucher (DV) workspace for the Korea-Philippines Vocational Training Center (TESDA Regional Training Center, Davao). The Google Sheet's EXP tab (a disbursement ledger: DV date, DV #, payee, particulars, gross amount, check #, trade area, diploma/ST/assessment, category) is the source of truth; the app reads it, flags what needs review, and writes edits back.

**Who / scene:** Accounting office staff at desktop PCs under office lighting, all workday. Light theme, dense tables.

**Core jobs:** review vouchers with gaps (missing or duplicate DV #, missing check #, date, amount or trade area) and fix them; find and edit a DV; see totals by trade area, month, program and category; pull a report, audit extract or CSV for a period. EXP has no due date or status, so there is no paid/unpaid tracking (see REVISIONS.md).

**Brand commitments:** TESDA / KorPhil identity (seal logo). Since v2.0.0 (2026-09-29) typography and color come from the shadcn preset `b1YovW4Ey` (IBM Plex Sans, taupe neutrals, indigo primary); review flags read as outlined destructive badges. Layout follows the Figma board "ACCOUNTING-WORKSPACE › SAMPLE UI 2" (action-bar workspace).

**Constraints:** Next.js App Router + shadcn/ui (Base UI), server-rendered with Server Actions. Only features the sheet can back are built (assumption, confirmed 2026-09-23): no activity feed, saved views, PDF/Excel generation, user roles.
