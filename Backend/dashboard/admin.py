from django.contrib import admin
from django.template.response import TemplateResponse
from django.urls import path, reverse
from django.views.decorators.http import require_POST

from .sheets import EDITABLE_FIELDS, fetch_vouchers, update_voucher_row


def voucher_list_view(request):
    rows, error = fetch_vouchers(getattr(request, "google_token", None))
    context = admin.site.each_context(request)
    context.update({"title": "Disbursement Vouchers", "rows": rows, "error": error})
    return TemplateResponse(request, "admin/dashboard/vouchers.html", context)


@require_POST
def voucher_save_view(request, sheet_row):
    field_values = {name: request.POST.get(name, "") for name in EDITABLE_FIELDS}
    error = update_voucher_row(getattr(request, "google_token", None), sheet_row, field_values)
    row = {**field_values, "sheet_row": sheet_row}
    context = admin.site.each_context(request)
    context.update({"row": row, "error": error, "saved": error is None})
    return TemplateResponse(request, "admin/dashboard/partials/editable_row.html", context)


_get_urls = admin.site.get_urls


def get_urls():
    return [
        path("vouchers/", admin.site.admin_view(voucher_list_view), name="dashboard_vouchers"),
        path(
            "vouchers/<int:sheet_row>/save/",
            admin.site.admin_view(voucher_save_view),
            name="dashboard_voucher_save",
        ),
    ] + _get_urls()


admin.site.get_urls = get_urls

_get_app_list = admin.site.get_app_list


def get_app_list(request, app_label=None):
    app_list = _get_app_list(request, app_label=app_label)
    if app_label is None:
        app_list.insert(0, {
            "name": "Google Sheet",
            "app_label": "dashboard_sheet",
            "app_url": reverse("admin:dashboard_vouchers"),
            "has_module_perms": True,
            "models": [{
                "name": "Disbursement Vouchers",
                "object_name": "Vouchers",
                "perms": {"view": True, "change": True, "add": False, "delete": False},
                "admin_url": reverse("admin:dashboard_vouchers"),
                "add_url": None,
                "view_only": False,
            }],
        })
    return app_list


admin.site.get_app_list = get_app_list
