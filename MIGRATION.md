# Migration: Django + HTMX → Next.js (korphil-accounting-dashboard)

Status (2026-09-29): **replicated (v2.0.0), awaiting sign-off.** The legacy app lives in `Archive/` (git-ignored, local only; last committed version is `81e0532`). The repo root is the Next.js 16 app with the shadcn preset `b1YovW4Ey` (`base-nova` style, Base UI, taupe neutrals, IBM Plex Sans, lucide icons), whose fonts and theme are used as-is. Skills installed in `.claude/skills/`: `shadcn`, `vercel-react-best-practices`.

### Verified
- Ledger self-check ported and passing (`npm test`); typecheck, lint and `next build` clean.
- Same live sheet, same day: legacy `ledger.py` and new `ledger.ts` give identical states, buckets, counts and totals (20 rows).
- All five pages render against the live sheet (checked with a read-only local test session); CSV exports match the legacy format.
- Sign-in redirect sends the same redirect URI as before (`http://localhost:8000/auth/callback/`), so the OAuth client needs no change.
- Unsaved-changes guard, confirm dialog, busy dialog, error toast and inline save error all work. A signed-out session can't write (tested).

### Not yet verified (needs a real Google sign-in)
- Full sign-in round trip, token refresh after 1 hour, and real writes: save, append, mark paid + Undo.

### Changed from the plan below
- Dev server runs on **port 8000** with `trailingSlash: true`, so the existing Google redirect URIs keep working (no Google Cloud change).
- Toasts use shadcn's **Base UI `toast`** (not sonner), as the preset's base requires.
- Fonts and colors come from the **preset**; `DESIGN.md` (navy, Public Sans) is superseded for v2.
- The sheet title is also fetched on the first pull, not only at sign-in, so every server instance shows it.

> Read `AGENTS.md` first: Next 16 has breaking changes (e.g. `middleware.ts` is now `proxy.ts`). Bundled docs are in `node_modules/next/dist/docs/`.

---

## 1. Feature map (what the legacy app does)

### 1.1 Data source: Google Sheet (`Archive/Backend/dashboard/sheets.py`)

- The sheet is the only datastore. **No database.** Range from `GOOGLE_SHEET_RANGE` (default `Sheet1`).
- Row 1 = header, row 2 = blank spacer, data starts at **row 3**. Blank rows are skipped. Each voucher keeps its `sheet_row` (1-indexed) for writes.
- Columns A–L (G, H are spacer columns, always written empty):

  | Col | Field | Label |
  |---|---|---|
  | A | `dv_date` | DV date (sheet format `m/d/yyyy`) |
  | B | `due_date` | Due date (`m/d/yyyy`) |
  | C | `dv_no` | DV # |
  | D | `payee` | Payee |
  | E | `particulars` | Particulars |
  | F | `gross_amount` | Gross amount (`"89,021.00"`, may have `₱`) |
  | G, H | — | spacer |
  | I | `trade_area` | Trade area |
  | J | `diploma_st_assessment` | Diploma / ST / Assessment ("Program") |
  | K | `category` | Category |
  | L | `status` | `PENDING` / `OVERDUE` / `PAID` |

