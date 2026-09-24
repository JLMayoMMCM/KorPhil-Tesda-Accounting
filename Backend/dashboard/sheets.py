import time

import requests
from django.conf import settings
from django.utils import timezone

# Column layout of the source sheet (see Assets/SAMPLE SHEET - TESTING.csv).
# Columns G/H are spacer columns in the sheet and are dropped.
COLUMNS = [
    "dv_date", "due_date", "dv_no", "payee", "particulars", "gross_amount",
    None, None,
    "trade_area", "diploma_st_assessment", "category", "status",
]
EDITABLE_FIELDS = [name for name in COLUMNS if name]
STATUS_COLUMN = "L"

SHEETS_API_URL = "https://sheets.googleapis.com/v4/spreadsheets/{sheet_id}/values/{range_}"
BATCH_URL = "https://sheets.googleapis.com/v4/spreadsheets/{sheet_id}/values:batchUpdate"
SHEET_META_URL = "https://sheets.googleapis.com/v4/spreadsheets/{sheet_id}"

# ponytail: in-process cache, one pull per minute per worker; move to Django's cache if we run several workers
CACHE_SECONDS = 60
# Everyone who can reach the cache has already proven sheet access at sign-in (see auth.py).
_pull = {"ts": 0, "rows": [], "error": None, "title": "", "at": None}


def _auth(token):
    """Request kwargs: the user's OAuth token, or the API key when no token is given (admin, scripts)."""
    if token:
        return {"headers": {"Authorization": f"Bearer {token}"}}
    return {"params": {"key": settings.GOOGLE_SHEET_API_KEY}}


def _explain(exc):
    """Finish the sentence 'your Google account ...' for a failed Sheets call."""
    status = getattr(exc.response, "status_code", None)
    if status == 403 and "SERVICE_DISABLED" in exc.response.text:
        return "can't be used yet: turn on the Google Sheets API in the app's Google Cloud project."
    if status == 403:
        return "doesn't have permission for this sheet. Ask the sheet owner to share it with you as Editor."
    if status == 404:
        return "can't find the sheet. Check GOOGLE_SHEET_ID in .env."
    if status == 401:
        return "sign-in has expired. Sign in again."
    return f"couldn't reach Google Sheets ({exc})."


def check_access(token):
    """Error text (to follow the user's email) if this token can't open the sheet, else None."""
    if not settings.GOOGLE_SHEET_ID:
        return "can't sign in yet: GOOGLE_SHEET_ID is not set in .env."
    try:
        response = requests.get(SHEET_META_URL.format(sheet_id=settings.GOOGLE_SHEET_ID),
                                params={"fields": "properties.title"}, timeout=10, **_auth(token))
        response.raise_for_status()
    except requests.RequestException as exc:
        return _explain(exc)
    _pull["title"] = response.json().get("properties", {}).get("title", "")
    return None


def fetch_vouchers(token=None, force=False):
    """Pull rows from the configured Google Sheet and map them to voucher dicts.

    Returns (rows, error). error is None on success, or a message to show the user.
    Each row includes 'sheet_row', its 1-indexed row number in the sheet, for editing.
    Pulls are cached for CACHE_SECONDS; force=True skips the cache.
    """
    error = None
    if force or time.time() - _pull["ts"] > CACHE_SECONDS:
        rows, error = _pull_sheet(token)
        # Only a good pull replaces the shared cache, so one user's bad token can't blank it for everyone.
        if error is None:
            _pull.update(ts=time.time(), rows=rows, error=None, at=timezone.now())
    return [dict(row) for row in _pull["rows"]], error


def last_pull():
    """Metadata about the most recent pull: sheet title and when it ran."""
    return {"title": _pull["title"], "at": _pull["at"], "rows": len(_pull["rows"]), "error": _pull["error"]}


def _pull_sheet(token):
    if not settings.GOOGLE_SHEET_ID or not (token or settings.GOOGLE_SHEET_API_KEY):
        return [], "Google Sheet is not configured. Set GOOGLE_SHEET_ID in .env."

    url = SHEETS_API_URL.format(sheet_id=settings.GOOGLE_SHEET_ID, range_=settings.GOOGLE_SHEET_RANGE)
    try:
        response = requests.get(url, timeout=10, **_auth(token))
        response.raise_for_status()
    except requests.RequestException as exc:
        return [], "Couldn't read the sheet: your Google account " + _explain(exc)

    values = response.json().get("values", [])
    rows = []
    for i, raw_row in enumerate(values[2:]):  # skip header row and the blank spacer row beneath it
        if not any(raw_row):
            continue
        padded = raw_row + [""] * (len(COLUMNS) - len(raw_row))
        row = {name: padded[j] for j, name in enumerate(COLUMNS) if name}
        row["sheet_row"] = i + 3
        rows.append(row)
    return rows, None


def _write(token, method, url, body, params=None):
    """Send values to the sheet as the signed-in user. Returns an error message or None."""
    if not token:
        return "Sign in with Google to save changes to the sheet."
    try:
        response = requests.request(
            method,
            url,
            params=params,
            headers={"Authorization": f"Bearer {token}"},
            json=body,
            timeout=10,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        return "Not saved: your Google account " + _explain(exc)
    _pull["ts"] = 0  # next read pulls fresh
    return None


USER_ENTERED = {"valueInputOption": "USER_ENTERED"}


def _values_url(range_):
    return SHEETS_API_URL.format(sheet_id=settings.GOOGLE_SHEET_ID, range_=range_)


def _ordered(field_values):
    return [field_values.get(name, "") if name else "" for name in COLUMNS]


def update_voucher_row(token, sheet_row, field_values):
    """Overwrite one data row in the sheet. field_values maps EDITABLE_FIELDS names to strings."""
    rng = f"{settings.GOOGLE_SHEET_RANGE}!A{sheet_row}:L{sheet_row}"
    return _write(token, "PUT", _values_url(rng), {"values": [_ordered(field_values)]}, USER_ENTERED)


def set_statuses(token, statuses):
    """Write only the status cells, {sheet_row: status}, in one request, so stale cached rows can't overwrite other columns."""
    return _write(token, "POST", BATCH_URL.format(sheet_id=settings.GOOGLE_SHEET_ID), {
        **USER_ENTERED,  # batchUpdate takes this in the body, not the query
        "data": [{"range": f"{settings.GOOGLE_SHEET_RANGE}!{STATUS_COLUMN}{n}", "values": [[s]]} for n, s in statuses.items()],
    })


def append_voucher(token, field_values):
    return _write(
        token, "POST", _values_url(f"{settings.GOOGLE_SHEET_RANGE}!A:L") + ":append", {"values": [_ordered(field_values)]},
        params={**USER_ENTERED, "insertDataOption": "INSERT_ROWS"},
    )
