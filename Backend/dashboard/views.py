import csv
import math
import re
from datetime import datetime

from django.conf import settings
from django.contrib import messages
from django.http import HttpResponse, QueryDict
from django.shortcuts import redirect, render
from django.utils import timezone
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.http import require_POST

from . import sheets
from .ledger import (
    BUCKETS, NOT_SET, STATUSES, TABS, enrich, group, in_tab, label, parse_amount, parse_date,
    sheet_date, total, values,
)

ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
FIELD_LABELS = {
    "dv_date": "DV date", "due_date": "Due date", "dv_no": "DV #", "payee": "Payee",
    "particulars": "Particulars", "gross_amount": "Gross amount", "trade_area": "Trade area",
    "diploma_st_assessment": "Diploma / ST / Assessment", "category": "Category", "status": "Status",
}


# ---- shared -------------------------------------------------------------------------------

def _load(request):
    rows, error = sheets.fetch_vouchers(request.google_token)
    return enrich(rows, timezone.localdate()), error


def _page(request, template, rows, error, **ctx):
    ctx.update(
        rows_all=rows,
        error=error,
        counts={tab: sum(in_tab(r, tab) for r in rows) for tab in TABS},
        pull=sheets.last_pull(),
        sheet_url=f"https://docs.google.com/spreadsheets/d/{settings.GOOGLE_SHEET_ID}" if settings.GOOGLE_SHEET_ID else "",
    )
    return render(request, template, ctx)


def _back(request, fallback="index"):
    url = request.POST.get("next") or request.META.get("HTTP_REFERER", "")
    if url and url_has_allowed_host_and_scheme(url, {request.get_host()}, request.is_secure()):
        return redirect(url)
    return redirect(fallback)


def _month_label(month):
    return datetime.strptime(month, "%Y-%m").strftime("%b %Y") if month else "All months"


def _qs(params, **changes):
    q = params.copy()
    for key, value in changes.items():
        q.pop(key, None)
        if value not in (None, ""):
            q[key] = value
    return "?" + q.urlencode() if q else "?"


def _filter(rows, params):
    tab = params.get("tab", "all")
    q = params.get("q", "").strip().lower()
    only = set(params.getlist("sel"))
    out = []
    for r in rows:
        if not in_tab(r, tab):
            continue
        if params.get("area") and label(r, "trade_area") != params["area"]:
            continue
        if params.get("month") and r["month"] != params["month"]:
            continue
        bucket = params.get("bucket")
        if bucket and not (r["bucket"] == bucket or (bucket == "week" and r["bucket"] == "today")):
            continue
        if q and q not in f'{r["dv_no"]} {r["payee"]} {r["particulars"]}'.lower():
            continue
        if only and str(r["sheet_row"]) not in only:
            continue
        out.append(r)
    return out


# ---- workspace ----------------------------------------------------------------------------

def index(request):
    rows, error = _load(request)
    today = timezone.localdate()
    unpaid = [r for r in rows if r["state"] != "paid"]
    groups = []
    for name, keys in (("Overdue", {"late", "late30"}), ("Due today", {"today"}),
                       ("Due this week", {"week"}), ("Later", {"later"})):
        members = [r for r in unpaid if r["bucket"] in keys]
        if members:
            groups.append({"name": name, "rows": members, "total": total(members), "later": name == "Later"})

    overdue = [r for r in unpaid if r["state"] == "overdue"]
    pending = [r for r in unpaid if r["state"] == "pending"]
    paid_month = [r for r in rows if r["state"] == "paid" and r["month"] == today.strftime("%Y-%m")]
    by_area = group(unpaid, lambda r: label(r, "trade_area"))
    top = by_area[0][2] if by_area else 1
    return _page(
        request, "dashboard/workspace.html", rows, error,
        nav="workspace", title="Workspace",
        groups=groups, unpaid_total=total(unpaid), unpaid_count=len(unpaid),
        balance=[
            ("overdue", "Overdue", len(overdue), total(overdue)),
            ("pending", "Pending", len(pending), total(pending)),
            ("paid", f"Paid, dated {today:%B}", len(paid_month), total(paid_month)),
        ],
        by_area=[(name, amt, round(100 * amt / top)) for name, _, amt in by_area],
    )