- **Read**: `GET values/{range}` with the user's Bearer token (fallback: `GOOGLE_SHEET_API_KEY`, read only).
- **Cache**: in-process, 60 s, shared across users. Only a *successful* pull replaces it (one bad token can't blank it). Any write sets the cache stale. `Sync` forces a pull.
- **Writes** (all `valueInputOption=USER_ENTERED`, all need a signed-in token):
  - Edit row: `PUT values/{range}!A{n}:L{n}` with the full 12-column row.
  - New row: `POST values/{range}!A:L:append` with `insertDataOption=INSERT_ROWS`.
  - Mark paid / undo: `POST values:batchUpdate`, **status cell (L) only**, so stale cached rows can't overwrite other columns.
- **Error text** (`_explain`): 403 + `SERVICE_DISABLED` → enable Sheets API; 403 → ask owner to share as Editor; 404 → check sheet ID; 401 → sign in again; else generic. Messages read as "your Google account …".
- Sheet title fetched at sign-in (`GET spreadsheets/{id}?fields=properties.title`) and shown in the UI.

### 1.2 Domain rules (`Archive/Backend/dashboard/ledger.py`, pure functions, has self-test)

- `amount`: strip `,` and `₱`; empty → 0; unparsable → 0 for totals but **invalid** on save.
- `today` is **Asia/Manila** local date.
- `days_late = max(today − due, 0)` if due is set and not paid, else 0.
- State / bucket:
  - status `PAID` → state `paid`, bucket `paid`
  - `days_late > 0` **or** status `OVERDUE` → state `overdue`; bucket `late30` if days_late > 30, else `late`
  - else state `pending`; bucket `today` (due = today), `week` (due ≤ today+6), else `later` (includes no due date)
- `month` = `YYYY-MM` of DV date ("" if none).
- Sort: due date ascending (undated last), then DV #.
- Bucket labels: `late30` "30+ days late", `late` "1–30 days late", `today` "Due today", `week` "Due this week", `later` "Not yet due", `paid` "Paid".
- Tabs: `all`, `unpaid` (state ≠ paid), `overdue`, `week` (bucket today|week), `paid`.
- `label(field)` = trimmed value or **"Not set"**; distinct-value lists sort alphabetically with "Not set" last.
- `group(key)` → `[(label, count, amount)]`, largest amount first.
- Money display `₱89,021.00`, negatives `−₱…` (U+2212).

### 1.3 Auth (`Archive/Backend/dashboard/auth.py`)

- Google OAuth 2.0 authorization-code flow. Scopes `openid email profile https://www.googleapis.com/auth/spreadsheets`, `access_type=offline`, `prompt=select_account consent`, `include_granted_scopes=true`, random `state` checked with constant-time compare.
- Callback: exchange code → verify `id_token` (audience = client ID) → require `email_verified` → require granted scope contains `spreadsheets` → **check the user can open the sheet** (that's the access list) → rotate session → store user (email, first/last name, picture) + tokens → redirect to safe `next` or `/`.
- Every request: refresh the access token when < 60 s left; if refresh is impossible, end the session and redirect to `/login?next=…` with "Your Google session ended. Sign in again."
- Login page errors: expired state, cancelled (`access_denied`), generic failure, unverified email, missing Sheets scope, no sheet access (`{email} doesn't have permission…`). If OAuth env isn't set, the page shows setup steps with the exact redirect URI.
- Logout: POST, clear session.
- Session = signed cookie (not encrypted), HttpOnly, Secure in prod.

### 1.4 Pages and routes

| Legacy route | Purpose |
|---|---|
| `GET /` | **Workspace** |
| `GET /vouchers/` | **Vouchers** register + side panel |
| `POST /vouchers/new/` | append voucher |
| `POST /vouchers/<row>/` | update voucher row |
| `POST /vouchers/paid/` | mark paid (`only=<row>` or `sel=<row>…`) |
| `POST /vouchers/paid/undo/` | undo last mark paid |
| `GET/POST /vouchers/export/` | CSV of the filtered list (or the selection) |
| `GET /areas/` | **Trade Areas** |
| `GET /reports/` | **Reports** (`format=csv` downloads) |
| `GET /settings/` | **Settings** |
| `POST /sync/` | force pull |
| `/login/`, `POST /login/google/`, `/auth/callback/`, `POST /logout/` | auth |

**App shell (every page)**
- Sidebar: logo + "KorPhil-TESDA / Disbursements"; nav Workspace, Vouchers (count all) with sub-links Overdue (red count when > 0), Due this week, Unpaid (counts); Trade Areas, Reports, Settings. Footer: sheet title, "Synced h:mm A · N rows", "Open in Google Sheets".
- Top bar: page title; **New DV** (key `N`); search box (`Ctrl K`) → `/vouchers?q=`; Run report; Export (current filter); Sync with last-sync time; user menu (avatar or initial, name, email, Sign out).
- Toasts for success/error; the mark-paid toast has **Undo** (~12 s, pauses on hover).
- Error banner when the pull failed.
- Confirm dialog before any mark paid ("Mark DV-… paid (₱…)?" / "Mark N vouchers paid (₱total)?", note "This writes PAID to the Status column in the Google Sheet.").
- Blocking busy dialog during save / sync / mark paid / undo ("Saving to the sheet…", "Pulling from the sheet…", "Marking paid…", "Undoing…"); Esc can't close it. After the write, the page returns to the same scroll position.

**Workspace (`/`)**
- "Needs action": unpaid vouchers grouped **Overdue** (late + late30), **Due today**, **Due this week**, **Later** (collapsed, "Show N" toggle). Group header shows count and total. Row: checkbox, DV # (links to `/vouchers?open=row`) + payee, payee — particulars, area, due ("N days late" / Today / "Tue, Sep 29" / No due date), amount, row "Mark paid".
- Bulk bar on selection: "N selected · ₱sum", Mark N paid, Export selection, Clear.
- Right rail: **Open balance** (Overdue, Pending, "Paid, dated {Month}" = paid with DV date in the current month; count + amount; Unpaid total). **Unpaid by trade area** bars (relative to the largest), each links to `/vouchers?tab=unpaid&area=…`. Link to Reports.
- Empty: "Nothing unpaid." + Add a DV.

**Vouchers (`/vouchers`)** — all state in the URL
- Query params: `tab`, `q` (matches DV #, payee, particulars, case-insensitive), `area`, `month` (YYYY-MM of DV date), `bucket` (`week` also matches `today`), `open=<row>`, `new=1`.
- Tabs with counts; Filter popover (Trade area, DV date month) with badge count; removable filter chips + "Clear filters"; "N shown · ₱total".
- Table: checkbox (unpaid only), DV #, DV date, Due (late in red / Today / date), Payee, Particulars, Area, Program, Category, Amount, Status badge, row Mark paid. Footer total. Clicking anywhere on a row opens it. Selected row highlighted. Bulk bar as on Workspace.
- **Side panel** (list stays visible, secondary columns hide): title = DV # or "New voucher"; status line (state · N days late · due date) or "Adds a new row at the bottom of the sheet."; Mark paid (`P`); close (`Esc`).
  - Fields: DV #*, Status (select), DV date, Due date (date inputs; fall back to text input if the sheet value isn't a parseable date), Payee, Gross amount* (₱ prefix, decimal keyboard), Category / Trade area / Program (free text with suggestions from existing values), Particulars (textarea).
  - Validation: DV # required; amount must parse ("Gross amount must be a number, like 12,500.00."); status must be one of the three. Dates from the picker are written back as `m/d/yyyy`. On error the typed values are kept.
  - Meta: "Changed: Payee, Due date" list; "Source: {sheet} · row N · pulled h:mm A"; footer note "No changes · row N" / "Unsaved · writes to row N" / "Not saved yet · appends a row"; Cancel (`Esc`), **Save to sheet** (`Ctrl S`).
  - **Unsaved-changes guard**: navigating via link, submitting another form, or closing the tab asks "Discard unsaved changes?".
  - After save: toast "Saved DV-… to the sheet.", panel returns to the previous URL.
- Empty: "No vouchers match." + Clear filters.

**Trade Areas (`/areas`)**
- Period select (All time / months, auto-applies); Amount | Count toggle.
- Matrix: rows = trade areas, columns = Not yet due, Due this week (today+week), 1–30 days late, 30+ days late, Paid, Unpaid total, Share of unpaid (bar + %, "<1%" for tiny non-zero). Each non-empty cell links to `/vouchers?area=…&bucket=…&month=…`. Late columns get heat level 1–3 (`ceil(3 × amount / max late cell)`). Footer "All areas" totals.
- Program split and Category split tables (area × value, amounts).
- Tables stack into cards on narrow screens.

**Reports (`/reports`)**
- Sentence builder: "Show [report] for [month] across [area] and [status]", auto-applies.
- Reports: Disbursement summary (by state, ordered overdue/pending/paid, plus "By trade area" bars), Unpaid and overdue aging (unpaid only, by bucket order), Totals by trade area, Totals by category, Monthly totals (newest first), Audit extract (all rows, key columns).
- Download CSV (`{kind}-{month|all}.csv`; grouped → Group, Vouchers, Amount + Total row; audit → all fields), Print / save as PDF (print stylesheet), template list on the left, "Generated {date} from {sheet}".

**Settings (`/settings`)** — read-only
- Sheet title + Connected/Not connected, Open sheet; sheet ID + range ("first 2 rows skipped"); signed-in account; who can use the app (follows sheet sharing) + Manage sharing; auto-refresh interval; last sync (time, rows, error) + Sync now.

**Export CSV** (`vouchers-YYYYMMDD.csv`): header = field labels, rows = raw sheet values of the filtered set (or the selection).

**Keyboard**: `N` new DV, `P` mark paid (panel), `Esc` close panel / blur field, `Ctrl/⌘ K` search, `Ctrl/⌘ S` save. Letter keys ignored while typing or when a dialog is open.

### 1.5 Config

| Env var | Notes |
|---|---|
| `GOOGLE_SHEET_ID` | required |
| `GOOGLE_SHEET_RANGE` | default `Sheet1` |
| `GOOGLE_SHEET_API_KEY` | optional read fallback |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | Web application OAuth client |
| `DJANGO_SECRET_KEY` | → becomes `SESSION_SECRET` |

Values are in `Archive/.env`. Brand/UX rules: `PRODUCT.md`, `DESIGN.md`, `.impeccable/`. Logo: `Archive/Frontend/static/img/logo.webp`. Sample data: `Archive/Assets/SAMPLE SHEET - TESTING.csv`.

---

## 2. Target mapping

| Legacy | Next.js |
|---|---|
| `ledger.py` | `src/lib/ledger.ts` (pure, no imports) + `src/lib/ledger.test.ts` ported from the `__main__` asserts |
| `sheets.py` | `src/lib/sheets.ts` (`server-only`), module-level 60 s cache, native `fetch` |
| `auth.py` | `src/lib/session.ts` (cookie), `src/proxy.ts` (guard + token refresh), `src/app/login/page.tsx`, `src/app/login/google/route.ts`, `src/app/auth/callback/route.ts` |
| Django messages + Undo | `sonner` toast returned from Server Action results; Undo calls `undoPaid(before)` |
| POST views | Server Actions in `src/app/actions.ts` + `revalidatePath` |
| CSV views | Route handlers `src/app/vouchers/export/route.ts`, `src/app/reports/csv/route.ts` |
| `money.py` filter | `peso()` in `src/lib/ledger.ts` |
| `app.js` | small client components: bulk selection, confirm/busy dialogs, dirty-form guard, `useHotkeys` |
| `style.css` | Tailwind + shadcn tokens in `globals.css` |

**Decisions baked in (change if you disagree):**
- **Money in integer centavos** (`number`), not floats and not a decimal library. Parse the string directly to centavos.
- **Keep the in-process cache** (same ceiling as today: per serverless instance). Don't enable `cacheComponents` for v1; every page reads the session cookie so it's dynamic anyway.
- **Session cookie encrypted** with `jose` (`EncryptJWT`, `dir`/`A256GCM`) instead of only signed: fixes the old `ponytail:` note. `jose` also verifies Google's `id_token` against `https://www.googleapis.com/oauth2/v3/certs`. It is the only new runtime dependency besides shadcn's `sonner`.
- **Token refresh lives in `proxy.ts`**: Server Components can't set cookies, the proxy can (set on the request and the response).
- **Undo needs no server state**: `markPaid` returns the previous statuses; the toast's Undo sends them back. Server re-validates rows are ints and statuses are in the allowed list. (A user can already write any status via their own sheet access, so this grants nothing new.)
- **Scroll restore is dropped**: Server Actions + `revalidatePath` keep the client page and its scroll.
- **Suggestions keep native `<datalist>`**.
- **Font/colors**: the preset brings IBM Plex Sans + taupe; `DESIGN.md` specifies Public Sans + navy `#232a7c` and status colors. Keep the preset's type and neutrals, set `--primary` to the navy, and add `--overdue/--pending/--paid` (+ `-bg`) tokens from `DESIGN.md`. Or switch the font back to Public Sans; decide once in step 3.

---

## 3. Replication steps (steps 1–9 done; 10–12 remain)

Run `npm run dev` (port 3000) after each step; the preview config in `.claude/launch.json` is set to it.

1. **Env**
   - `.env.local` at root with the vars from `Archive/.env`, replacing `DJANGO_SECRET_KEY` with `SESSION_SECRET` (`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`).
   - Google Cloud → OAuth client → add redirect URIs `http://localhost:3000/auth/callback` and `https://korphil-tesda-accounting.vercel.app/auth/callback` (no trailing slash; Next's default).
2. **Deps and components**
   ```bash
   npm i jose server-only
   npx shadcn@latest add sidebar button badge table tabs checkbox input textarea label select popover alert-dialog dialog sonner dropdown-menu avatar kbd toggle-group card separator empty field
   ```
3. **Theme**: map `DESIGN.md` tokens in `src/app/globals.css` (see decision above); logo → `public/logo.webp`, set `metadata` title template `%s · KorPhil-TESDA`, favicon, `<html lang="en">`.
4. **Ledger** (`src/lib/ledger.ts`): port `parseDate`, `sheetDate`, `parseAmount` (→ centavos), `enrich(rows, today)`, `inTab`, `total`, `label`, `group`, `values`, `peso`, constants `BUCKETS`, `TABS`, `STATUSES`, `NOT_SET`, `FIELD_LABELS`. `todayManila()` = `new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" })`. Port the asserts into `ledger.test.ts` and run with `node --test src/lib/ledger.test.ts`. Must pass before going further.
5. **Sheets** (`src/lib/sheets.ts`, `import "server-only"`): `fetchVouchers(token, force?)`, `lastPull()`, `checkAccess(token)`, `updateVoucherRow`, `appendVoucher`, `setStatuses`, `explain(status, body)`. Same URLs, cache and error texts as §1.1. Test against the sample CSV imported into a scratch sheet.
6. **Session + auth**
   - `src/lib/session.ts`: `readSession()`, `writeSession()`, `clearSession()` over one HttpOnly, `Secure` (prod), `SameSite=Lax` cookie holding `{ user, accessToken, refreshToken, expiresAt }`.
   - `src/app/login/google/route.ts` (POST): state cookie + `next`, redirect to Google with the §1.3 params.
   - `src/app/auth/callback/route.ts`: all §1.3 checks and messages; login errors passed via a short-lived cookie (not the URL).
   - `src/proxy.ts`: allow `/login`, `/login/google`, `/auth/callback`, `/_next`, `/logo.webp`; otherwise no session → `/login?next=`; token < 60 s → refresh and rewrite cookie; refresh fails → clear + login error.
   - `src/app/login/page.tsx`: layout per `Archive/Frontend/templates/auth/login.html` (brand side, Google button, setup instructions when unconfigured).
   - Sign out: Server Action.
7. **Shell** `src/app/(app)/layout.tsx`: shadcn `Sidebar` with counts + sheet footer, top bar (New DV, search form GET `/vouchers`, Run report, Export link, Sync action, user dropdown), `<Toaster />`, confirm `AlertDialog` + busy `Dialog` as one client provider (`useConfirm()`, `useBusy()`), `useHotkeys`. Load data once per request via a `cache()`-wrapped `getData()` (React `cache`) so layout and page share one pull.
8. **Actions** (`src/app/actions.ts`, `"use server"`): `saveVoucher(row|null, formData)` → `{ error, values }` or success + `revalidatePath("/", "layout")`; `markPaid(rows)` → `{ before }`; `undoPaid(before)`; `sync()`; `signOut()`. Validate as in §1.4 (Vouchers side panel).
9. **Pages** (all Server Components reading `searchParams`, client islands only where interactive):
   - `(app)/page.tsx` Workspace (bulk selection client component shared with Vouchers).
   - `(app)/vouchers/page.tsx` register + panel (`?open`, `?new`) as a CSS grid column, not an overlay `Sheet`, so the list stays visible. Panel form is a client component: `useActionState`, dirty tracking vs initial values, `beforeunload`, and a capture-phase click listener on `a[href]` that asks before leaving while dirty (App Router has no navigation-block API).
   - `(app)/areas/page.tsx`, `(app)/reports/page.tsx` (+ `@media print` rules), `(app)/settings/page.tsx`.
   - Route handlers for CSV: `vouchers/export` (GET with filter params, POST with `sel`), `reports/csv`.
10. **Parity check** against the legacy app (`cd Archive && venv\Scripts\python run.py` on :8000, same sheet): walk the checklist below side by side.
11. **Deploy**: in Vercel, set the project's Framework Preset to **Next.js** (it's currently Django), `npx vercel link` (the old `.vercel` link is in `Archive/`), add env vars incl. `SESSION_SECRET`, `npx vercel deploy --prod`.
12. **Cleanup**: rewrite `readme.md` for the Next app (setup, env, deploy), update `PRODUCT.md` constraints ("Django + HTMX, no build step" is no longer true), then delete `Archive/` once parity is signed off.

---

## 4. Parity checklist

- [ ] Sample sheet: every row lands in the same bucket/state as the legacy app on the same day (Asia/Manila).
- [ ] Totals and `₱` formatting match to the centavo on Workspace, Vouchers footer, Areas, every report.
- [ ] Sign-in: success, cancel, unverified email, missing Sheets scope, not shared, viewer-only save error, expired session redirect with `next`.
- [ ] New DV appends at bottom; edit writes only its row; date picker writes `m/d/yyyy`; bad amount keeps typed values.
- [ ] Mark paid (row, panel, bulk) writes only column L; Undo restores previous statuses; confirm and busy dialogs appear.
- [ ] Filters, tabs, chips, search, `open`/`new` params, and all cross-links (area bars, matrix cells) land on the same result sets.
- [ ] CSV exports byte-compare with legacy (headers, order, raw values).
- [ ] Keyboard shortcuts; unsaved-changes guard on link, other form, tab close.
- [ ] Print view of reports; tables stack on mobile width.
- [ ] Sync, 60 s cache, error banner on a failed pull.
