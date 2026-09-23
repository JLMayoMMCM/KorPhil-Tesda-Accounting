from django.contrib import admin
from django.urls import path

from dashboard import auth, views

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", views.index, name="index"),
    path("login/", auth.login_view, name="login"),
    path("login/google/", auth.auth_start, name="auth_start"),
    path("auth/callback/", auth.auth_callback, name="auth_callback"),
    path("logout/", auth.logout_view, name="logout"),
    path("vouchers/", views.vouchers, name="vouchers"),
    path("vouchers/new/", views.voucher_save, name="voucher_new"),
    path("vouchers/<int:sheet_row>/", views.voucher_save, name="voucher_save"),
    path("vouchers/paid/", views.mark_paid, name="mark_paid"),
    path("vouchers/export/", views.export, name="export"),
    path("areas/", views.areas, name="areas"),
    path("reports/", views.reports, name="reports"),
    path("settings/", views.settings_view, name="settings"),
    path("sync/", views.sync, name="sync"),
]