# ---- vouchers register + side panel ------------------------------------------------------

def _form_from_row(r):
    form = {name: r.get(name, "") for name in FIELD_LABELS}
    for f in ("dv_date", "due_date"):
        d = parse_date(form[f])
        if d:
            form[f] = d.isoformat()
    return form


def _clean(post):
    """Validate a posted voucher. Returns (sheet-ready fields, error message or None)."""
    fields = {name: post.get(name, "").strip() for name in FIELD_LABELS}
    for f in ("dv_date", "due_date"):
        if ISO_DATE.match(fields[f]):
            fields[f] = sheet_date(datetime.strptime(fields[f], "%Y-%m-%d").date())
    if not fields["dv_no"]:
        return fields, "DV # is required."
    if not fields["gross_amount"] or parse_amount(fields["gross_amount"]) is None:
        return fields, "Gross amount must be a number, like 12,500.00."
    if fields["status"] not in STATUSES:
        return fields, "Pick a status."
    return fields, None


def vouchers(request, form=None, form_error=None, panel_row=None):
    rows, error = _load(request)
    params = request.GET
    shown = _filter(rows, params)
    tab = params.get("tab", "all") if params.get("tab") in TABS else "all"

    if panel_row is None and params.get("open"):
        panel_row = next((r for r in rows if str(r["sheet_row"]) == params["open"]), None)
    is_new = panel_row is None and (form is not None or "new" in params)
    if form is None:
        form = _form_from_row(panel_row) if panel_row else {name: "" for name in FIELD_LABELS} | {"status": "PENDING"}

    chips = []
    if params.get("area"):
        chips.append((f'Area is {params["area"]}', _qs(params, area=None, open=None)))
    if params.get("month"):
        chips.append((f'DV date in {_month_label(params["month"])}', _qs(params, month=None, open=None)))
    if params.get("bucket") in BUCKETS:
        chips.append((BUCKETS[params["bucket"]], _qs(params, bucket=None, open=None)))
    if params.get("q"):
        chips.append((f'Matches “{params["q"]}”', _qs(params, q=None, open=None)))

    return _page(
        request, "dashboard/vouchers.html", rows, error,
        nav="vouchers", title="Vouchers", tab=tab,
        tab_links=[(key, name, sum(in_tab(r, key) for r in rows), _qs(params, tab=key, open=None, new=None))
                   for key, name in TABS.items()],
        shown=shown, shown_total=total(shown), chips=chips,
        clear_url=_qs(params, area=None, month=None, bucket=None, q=None, open=None),
        panel=panel_row is not None or is_new, panel_row=panel_row, is_new=is_new,
        form=form, form_error=form_error, labels=FIELD_LABELS, statuses=STATUSES,
        date_text={f for f in ("dv_date", "due_date") if form.get(f) and not ISO_DATE.match(form[f])},
        options={f: [v for v in values(rows, f) if v != NOT_SET] for f in ("trade_area", "diploma_st_assessment", "category")},
        close_url=_qs(params, open=None, new=None),
        filter_areas=values(rows, "trade_area"),
        filter_months=[(m, _month_label(m)) for m in sorted({r["month"] for r in rows if r["month"]}, reverse=True)],
        filter_count=sum(bool(params.get(k)) for k in ("area", "month", "bucket")),
        export_url="/vouchers/export/" + _qs(params, open=None, new=None),
    )


@require_POST
def voucher_save(request, sheet_row=None):
    fields, error = _clean(request.POST)
    if not error:
        token = request.google_token
        error = sheets.update_voucher_row(token, sheet_row, fields) if sheet_row else sheets.append_voucher(token, fields)
    if error:
        # Re-render with what the user typed so nothing is lost.
        rows, _ = _load(request)
        row = next((r for r in rows if r["sheet_row"] == sheet_row), {"sheet_row": sheet_row}) if sheet_row else None
        return vouchers(request, form=request.POST.dict(), form_error=error, panel_row=row)
    messages.success(request, f'Saved {fields["dv_no"]} to the sheet.')
    return _back(request, "vouchers")


