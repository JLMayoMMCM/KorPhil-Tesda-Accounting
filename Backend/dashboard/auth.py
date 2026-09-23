"""Sign in with Google (OAuth 2.0 authorization-code flow).

The signed-in user's own Google token reads and writes the sheet, so the sheet's sharing
settings are the access list: people who can't open the sheet can't sign in, and people
with view-only access get a clear error when they try to save.
"""
import secrets
import time
from urllib.parse import urlencode

import requests
from django.conf import settings
from django.contrib.auth.decorators import login_not_required
from django.contrib.auth.middleware import AuthenticationMiddleware
from django.contrib.auth.models import AnonymousUser
from django.shortcuts import redirect, render
from django.urls import reverse
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.http import require_POST
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2 import id_token

from . import sheets

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
SCOPES = "openid email profile https://www.googleapis.com/auth/spreadsheets"
SESSION_KEY = "google_token"
USER_KEY = "google_user"


class GoogleUser:
    """The signed-in person, rebuilt from the session on every request. No database row."""
    is_authenticated = True
    is_anonymous = False
    is_active = True
    is_staff = is_superuser = False

    def __init__(self, data):
        self.email = self.username = self.pk = data["email"]
        self.first_name = data.get("first_name", "")
        self.last_name = data.get("last_name", "")
        self.picture = data.get("picture", "")

    def get_full_name(self):
        return f"{self.first_name} {self.last_name}".strip()

    def __str__(self):
        return self.email


def _configured():
    return bool(settings.GOOGLE_OAUTH_CLIENT_ID and settings.GOOGLE_OAUTH_CLIENT_SECRET)


def _redirect_uri(request):
    return request.build_absolute_uri(reverse("auth_callback"))


def _store(request, payload, refresh_token=None):
    token = request.session.get(SESSION_KEY, {})
    token.update(access_token=payload["access_token"], expires_at=time.time() + int(payload.get("expires_in", 3600)))
    if refresh_token or payload.get("refresh_token"):
        token["refresh_token"] = refresh_token or payload["refresh_token"]
    request.session[SESSION_KEY] = token


def access_token(request):
    """The signed-in user's Google access token, refreshed when it is about to expire. None if unavailable."""
    token = request.session.get(SESSION_KEY)
    if not token:
        return None
    if token["expires_at"] - time.time() < 60:
        if not token.get("refresh_token"):
            return None
        try:
            response = requests.post(TOKEN_URL, data={
                "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
                "client_secret": settings.GOOGLE_OAUTH_CLIENT_SECRET,
                "refresh_token": token["refresh_token"],
                "grant_type": "refresh_token",
            }, timeout=10)
            response.raise_for_status()
        except requests.RequestException:
            return None
        _store(request, response.json(), refresh_token=token["refresh_token"])
    return request.session[SESSION_KEY]["access_token"]


@login_not_required
def login_view(request):
    error = request.session.pop("login_error", None)
    if request.user.is_authenticated and not error:
        return redirect("index")
    return render(request, "auth/login.html", {
        "configured": _configured(),
        "error": error,
        "next": request.GET.get("next", ""),
        "redirect_uri": _redirect_uri(request),
    })


@login_not_required
@require_POST
def auth_start(request):
    if not _configured():
        return redirect("login")
    state = secrets.token_urlsafe(24)
    request.session["oauth_state"] = state
    request.session["oauth_next"] = request.POST.get("next", "")
    return redirect(AUTH_URL + "?" + urlencode({
        "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
        "redirect_uri": _redirect_uri(request),
        "response_type": "code",
        "scope": SCOPES,
        "state": state,
        "access_type": "offline",  # refresh token, so sessions outlive the 1-hour access token
        "prompt": "select_account consent",
        "include_granted_scopes": "true",
    }))


def _fail(request, message):
    request.session["login_error"] = message
    return redirect("login")


@login_not_required
def auth_callback(request):
    expected = request.session.pop("oauth_state", None)
    if not expected or not secrets.compare_digest(expected, request.GET.get("state", "")):
        return _fail(request, "The sign-in link expired. Try again.")
    if request.GET.get("error"):
        return _fail(request, "Google sign-in was cancelled." if request.GET["error"] == "access_denied"
                     else f'Google sign-in failed ({request.GET["error"]}).')

    try:
        response = requests.post(TOKEN_URL, data={
            "code": request.GET.get("code", ""),
            "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
            "client_secret": settings.GOOGLE_OAUTH_CLIENT_SECRET,
            "redirect_uri": _redirect_uri(request),
            "grant_type": "authorization_code",
        }, timeout=10)
        response.raise_for_status()
        payload = response.json()
        claims = id_token.verify_oauth2_token(payload["id_token"], GoogleAuthRequest(), settings.GOOGLE_OAUTH_CLIENT_ID)
    except (requests.RequestException, ValueError, KeyError):
        return _fail(request, "Couldn't finish signing in with Google. Try again.")

    email = claims.get("email", "")
    if not claims.get("email_verified"):
        return _fail(request, "That Google account's email isn't verified.")
    if "spreadsheets" not in payload.get("scope", ""):
        return _fail(request, "Allow access to Google Sheets when Google asks. The app needs it to read and save vouchers.")

    error = sheets.check_access(payload["access_token"])
    if error:
        return _fail(request, f"{email} {error}")

    next_url = request.session.pop("oauth_next", "")
    request.session.cycle_key()  # new session on sign-in (session fixation)
    request.session[USER_KEY] = {
        "email": email,
        "first_name": claims.get("given_name", ""),
        "last_name": claims.get("family_name", ""),
        "picture": claims.get("picture", ""),
    }
    _store(request, payload)

    if next_url and url_has_allowed_host_and_scheme(next_url, {request.get_host()}, request.is_secure()):
        return redirect(next_url)
    return redirect("index")


@require_POST
def logout_view(request):
    request.session.flush()
    return redirect("login")


class GoogleAuthMiddleware(AuthenticationMiddleware):
    """Set request.user from the session and request.google_token from the stored Google token.

    Stands in for Django's AuthenticationMiddleware (subclassed so LoginRequiredMiddleware's check passes):
    there is no user table, the app runs database-free on Vercel.
    A session whose Google token can't be refreshed is ended.
    """
    def process_request(self, request):
        data = request.session.get(USER_KEY)
        request.user = GoogleUser(data) if data else AnonymousUser()
        request.google_token = access_token(request) if data else None
        if data and request.google_token is None:
            request.session.flush()
            request.user = AnonymousUser()
            request.session["login_error"] = "Your Google session ended. Sign in again."
            return redirect(f'{reverse("login")}?{urlencode({"next": request.get_full_path()})}')
        return None
