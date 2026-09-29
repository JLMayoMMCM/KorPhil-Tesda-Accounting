# Product

**What:** Disbursement voucher (DV) workspace for the Korea-Philippines Vocational Training Center (TESDA Regional Training Center, Davao). A Google Sheet is the source of truth; the app reads it, surfaces what needs paying, and writes edits back.

**Who / scene:** Accounting office staff at desktop PCs under office lighting, all workday. Light theme, dense tables.

**Core jobs:** see what is overdue or due this week and mark it paid; find and edit a DV; see unpaid totals per trade area; pull a summary or CSV for a period.

**Brand commitments:** TESDA / KorPhil identity (seal logo). Since v2.0.0 (2026-09-29) typography and color come from the shadcn preset `b1YovW4Ey` (IBM Plex Sans, taupe neutrals, indigo primary); status reads through Badge variants (overdue = destructive). Layout follows the Figma board "ACCOUNTING-WORKSPACE › SAMPLE UI 2" (action-bar workspace).

**Constraints:** Next.js App Router + shadcn/ui (Base UI), server-rendered with Server Actions. Only features the sheet can back are built (assumption, confirmed 2026-09-23): no activity feed, saved views, PDF/Excel generation, user roles.