@require_POST
def mark_paid(request):
    targets = [request.POST["only"]] if request.POST.get("only") else request.POST.getlist("sel")
    targets = [int(t) for t in targets if t.isdigit()]
    if not targets:
        messages.error(request, "Select at least one voucher.")
        return _back(request)
    # ponytail: one request per row; switch to values:batchUpdate if people mark dozens at once
    for n in targets:
        error = sheets.set_voucher_status(request.google_token, n, "PAID")
        if error:
            messages.error(request, error)
            return _back(request)
    messages.success(request, f"Marked {len(targets)} voucher{'s' if len(targets) != 1 else ''} paid.")
    return _back(request)


def _csv(filename, header, lines):
    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    writer = csv.writer(response)
    writer.writerow(header)
    writer.writerows(lines)
    return response


def export(request):
    rows, _ = _load(request)
    params = request.POST if request.method == "POST" else request.GET
    return _csv(
        f"vouchers-{timezone.localdate():%Y%m%d}.csv",
        list(FIELD_LABELS.values()),
        ([r[f] for f in FIELD_LABELS] for r in _filter(rows, params)),
    )


@require_POST
def sync(request):
    _, error = sheets.fetch_vouchers(request.google_token, force=True)
    if error:
        messages.error(request, error)
    else:
        messages.success(request, f'Pulled {sheets.last_pull()["rows"]} rows from the sheet.')
    return _back(request)


# ---- trade areas ------------------------------------------------------------------------

MATRIX_COLUMNS = [("later", {"later"}), ("week", {"today", "week"}), ("late", {"late"}), ("late30", {"late30"}), ("paid", {"paid"})]


def areas(request):
    rows, error = _load(request)
    period = request.GET.get("period", "")
    by_count = request.GET.get("by") == "count"
    scoped = [r for r in rows if not period or r["month"] == period]
    unpaid_all = total(r for r in scoped if r["state"] != "paid")

    late_amounts = [total(r for r in scoped if label(r, "trade_area") == a and r["bucket"] == b)
                    for a in values(scoped, "trade_area") for b in ("late", "late30")]
    late_max = max(late_amounts, default=0) or 1

    matrix = []
    for area in values(scoped, "trade_area"):
        mine = [r for r in scoped if label(r, "trade_area") == area]
        cells = []
        for key, buckets in MATRIX_COLUMNS:
            hit = [r for r in mine if r["bucket"] in buckets]
            heat = math.ceil(3 * total(hit) / late_max) if key in ("late", "late30") and hit else 0
            cells.append({
                "count": len(hit), "amount": total(hit), "heat": heat,
                "url": "/vouchers/" + _qs(QueryDict(), area=area, bucket=key, month=period),
            })
        unpaid = [r for r in mine if r["state"] != "paid"]
        share = 100 * total(unpaid) / unpaid_all if unpaid_all else 0
        share_label = "<1" if 0 < share < 1 else round(share)
        matrix.append({"area": area, "cells": cells, "unpaid": total(unpaid), "unpaid_count": len(unpaid), "share": round(share, 1), "share_label": share_label})

    totals = [{"count": sum(m["cells"][i]["count"] for m in matrix), "amount": sum(m["cells"][i]["amount"] for m in matrix)}
              for i in range(len(MATRIX_COLUMNS))]

    def split(field):
        cols = values(scoped, field)
        return cols, [(area, [total(r for r in scoped if label(r, "trade_area") == area and label(r, field) == c) for c in cols])
                      for area in values(scoped, "trade_area")]

    program_cols, program_rows = split("diploma_st_assessment")
    category_cols, category_rows = split("category")
    return _page(
        request, "dashboard/areas.html", rows, error,
        nav="areas", title="Trade Areas",
        period=period, periods=[(m, _month_label(m)) for m in sorted({r["month"] for r in rows if r["month"]}, reverse=True)],
        by_count=by_count, columns=[BUCKETS[k] for k, _ in MATRIX_COLUMNS],
        matrix=matrix, totals=totals, unpaid_all=unpaid_all,
        unpaid_all_count=sum(r["state"] != "paid" for r in scoped),
        program_cols=program_cols, program_rows=program_rows,
        category_cols=category_cols, category_rows=category_rows,
        amount_url=_qs(request.GET, by=None), count_url=_qs(request.GET, by="count"),
    )


