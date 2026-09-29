# TESDA Accounting Disbursement Dashboard

Version 2.0.0

A dashboard for managing and tracking accounting disbursements. A Google Sheet is the source of truth; the app reads it, surfaces what needs paying, and writes edits back.

## Stack
- **Data:** Google Sheets (no database)
- **App:** Next.js 16 (App Router, Server Actions), TypeScript
- **UI:** shadcn/ui on Base UI (preset `b1YovW4Ey`), Tailwind CSS v4, lucide icons

## Setup

```bash
python run.py
```

This installs the dependencies on first run, then starts the dev server. `python run.py start` builds and serves the production version instead. Without Python, run `npm install` then `npm run dev`.

Open `http://localhost:8000` (not `127.0.0.1`; the OAuth redirect URI must match exactly).

Create `.env.local` in the repo root:

| Variable | |
|---|---|
| `GOOGLE_SHEET_ID` | required |
| `GOOGLE_SHEET_RANGE` | sheet/tab name, default `Sheet1` |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth "Web application" client |
| `SESSION_SECRET` | 32 random bytes, base64url: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `GOOGLE_SHEET_API_KEY` | optional read-only fallback |

### Sign in with Google
Everyone signs in with their own Google account, and that account reads and writes the sheet. **The sheet's sharing is the access list:** anyone it's shared with can sign in, Editors can save, Viewers can only look.

1. Google Cloud Console → your project → **APIs & Services → Library** → enable **Google Sheets API**.
2. **OAuth consent screen**: add the scopes `openid`, `email`, `profile`, `.../auth/spreadsheets`. While in *Testing*, add each person under **Test users** (or pick *Internal* for Google Workspace).
3. **Credentials → OAuth client ID → Web application** → authorized redirect URI `http://localhost:8000/auth/callback/` (plus `https://<your-domain>/auth/callback/`). Keep the trailing slash.
4. Put the client ID and secret in `.env.local`, then restart.
5. **Share** the Google Sheet with each person who should use the app.

## Saving to the sheet

- **Mark paid** (row, panel or bulk bar) asks first, then writes `PAID` to the Status column (L) only, in one `values:batchUpdate`. The toast's **Undo** (~12 s, pauses on hover) puts the previous statuses back.
- A blocking dialog shows while a save, sync or undo runs.
- Leaving a voucher form with unsaved edits (link or closing the tab) asks before discarding them.

## Structure

- `src/lib/ledger.ts`: pure rules: status buckets, days late, totals, filters, money (integer centavos). Self-check: `npm test`.
- `src/lib/sheets.ts`: Google Sheets read/write (pulls cached 60 s per server instance).
- `src/lib/session.ts`, `src/proxy.ts`, `src/app/login/`, `src/app/auth/callback/`: Google sign-in; the session is an encrypted cookie, refreshed in the proxy.
- `src/app/actions.ts`: Server Actions (save, mark paid, undo, sync, sign out).
- `src/app/(app)/`: Workspace, Vouchers, Trade Areas, Reports, Settings, and the CSV routes.
- `src/components/`: app shell and shared client behavior; `src/components/ui/` is shadcn.
- `Archive/` (git-ignored, local only): the previous Django + HTMX app. See [MIGRATION.md](MIGRATION.md).

## Deploy (Vercel)

Live: https://korphil-tesda-accounting.vercel.app. Set the Vercel project's Framework Preset to **Next.js**, then:

```bash
npx vercel link
npx vercel env add SESSION_SECRET production
npx vercel deploy --prod
```

Production env vars: `GOOGLE_SHEET_ID`, `GOOGLE_SHEET_RANGE`, `GOOGLE_SHEET_API_KEY`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `SESSION_SECRET` (`DJANGO_SECRET_KEY` is no longer used). The OAuth client needs `https://korphil-tesda-accounting.vercel.app/auth/callback/`.
