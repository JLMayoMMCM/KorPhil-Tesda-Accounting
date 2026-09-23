"""Derived voucher facts: parsed amounts/dates, urgency buckets, and group totals. Pure functions."""
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation

# Urgency buckets, most urgent first. "week" means due tomorrow through six days out.
BUCKETS = {
    "late30": "30+ days late",
    "late": "1–30 days late",
    "today": "Due today",
    "week": "Due this week",
    "later": "Not yet due",
    "paid": "Paid",
}
TABS = {
    "all": "All",
    "unpaid": "Unpaid",
    "overdue": "Overdue",
    "week": "Due this week",
    "paid": "Paid",
}
STATUSES = ["PENDING", "OVERDUE", "PAID"]
NOT_SET = "Not set"


def parse_date(value):
    try:
        return datetime.strptime(value.strip(), "%m/%d/%Y").date()
    except (ValueError, AttributeError):
        return None


def sheet_date(d):
    """date -> the sheet's own m/d/yyyy format."""
    return f"{d.month}/{d.day}/{d.year}"


def parse_amount(value):
    try:
        return Decimal((value or "").replace(",", "").replace("₱", "").strip() or "0")
    except InvalidOperation:
        return None


def enrich(rows, today):
    for r in rows:
        r["amount"] = parse_amount(r["gross_amount"]) or Decimal(0)
        r["dv"] = parse_date(r["dv_date"])
        r["due"] = parse_date(r["due_date"])
        status = r["status"].strip().upper()
        paid = status == "PAID"
        r["days_late"] = max((today - r["due"]).days, 0) if r["due"] and not paid else 0
        if paid:
            r["state"], r["bucket"] = "paid", "paid"
        elif r["days_late"] or status == "OVERDUE":
            r["state"] = "overdue"
            r["bucket"] = "late30" if r["days_late"] > 30 else "late"
        else:
            r["state"] = "pending"
            if r["due"] == today:
                r["bucket"] = "today"
            elif r["due"] and r["due"] <= today + timedelta(days=6):
                r["bucket"] = "week"
            else:
                r["bucket"] = "later"
        r["month"] = r["dv"].strftime("%Y-%m") if r["dv"] else ""
    rows.sort(key=lambda r: (r["due"] or date.max, r["dv_no"]))
    return rows


def in_tab(r, tab):
    return {
        "all": True,
        "unpaid": r["state"] != "paid",
        "overdue": r["state"] == "overdue",
        "week": r["bucket"] in ("today", "week"),
        "paid": r["state"] == "paid",
    }.get(tab, True)


def total(rows):
    return sum((r["amount"] for r in rows), Decimal(0))


def label(r, field):
    return r[field].strip() or NOT_SET


def group(rows, key):
    """[(label, count, amount)] for key(row), largest amount first."""
    out = {}
    for r in rows:
        n, amt = out.get(key(r), (0, Decimal(0)))
        out[key(r)] = (n + 1, amt + r["amount"])
    return sorted(((k, n, a) for k, (n, a) in out.items()), key=lambda g: -g[2])


def values(rows, field):
    """Distinct labels for a field, 'Not set' last."""
    found = sorted({label(r, field) for r in rows} - {NOT_SET})
    return found + [NOT_SET] if any(label(r, field) == NOT_SET for r in rows) else found


if __name__ == "__main__":
    def row(due, status, amount="1,000.50", dv="9/1/2026"):
        return {"gross_amount": amount, "dv_date": dv, "due_date": due, "status": status, "dv_no": due}

    today = date(2026, 9, 23)
    rs = enrich([
        row("8/1/2026", "PENDING"), row("9/20/2026", "PENDING"), row("9/23/2026", "PENDING"),
        row("9/29/2026", "PENDING"), row("9/30/2026", "PENDING"), row("9/1/2026", "PAID"),
        row("10/1/2026", "OVERDUE"), row("", "", amount="oops"),
    ], today)
    by_due = {r["due_date"]: r for r in rs}
    assert by_due["8/1/2026"]["bucket"] == "late30" and by_due["8/1/2026"]["days_late"] == 53
    assert by_due["9/20/2026"]["bucket"] == "late"
    assert by_due["9/23/2026"]["bucket"] == "today"
    assert by_due["9/29/2026"]["bucket"] == "week"
    assert by_due["9/30/2026"]["bucket"] == "later"
    assert by_due["9/1/2026"]["bucket"] == "paid" and by_due["9/1/2026"]["days_late"] == 0
    assert by_due["10/1/2026"]["state"] == "overdue"  # sheet says overdue even though not past due
    assert by_due[""]["amount"] == 0 and by_due[""]["bucket"] == "later"
    assert rs[-1]["due_date"] == ""  # undated sorts last
    assert total(rs) == Decimal("7003.50")
    assert parse_amount("₱ 89,021.00") == Decimal("89021.00") and parse_amount("x") is None
    assert sheet_date(date(2026, 9, 3)) == "9/3/2026"
    assert sum(in_tab(r, "week") for r in rs) == 2
    print("ledger ok")
