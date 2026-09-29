import { NextResponse, type NextRequest } from "next/server"

import { cookieOptions, redirectUri, seal, STATE_COOKIE } from "@/lib/session"

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const SCOPES = "openid email profile https://www.googleapis.com/auth/spreadsheets"

/** Start Sign in with Google (authorization-code flow). */
export async function POST(request: NextRequest) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  if (!clientId || !process.env.GOOGLE_OAUTH_CLIENT_SECRET) return NextResponse.redirect(new URL("/login/", request.url), 303)
  const form = await request.formData()
  const state = crypto.randomUUID()
  const response = NextResponse.redirect(`${AUTH_URL}?${new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(request),
    response_type: "code",
    scope: SCOPES,
    state,
    access_type: "offline", // refresh token, so sessions outlive the 1-hour access token
    prompt: "select_account consent",
    include_granted_scopes: "true",
  })}`, 303)
  const tenMinutes = 600
  response.cookies.set(STATE_COOKIE, await seal({ state, next: String(form.get("next") ?? "") }, tenMinutes), cookieOptions(tenMinutes))
  return response
}