# ---- reports ----------------------------------------------------------------------------

STATE_LABELS = {"overdue": "Overdue", "pending": "Pending", "paid": "Paid"}
REPORTS = {
    "summary": ("Disbursement summary", lambda r: r["state"]),
    "aging": ("Unpaid and overdue aging", lambda r: r["bucket"]),
    "area": ("Totals by trade area", lambda r: label(r, "trade_area")),
    "category": ("Totals by category", lambda r: label(r, "category")),
    "monthly": ("Monthly totals", lambda r: r["month"]),
    "audit": ("Audit extract, all fields", None),
}


def reports(request):
    rows, error = _load(request)
    p = request.GET
    kind = p.get("report") if p.get("report") in REPORTS else "summary"
    month, area, state = p.get("month", ""), p.get("area", ""), p.get("status", "")
    scoped = [r for r in rows
              if (not month or r["month"] == month)
              and (not area or label(r, "trade_area") == area)
              and (not state or r["state"] == state)]
    if kind == "aging":
        scoped = [r for r in scoped if r["state"] != "paid"]
    name, key = REPORTS[kind]

    lines = []
    if key:
        grouped = group(scoped, key)
        if kind == "summary":
            grouped.sort(key=lambda g: list(STATE_LABELS).index(g[0]))
        elif kind == "aging":
            grouped.sort(key=lambda g: list(BUCKETS).index(g[0]))
        elif kind == "monthly":
            grouped.sort(key=lambda g: g[0], reverse=True)
        for k, n, amt in grouped:
            text = STATE_LABELS.get(k) if kind == "summary" else BUCKETS.get(k) if kind == "aging" else _month_label(k) if kind == "monthly" else k
            lines.append({"label": text or NOT_SET, "count": n, "amount": amt, "state": k if kind == "summary" else ""})

    if p.get("format") == "csv":
        filename = f"{kind}-{month or 'all'}.csv"
        if key:
            return _csv(filename, ["Group", "Vouchers", "Amount"],
                        [[l["label"], l["count"], l["amount"]] for l in lines] + [["Total", len(scoped), total(scoped)]])
        return _csv(filename, list(FIELD_LABELS.values()), ([r[f] for f in FIELD_LABELS] for r in scoped))

    by_area = group(scoped, lambda r: label(r, "trade_area"))
    top = by_area[0][2] if by_area and by_area[0][2] else 1
    subtitle = " · ".join([
        _month_label(month), area or "all trade areas", STATE_LABELS.get(state, "all statuses").lower(),
        f"{len(scoped)} voucher{'s' if len(scoped) != 1 else ''}",
    ])
    return _page(
        request, "dashboard/reports.html", rows, error,
        nav="reports", title="Reports",
        kind=kind, report_name=name, reports=[(k, v[0]) for k, v in REPORTS.items()],
        month=month, months=[(m, _month_label(m)) for m in sorted({r["month"] for r in rows if r["month"]}, reverse=True)],
        area=area, areas=values(rows, "trade_area"), state=state, states=STATE_LABELS.items(),
        lines=lines, scoped=scoped, scoped_total=total(scoped), subtitle=subtitle,
        by_area=[(n, amt, round(100 * amt / top)) for n, _, amt in by_area],
        csv_url=_qs(p, format="csv"), generated=timezone.localtime(),
    )


# ---- settings ---------------------------------------------------------------------------

def settings_view(request):
    rows, error = _load(request)
    return _page(
        request, "dashboard/settings.html", rows, error,
        nav="settings", title="Settings",
        sheet_id=settings.GOOGLE_SHEET_ID, sheet_range=settings.GOOGLE_SHEET_RANGE,
        cache_seconds=sheets.CACHE_SECONDS,
    )
