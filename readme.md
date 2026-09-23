# TESDA Accounting Disbursement Dashboard
A dashboard for managing and tracking accounting disbursements.

## Stack
- **Database** PosteSql + Google Sheets
- **Backend:** Django
- **Frontend:** HTMX

## Setup

```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
cd Backend
python manage.py runserver
```

Set `GOOGLE_SHEET_ID` and `GOOGLE_SHEET_RANGE` in `.env` (repo root).

### Sign in with Google
Everyone signs in with their own Google account, and that account reads and writes the sheet. **The sheet's sharing is the access list:** anyone it's shared with can sign in, Editors can save, Viewers can only look. No service account is needed.

1. Google Cloud Console → your project → **APIs & Services → Library** → enable **Google Sheets API**.
2. **OAuth consent screen**: fill in the app name, and add the scopes `openid`, `email`, `profile`, `.../auth/spreadsheets`. While the app is in *Testing*, add each person's Google account under **Test users**. (If your org uses Google Workspace, pick *Internal* instead and skip test users.)
3. **Credentials → Create credentials → OAuth client ID** → type **Web application** → add the authorized redirect URI `http://localhost:8000/auth/callback/` (plus your real domain's `/auth/callback/` when deployed).
4. Put the client ID and secret in `.env` as `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`, then restart.
5. In the Google Sheet, **Share** it with each person who should use the app.

Open the app at `http://localhost:8000` (not `127.0.0.1`; the redirect URI must match exactly).

`GOOGLE_SHEET_API_KEY` is now optional. It's only used by the Django admin's sheet page for staff who haven't signed in with Google.

## Structure

- `Backend/` — Django project (`config/`) + `dashboard` app: `sheets.py` reads/writes the Google Sheet (pulls cached 60s), `ledger.py` derives status, days late and totals, `views.py` serves Workspace, Vouchers, Trade Areas, Reports and Settings.
- `Frontend/` — HTMX templates (`templates/`) and static assets (`static/`), served by Django.
- `Assets/` — reference files (sample sheet layout, logos).

## Deploy (Vercel)

Live: https://korphil-tesda-accounting.vercel.app. Vercel detects Django and serves `Backend/config/wsgi.py`. There is no database: sessions are signed cookies, and WhiteNoise serves the static files.

```bash
npx.cmd vercel deploy --prod
```

Production env vars (set with `npx.cmd vercel env add NAME production`): `GOOGLE_SHEET_ID`, `GOOGLE_SHEET_RANGE`, `GOOGLE_SHEET_API_KEY`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `DJANGO_SECRET_KEY`. The OAuth client needs the redirect URI `https://korphil-tesda-accounting.vercel.app/auth/callback/`.
